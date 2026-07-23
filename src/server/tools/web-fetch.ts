import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

import { z } from 'zod'

import type { ToolDef } from './types'

const DEFAULT_MAX_CHARS = 12_000
const MIN_MAX_CHARS = 1
const MAX_MAX_CHARS = 20_000
const DEFAULT_TIMEOUT_MS = 10_000
const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 30_000
const MAX_RESPONSE_BYTES = 1_000_000
const MAX_REDIRECTS = 3

const ArgsSchema = z
  .object({
    url: z.string().min(1),
    maxChars: z.number().int().optional(),
    timeoutMs: z.number().int().optional(),
  })
  .strict()

const TEXT_CONTENT_TYPES = [
  'text/',
  'application/json',
  'application/xml',
  'application/xhtml+xml',
  'application/javascript',
  'application/x-javascript',
  'application/x-yaml',
  'application/yaml',
]

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'instance-data.ec2.internal',
])

const BLOCKED_METADATA_IPS = new Set(['169.254.169.254', '168.63.129.16'])

interface WebFetchArgs {
  url: string
  maxChars?: number
  timeoutMs?: number
}

export interface WebFetchResult {
  url: string
  finalUrl: string
  status: number
  contentType: string
  title?: string
  text: string
  truncated: boolean
  bytesRead: number
}

type LookupImpl = (hostname: string, options: { all: true }) => Promise<Array<{ address: string }>>

interface FetchWebUrlOptions {
  fetchImpl?: typeof fetch
  lookupImpl?: LookupImpl
  abortSignal?: AbortSignal
}

export const webFetchTool: ToolDef = {
  name: 'web_fetch',
  description:
    'Fetch a public HTTPS web page through AgentHub safety checks. Only GET is supported. Localhost, private IP ranges, link-local addresses, metadata endpoints, credentials, non-HTTPS URLs, and binary responses are blocked. Returns extracted text with size limits.',
  parameters: {
    type: 'object',
    required: ['url'],
    properties: {
      url: {
        type: 'string',
        description: 'Public HTTPS URL to fetch. http://, localhost, private IPs, and credentials are rejected.',
      },
      maxChars: {
        type: 'integer',
        minimum: MIN_MAX_CHARS,
        maximum: MAX_MAX_CHARS,
        description: `Maximum number of text characters to return. Defaults to ${DEFAULT_MAX_CHARS}.`,
      },
      timeoutMs: {
        type: 'integer',
        minimum: MIN_TIMEOUT_MS,
        maximum: MAX_TIMEOUT_MS,
        description: `Request timeout in milliseconds. Defaults to ${DEFAULT_TIMEOUT_MS}.`,
      },
    },
    additionalProperties: false,
  },
  async handler(args, ctx) {
    const parsed = ArgsSchema.safeParse(args)
    if (!parsed.success) return { ok: false, error: `Invalid args: ${parsed.error.message}` }

    try {
      const result = await fetchWebUrl(parsed.data, { abortSignal: ctx.abortSignal })
      return { ok: true, value: result }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}

export async function fetchWebUrl(args: WebFetchArgs, options: FetchWebUrlOptions = {}): Promise<WebFetchResult> {
  const maxChars = clamp(args.maxChars ?? DEFAULT_MAX_CHARS, MIN_MAX_CHARS, MAX_MAX_CHARS)
  const timeoutMs = clamp(args.timeoutMs ?? DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
  const fetchImpl = options.fetchImpl ?? fetch
  const lookupImpl = options.lookupImpl ?? lookupAll
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error(`web_fetch timed out after ${timeoutMs}ms`)), timeoutMs)
  const abort = () => controller.abort(options.abortSignal?.reason ?? new Error('web_fetch aborted'))

  if (options.abortSignal?.aborted) abort()
  options.abortSignal?.addEventListener('abort', abort, { once: true })

  try {
    const initialUrl = await validateFetchUrl(args.url, lookupImpl)
    let currentUrl = initialUrl

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const response = await fetchImpl(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
      })

      if (isRedirectStatus(response.status)) {
        if (redirectCount === MAX_REDIRECTS) throw new Error(`web_fetch exceeded ${MAX_REDIRECTS} redirects`)
        const location = response.headers.get('location')
        if (!location) throw new Error(`web_fetch redirect from ${currentUrl.href} is missing Location header`)
        currentUrl = await validateFetchUrl(new URL(location, currentUrl).toString(), lookupImpl)
        continue
      }

      const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
      if (!isTextContentType(contentType)) {
        throw new Error(`web_fetch only supports text responses; got content-type ${contentType || 'unknown'}`)
      }

      const { text: rawText, bytesRead, truncated: byteTruncated } = await readResponseText(response, controller.signal)
      const extracted = extractReadableText(rawText, contentType)
      const charTruncated = extracted.text.length > maxChars
      const text = charTruncated ? extracted.text.slice(0, maxChars) : extracted.text

      return {
        url: initialUrl.toString(),
        finalUrl: currentUrl.toString(),
        status: response.status,
        contentType,
        ...(extracted.title ? { title: extracted.title } : {}),
        text,
        truncated: byteTruncated || charTruncated,
        bytesRead,
      }
    }

    throw new Error('web_fetch redirect handling failed')
  } catch (err) {
    if (isAbortError(err)) throw new Error('web_fetch aborted or timed out')
    throw err
  } finally {
    clearTimeout(timeout)
    options.abortSignal?.removeEventListener('abort', abort)
  }
}

export async function validateFetchUrl(input: string, lookupImpl: LookupImpl = lookupAll): Promise<URL> {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new Error('web_fetch URL is invalid')
  }

  if (url.protocol !== 'https:') throw new Error('web_fetch only supports https:// URLs')
  if (url.username || url.password) throw new Error('web_fetch URL credentials are not allowed')

  const hostname = normalizeHostname(url.hostname)
  if (!hostname) throw new Error('web_fetch URL hostname is required')
  assertAllowedHost(hostname)

  const ipVersion = isIP(hostname)
  if (ipVersion) {
    assertPublicIp(hostname)
    return url
  }

  let records: Array<{ address: string }>
  try {
    records = await lookupImpl(hostname, { all: true })
  } catch (err) {
    throw new Error(`web_fetch DNS lookup failed for ${hostname}: ${err instanceof Error ? err.message : String(err)}`)
  }

  const addresses = records.map((record) => record.address)
  if (addresses.length === 0) throw new Error(`web_fetch DNS lookup returned no addresses for ${hostname}`)
  for (const address of addresses) assertPublicIp(address)

  return url
}

export function extractReadableText(raw: string, contentType: string): { title?: string; text: string } {
  if (!contentType.includes('html')) {
    return { text: normalizeWhitespace(raw) }
  }

  const title = decodeHtmlEntities(raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim()
  const withoutNoise = raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
  const text = normalizeWhitespace(decodeHtmlEntities(withoutNoise.replace(/<[^>]+>/g, ' ')))

  return { ...(title ? { title: normalizeWhitespace(title) } : {}), text }
}

async function lookupAll(hostname: string, options: { all: true }): Promise<Array<{ address: string }>> {
  return dnsLookup(hostname, options)
}

function assertAllowedHost(hostname: string): void {
  const withoutTrailingDot = hostname.replace(/\.+$/, '')
  if (BLOCKED_HOSTS.has(withoutTrailingDot)) throw new Error(`web_fetch blocked restricted host: ${hostname}`)
  if (withoutTrailingDot.endsWith('.localhost')) throw new Error(`web_fetch blocked localhost host: ${hostname}`)
}

function assertPublicIp(address: string): void {
  const normalized = normalizeHostname(address)
  const version = isIP(normalized)
  if (!version) throw new Error(`web_fetch DNS returned invalid IP address: ${address}`)
  if (version === 4 && isBlockedIpv4(normalized)) throw new Error(`web_fetch blocked restricted IP address: ${address}`)
  if (version === 6 && isBlockedIpv6(normalized)) throw new Error(`web_fetch blocked restricted IP address: ${address}`)
}

function isBlockedIpv4(address: string): boolean {
  if (BLOCKED_METADATA_IPS.has(address)) return true
  const parts = address.split('.').map(Number)
  const [a, b] = parts
  if (a === undefined || b === undefined) return true

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase()
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('::ffff:')) return isBlockedIpv4(normalized.slice('::ffff:'.length))

  const first = firstIpv6Segment(normalized)
  if (first === null) return true
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00
}

function firstIpv6Segment(address: string): number | null {
  const first = address.split(':', 1)[0]
  if (!first) return 0
  const value = Number.parseInt(first, 16)
  return Number.isFinite(value) ? value : null
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '')
}

function isRedirectStatus(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status)
}

function isTextContentType(contentType: string): boolean {
  return TEXT_CONTENT_TYPES.some((allowed) => (allowed.endsWith('/') ? contentType.startsWith(allowed) : contentType === allowed))
}

async function readResponseText(response: Response, signal: AbortSignal): Promise<{ text: string; bytesRead: number; truncated: boolean }> {
  if (!response.body) {
    const text = await response.text()
    const bytesRead = new TextEncoder().encode(text).byteLength
    return { text, bytesRead, truncated: bytesRead > MAX_RESPONSE_BYTES }
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytesRead = 0
  let truncated = false

  while (true) {
    if (signal.aborted) throw signal.reason ?? new Error('web_fetch aborted')
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    const remaining = MAX_RESPONSE_BYTES - bytesRead
    if (remaining <= 0) {
      truncated = true
      break
    }

    if (value.byteLength > remaining) {
      chunks.push(value.slice(0, remaining))
      bytesRead += remaining
      truncated = true
      break
    }

    chunks.push(value)
    bytesRead += value.byteLength
  }

  await reader.cancel().catch(() => undefined)
  return { text: new TextDecoder('utf-8', { fatal: false }).decode(concatBytes(chunks, bytesRead)), bytesRead, truncated }
}

function concatBytes(chunks: Uint8Array[], length: number): Uint8Array {
  const output = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}
