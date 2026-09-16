import { z } from 'zod'

import {
  BAILIAN_PROVIDER_ID,
  BAILIAN_SEARCH_MODEL,
  DASHSCOPE_MULTIMODAL_GENERATION_PATH,
  isDashScopeBaseUrl,
} from '@/lib/llm-shared'

import type { ToolDef } from './types'

/**
 * web_search —— 面向 Agent 的联网检索工具。
 *
 * 后端固定为阿里云百炼（DashScope）原生 `multimodal-generation` 端点 + `enable_search`：
 * - 百炼的 OpenAI 兼容层虽然也接受 `enable_search`，但只返回「总结文本」，**拿不到来源 URL**；
 * - 原生端点携带 `search_options.enable_source` 时会在 `output.search_info.search_results[]`
 *   里回传结构化结果（title / url / site_name），正好给需要「可追溯出处」的调研类 Agent 用。
 *
 * 之所以要有这个工具：Agent 此前只能拿 web_fetch 去抓搜索引擎结果页，而搜索引擎普遍反爬
 * （302 到 http:// 的验证页），于是一个子任务能空烧掉 50+ 次 web_fetch、上百万 token。
 */

const DEFAULT_MAX_SOURCES = 6
const MIN_MAX_SOURCES = 1
const MAX_MAX_SOURCES = 10
const DEFAULT_MAX_CHARS = 4_000
const MIN_MAX_CHARS = 500
const MAX_MAX_CHARS = 12_000
const DEFAULT_TIMEOUT_MS = 40_000
const MIN_TIMEOUT_MS = 5_000
const MAX_TIMEOUT_MS = 120_000
const MAX_QUERY_CHARS = 500

const ArgsSchema = z
  .object({
    query: z.string().min(1).max(MAX_QUERY_CHARS),
    maxSources: z.number().int().optional(),
    maxChars: z.number().int().optional(),
    depth: z.enum(['fast', 'deep']).optional(),
    timeoutMs: z.number().int().optional(),
  })
  .strict()

export interface WebSearchArgs {
  query: string
  maxSources?: number
  maxChars?: number
  depth?: 'fast' | 'deep'
  timeoutMs?: number
}

export interface WebSearchSource {
  index: number
  title: string
  url: string
  siteName?: string
}

export interface WebSearchResult {
  query: string
  /** 模型基于检索结果给出的中文摘要/要点。 */
  answer: string
  sources: WebSearchSource[]
  model: string
  depth: 'fast' | 'deep'
  truncated: boolean
}

export interface WebSearchCredentials {
  apiKey: string
  /** DashScope 原生接入点（origin），例如 https://dashscope.aliyuncs.com */
  origin: string
}

export interface WebSearchOptions {
  /** 测试注入用；缺省时按 BAILIAN_API_KEY → DB bailian 供应商 的顺序解析。 */
  credentials?: WebSearchCredentials | null
  fetchImpl?: typeof fetch
  abortSignal?: AbortSignal
}

export const webSearchTool: ToolDef = {
  name: 'web_search',
  description:
    'Search the live web for up-to-date facts, news, market data, documentation or policies, and get back a synthesized answer plus a list of source URLs. Use this whenever the task depends on information that may be newer than your training data, or on facts you cannot verify from the provided context. This is the ONLY supported way to search: do not fetch search-engine result pages (baidu/bing/google/sogou/so.com/duckduckgo) with web_fetch, they are blocked by anti-bot pages. Follow up with web_fetch on a returned source URL when you need the full article text.',
  parameters: {
    type: 'object',
    required: ['query'],
    properties: {
      query: {
        type: 'string',
        description: `Natural-language search query, up to ${MAX_QUERY_CHARS} characters. Write it like a search phrase (keywords + entities + time range), not like a question to yourself.`,
      },
      maxSources: {
        type: 'integer',
        minimum: MIN_MAX_SOURCES,
        maximum: MAX_MAX_SOURCES,
        description: `Maximum number of source links to return. Defaults to ${DEFAULT_MAX_SOURCES}.`,
      },
      maxChars: {
        type: 'integer',
        minimum: MIN_MAX_CHARS,
        maximum: MAX_MAX_CHARS,
        description: `Approximate maximum characters for the answer text. Defaults to ${DEFAULT_MAX_CHARS}.`,
      },
      depth: {
        type: 'string',
        enum: ['fast', 'deep'],
        description:
          "Search effort. 'fast' (default) is a single-pass lookup, good for facts and quick checks. 'deep' fans out more queries/pages and is better for research reports, but costs more time.",
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
      const result = await searchWeb(parsed.data, { abortSignal: ctx.abortSignal })
      return { ok: true, value: result }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}

export async function searchWeb(args: WebSearchArgs, options: WebSearchOptions = {}): Promise<WebSearchResult> {
  const query = args.query.trim()
  if (!query) throw new Error('web_search requires a non-empty query')

  const maxSources = clamp(args.maxSources ?? DEFAULT_MAX_SOURCES, MIN_MAX_SOURCES, MAX_MAX_SOURCES)
  const maxChars = clamp(args.maxChars ?? DEFAULT_MAX_CHARS, MIN_MAX_CHARS, MAX_MAX_CHARS)
  const timeoutMs = clamp(args.timeoutMs ?? DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
  const depth = args.depth ?? 'fast'

  const rawCredentials = options.credentials !== undefined ? options.credentials : await resolveWebSearchCredentials()
  if (!rawCredentials) {
    throw new Error(
      'web_search 没有可用的搜索后端：请在「设置 - 供应商」里配置阿里云百炼（bailian）的 API Key，' +
        '或设置环境变量 BAILIAN_API_KEY。配置完成后无需重启即可生效。',
    )
  }
  const credentials = rawCredentials

  const fetchImpl = options.fetchImpl ?? fetch
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(new Error(`web_search timed out after ${timeoutMs}ms`)),
    timeoutMs,
  )
  const abort = () => controller.abort(options.abortSignal?.reason ?? new Error('web_search aborted'))

  if (options.abortSignal?.aborted) abort()
  options.abortSignal?.addEventListener('abort', abort, { once: true })

  try {
    const response = await fetchImpl(`${credentials.origin}${DASHSCOPE_MULTIMODAL_GENERATION_PATH}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${credentials.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: BAILIAN_SEARCH_MODEL,
        input: {
          messages: [
            {
              role: 'user',
              content:
                `${query}\n\n` +
                '请基于联网检索到的资料，用中文简明扼要地回答上面的检索意图，' +
                '只陈述检索到的确定事实并标注时间范围；资料不足时直接说明，不要编造。',
            },
          ],
        },
        parameters: {
          enable_search: true,
          search_options: {
            enable_source: true,
            enable_citation: true,
            // 默认 turbo（快）；deep 用 max 扩大检索范围。实测两者都受支持。
            search_strategy: depth === 'deep' ? 'max' : 'turbo',
          },
          result_format: 'message',
          max_tokens: 2_000,
          // 搜索只需要「复述检索到的事实」，不需要长链推理。
          // 实测：不关 thinking 单次约 60s，关掉后约 8-10s —— 直接决定这个工具是否可用。
          enable_thinking: false,
        },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `web_search 请求失败：HTTP ${response.status} ${response.statusText}${
          body ? ` — ${truncate(body, 400)}` : ''
        }`,
      )
    }

    const payload: unknown = await response.json()
    return parseSearchResponse(payload, { query, model: BAILIAN_SEARCH_MODEL, depth, maxSources, maxChars })
  } catch (err) {
    if (isAbortError(err) || controller.signal.aborted) {
      throw new Error('web_search aborted or timed out')
    }
    throw err
  } finally {
    clearTimeout(timeout)
    options.abortSignal?.removeEventListener('abort', abort)
  }
}

interface ParseContext {
  query: string
  model: string
  depth: 'fast' | 'deep'
  maxSources: number
  maxChars: number
}

export function parseSearchResponse(payload: unknown, ctx: ParseContext): WebSearchResult {
  const output = readRecord(readRecord(payload)?.output)
  const choices = output ? output.choices : undefined
  const firstChoice = Array.isArray(choices) ? readRecord(choices[0]) : undefined
  const message = firstChoice ? readRecord(firstChoice.message) : undefined

  const rawAnswer = extractTextContent(message?.content)
  const truncated = rawAnswer.length > ctx.maxChars
  const answer = truncated ? rawAnswer.slice(0, ctx.maxChars) : rawAnswer

  const sources = extractSources(output)

  if (!answer && sources.length === 0) {
    throw new Error(
      'web_search 未返回可用结果（接入点返回了空 response）。如果刚刚才配置百炼 Key，请确认 Key 有效且账户已开通联网搜索。',
    )
  }

  return {
    query: ctx.query,
    answer,
    sources: sources.slice(0, ctx.maxSources),
    model: ctx.model,
    depth: ctx.depth,
    truncated,
  }
}

function extractSources(output: Record<string, unknown> | null): WebSearchSource[] {
  const searchInfo = output ? readRecord(output.search_info) : null
  const raw = searchInfo?.search_results
  if (!Array.isArray(raw)) return []

  const sources: WebSearchSource[] = []
  for (const item of raw) {
    const record = readRecord(item)
    if (!record) continue
    const url = typeof record.url === 'string' ? record.url.trim() : ''
    const title = typeof record.title === 'string' ? record.title.trim() : ''
    if (!url) continue
    const index = typeof record.index === 'number' ? record.index : sources.length + 1
    const siteName = typeof record.site_name === 'string' ? record.site_name.trim() : ''
    sources.push({ index, title: title || url, url, ...(siteName ? { siteName } : {}) })
  }
  return dedupeSources(sources)
}

function dedupeSources(sources: WebSearchSource[]): WebSearchSource[] {
  const seen = new Set<string>()
  return sources.filter((source) => {
    if (seen.has(source.url)) return false
    seen.add(source.url)
    return true
  })
}

/** DashScope 的 message.content 可能是 string，也可能是 `[{ text }]` 分块数组。 */
function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''

  const parts: string[] = []
  for (const block of content) {
    if (typeof block === 'string') {
      parts.push(block)
      continue
    }
    const record = readRecord(block)
    if (record && typeof record.text === 'string') parts.push(record.text)
  }
  return parts.join('\n').trim()
}

/**
 * 解析搜索后端的凭证。
 *
 * 顺序：环境变量 BAILIAN_API_KEY → DB 里 id=bailian 的供应商行。DB 查询失败或被裁剪
 * 都不该让工具崩溃，静默退化成「没配后端」的错误提示。
 */
export async function resolveWebSearchCredentials(): Promise<WebSearchCredentials | null> {
  const envKey = process.env.BAILIAN_API_KEY?.trim()
  if (envKey) {
    const baseUrl = process.env.BAILIAN_BASE_URL?.trim() || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    const origin = dashScopeOrigin(baseUrl)
    if (origin) return { apiKey: envKey, origin }
  }

  try {
    const { db, schema } = await import('@/db/client')
    const { eq } = await import('drizzle-orm')
    const rows = await db
      .select({ apiKey: schema.llmProviders.apiKey, baseUrl: schema.llmProviders.baseUrl })
      .from(schema.llmProviders)
      .where(eq(schema.llmProviders.id, BAILIAN_PROVIDER_ID))
      .limit(1)

    const row = rows[0]
    const key = row?.apiKey?.trim()
    if (!key) return null
    const origin = dashScopeOrigin(row?.baseUrl ?? '') ?? dashScopeOrigin('https://dashscope.aliyuncs.com/compatible-mode/v1')
    if (!origin) return null
    return { apiKey: key, origin }
  } catch (err) {
    console.warn('[web_search] failed to resolve bailian credentials from DB', err)
    return null
  }
}

function dashScopeOrigin(baseUrl: string): string | null {
  if (!baseUrl.trim()) return null
  if (!isDashScopeBaseUrl(baseUrl)) return null
  try {
    return new URL(baseUrl).origin
  } catch {
    return null
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
}
