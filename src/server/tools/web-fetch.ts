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

/**
 * 搜索引擎站点：结果页几乎必然反爬（302 到 http:// 的验证页），抓取只会空烧预算。
 * 命中时直接给出「改用 web_search」的可执行提示，而不是让模型怀疑自己 URL 写错了。
 */
const SEARCH_ENGINE_HOSTS = new Set([
  'baidu.com',
  'bing.com',
  'google.com',
  'sogou.com',
  'so.com',
  'sm.cn',
  'duckduckgo.com',
  'search.yahoo.com',
  'yandex.com',
  'yandex.ru',
  'ecosia.org',
  'brave.com',
])

export type WebFetchFailureKind =
  | 'invalid_url'
  | 'non_https_input'
  | 'non_https_redirect'
  | 'search_engine_result_page'
  | 'blocked_host'
  | 'blocked_ip'
  | 'dns_failure'
  | 'non_text_content'
  | 'redirect'
  | 'timeout'

/**
 * 带分类与修复建议的 web_fetch 错误。
 *
 * `hint` 是给模型看的「接下来该怎么做」。现场事故（子任务 19 次重试同一个 URL）的根因就是
 * 跟随重定向到 http:// 的验证页时复用了「入参必须是 https」那句文案，模型于是以为自己的
 * URL 写错了，反复换写法。分类之后，重定向类错误明确指向「这是目标站点的行为」。
 */
export class WebFetchError extends Error {
  readonly kind: WebFetchFailureKind
  readonly hint: string

  constructor(kind: WebFetchFailureKind, message: string, hint: string) {
    super(message)
    this.name = 'WebFetchError'
    this.kind = kind
    this.hint = hint
  }
}

/** 工具层统一格式化：把 message 与可执行提示拼成一条，模型读得到「怎么修」。 */
export function formatWebFetchError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (err instanceof WebFetchError && err.hint) return `${message}\n提示：${err.hint}`
  return message
}

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
      return { ok: false, error: formatWebFetchError(err) }
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
        if (redirectCount === MAX_REDIRECTS) {
          throw new WebFetchError(
            'redirect',
            `web_fetch exceeded ${MAX_REDIRECTS} redirects`,
            '跳转次数超过上限，通常是登录墙或反爬；请换一个来源，不要重复重试同一 URL。',
          )
        }
        const location = response.headers.get('location')
        if (!location) {
          throw new WebFetchError(
            'redirect',
            `web_fetch redirect from ${currentUrl.href} is missing Location header`,
            '目标站点返回了不完整的重定向，请换一个来源。',
          )
        }
        currentUrl = await validateFetchUrl(new URL(location, currentUrl).toString(), lookupImpl, {
          redirectedFrom: currentUrl.toString(),
        })
        continue
      }

      const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
      if (!isTextContentType(contentType)) {
        throw new WebFetchError(
          'non_text_content',
          `web_fetch only supports text responses; got content-type ${contentType || 'unknown'}`,
          '该 URL 返回的是二进制/媒体内容（图片、PDF、压缩包等），工具只提取文本；请换 HTML 或文本页面。',
        )
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

export interface ValidateFetchUrlOptions {
  /** 本次校验来自哪一次重定向。给出后，非 https 会被归类为「目标站点跳转」而不是「入参写错」。 */
  redirectedFrom?: string
}

export async function validateFetchUrl(
  input: string,
  lookupImpl: LookupImpl = lookupAll,
  options: ValidateFetchUrlOptions = {},
): Promise<URL> {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new WebFetchError(
      'invalid_url',
      'web_fetch URL is invalid',
      '请传入完整 URL，例如 https://example.com/article。',
    )
  }

  if (url.protocol !== 'https:') throw buildNonHttpsError(url, options.redirectedFrom)
  if (url.username || url.password) throw new Error('web_fetch URL credentials are not allowed')

  // 只拦「入参」阶段的搜索引擎 URL：重定向落到的页面另行判断，不在这里误伤。
  if (!options.redirectedFrom) {
    const engineHost = detectSearchEngineHost(url)
    if (engineHost) throw buildSearchEngineError(url, engineHost)
  }

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

function buildNonHttpsError(url: URL, redirectedFrom?: string): WebFetchError {
  if (redirectedFrom) {
    return new WebFetchError(
      'non_https_redirect',
      `web_fetch blocked a redirect to a non-HTTPS URL: ${url.toString()} (redirected from ${redirectedFrom})`,
      '这是目标站点的行为，不是你入参 URL 写错了：该站点把请求 302 到了 http:// 的验证/反爬页面。' +
        '反复改写同一个 URL 重试一定还是失败 —— 需要联网检索请改用 web_search，或换一个可直接访问的 https:// 来源。',
    )
  }
  return new WebFetchError(
    'non_https_input',
    'web_fetch only supports https:// URLs',
    '入参 URL 必须以 https:// 开头；如果拿到的是 http:// 或 API 端点地址，请换成对应的 https:// 页面地址。',
  )
}

function buildSearchEngineError(url: URL, engineHost: string): WebFetchError {
  return new WebFetchError(
    'search_engine_result_page',
    `web_fetch blocked a search engine result page: ${engineHost}`,
    '搜索引擎结果页普遍反爬（会 302 到要求浏览器验证的页面），抓不到有用内容。' +
      '需要联网检索请改用 web_search 工具；若当前 Agent 没有 web_search，请直接说明无法联网，不要反复重构搜索 URL。',
  )
}

function detectSearchEngineHost(url: URL): string | null {
  const host = normalizeHostname(url.hostname)
  const engine = [...SEARCH_ENGINE_HOSTS].find((candidate) => host === candidate || host.endsWith(`.${candidate}`))
  if (!engine) return null

  // 只拦「搜索结果页」：带查询参数，或路径本身就是搜索入口。
  // 同域下的文章页（如 news.sogou.com/article/1）不拦 —— 那些是正常可抓的页面。
  const paramNames = [...url.searchParams.keys()].map((key) => key.toLowerCase())
  const hasSearchParam = paramNames.some((key) =>
    ['q', 'wd', 'word', 'query', 'p', 'kw', 'keyword', 'text', 'w'].includes(key),
  )
  const looksLikeSearchPath = /(^|\/)(search|s|web|so|results?)(\/|$)/i.test(url.pathname)
  return hasSearchParam || looksLikeSearchPath ? host : null
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
  if (BLOCKED_HOSTS.has(withoutTrailingDot)) {
    throw new WebFetchError(
      'blocked_host',
      `web_fetch blocked restricted host: ${hostname}`,
      '该主机属于内网/云元数据端点，是安全边界，无法访问；请换公开站点。',
    )
  }
  if (withoutTrailingDot.endsWith('.localhost')) {
    throw new WebFetchError(
      'blocked_host',
      `web_fetch blocked localhost host: ${hostname}`,
      'localhost 属于安全边界，无法访问；请换公开站点。',
    )
  }
}

function assertPublicIp(address: string): void {
  const normalized = normalizeHostname(address)
  const version = isIP(normalized)
  if (!version) {
    throw new WebFetchError(
      'blocked_ip',
      `web_fetch DNS returned invalid IP address: ${address}`,
      '该域名解析结果不可用，请换一个来源。',
    )
  }
  if (version === 4 && isBlockedIpv4(normalized)) {
    throw new WebFetchError(
      'blocked_ip',
      `web_fetch blocked restricted IP address: ${address}`,
      '目标解析到内网/回环/保留地址，是安全边界，无法访问。',
    )
  }
  if (version === 6 && isBlockedIpv6(normalized)) {
    throw new WebFetchError(
      'blocked_ip',
      `web_fetch blocked restricted IP address: ${address}`,
      '目标解析到内网/回环/保留地址，是安全边界，无法访问。',
    )
  }
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
