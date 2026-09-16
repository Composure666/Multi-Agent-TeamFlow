import { describe, expect, it, vi } from 'vitest'

import { parseSearchResponse, searchWeb } from './web-search'

const credentials = { apiKey: 'sk-test', origin: 'https://dashscope.aliyuncs.com' }

function jsonResponse(body: unknown, status = 200, statusText = 'OK') {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'content-type': 'application/json' },
  })
}

const samplePayload = {
  output: {
    choices: [
      {
        finish_reason: 'stop',
        message: { role: 'assistant', content: [{ text: '要点 A；要点 B。' }] },
      },
    ],
    search_info: {
      search_results: [
        { index: 1, title: '报道一', url: 'https://news.example.com/a', site_name: '示例新闻' },
        { index: 2, title: '报道一（重复）', url: 'https://news.example.com/a' },
        { index: 3, title: '报道二', url: 'https://news.example.com/b' },
        { index: 4, title: '没有 url 的条目', url: '' },
      ],
    },
  },
}

describe('parseSearchResponse', () => {
  it('extracts the answer and de-duplicates source URLs', () => {
    const result = parseSearchResponse(samplePayload, {
      query: '测试检索',
      model: 'qwen3.8-flash',
      depth: 'fast',
      maxSources: 6,
      maxChars: 4000,
    })

    expect(result.answer).toBe('要点 A；要点 B。')
    expect(result.sources).toEqual([
      { index: 1, title: '报道一', url: 'https://news.example.com/a', siteName: '示例新闻' },
      { index: 3, title: '报道二', url: 'https://news.example.com/b' },
    ])
    expect(result.truncated).toBe(false)
  })

  it('caps sources and truncates a long answer', () => {
    const result = parseSearchResponse(samplePayload, {
      query: 'q',
      model: 'qwen3.8-flash',
      depth: 'deep',
      maxSources: 1,
      maxChars: 3,
    })

    expect(result.sources).toHaveLength(1)
    expect(result.answer).toBe('要点 ')
    expect(result.truncated).toBe(true)
  })

  it('throws when the backend returns nothing usable', () => {
    expect(() =>
      parseSearchResponse(
        { output: { choices: [], search_info: { search_results: [] } } },
        { query: 'q', model: 'm', depth: 'fast', maxSources: 6, maxChars: 4000 },
      ),
    ).toThrow(/未返回可用结果/)
  })

  it('accepts a plain string content (non-array shape)', () => {
    const result = parseSearchResponse(
      { output: { choices: [{ message: { content: '纯字符串答案' } }] } },
      { query: 'q', model: 'm', depth: 'fast', maxSources: 6, maxChars: 4000 },
    )
    expect(result.answer).toBe('纯字符串答案')
    expect(result.sources).toEqual([])
  })
})

describe('searchWeb', () => {
  it('calls the DashScope native endpoint with enable_search and source reporting', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(samplePayload))

    const result = await searchWeb(
      { query: '阿里云 百炼 联网搜索', maxSources: 3, depth: 'deep' },
      { credentials, fetchImpl: fetchImpl as unknown as typeof fetch },
    )

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test')

    const body = JSON.parse(String(init.body)) as {
      model: string
      input: { messages: { content: string }[] }
      parameters: Record<string, unknown>
    }
    expect(body.model).toBe('qwen3.8-flash')
    expect(body.input.messages[0]?.content).toContain('阿里云 百炼 联网搜索')
    expect(body.parameters.enable_search).toBe(true)
    expect(body.parameters.enable_thinking).toBe(false)
    expect(body.parameters.search_options).toEqual({
      enable_source: true,
      enable_citation: true,
      search_strategy: 'max',
    })

    expect(result.sources).toHaveLength(2)
    expect(result.depth).toBe('deep')
  })

  it('uses turbo for fast depth and disables thinking to keep latency low', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(samplePayload))

    await searchWeb({ query: 'x' }, { credentials, fetchImpl: fetchImpl as unknown as typeof fetch })

    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body.parameters.search_options).toEqual({
      enable_source: true,
      enable_citation: true,
      search_strategy: 'turbo',
    })
    // 不关 thinking 时单次调用约 60s，工具会超时 —— 这是个回归护栏。
    expect(body.parameters.enable_thinking).toBe(false)
  })

  it('fails with an actionable message when no backend is configured', async () => {
    await expect(searchWeb({ query: 'x' }, { credentials: null })).rejects.toThrow(/BAILIAN_API_KEY/)
  })

  it('surfaces HTTP failures with status and body', async () => {
    const fetchImpl = vi.fn(async () => new Response('quota exceeded', { status: 429, statusText: 'Too Many Requests' }))

    const error = await searchWeb(
      { query: 'x' },
      { credentials, fetchImpl: fetchImpl as unknown as typeof fetch },
    ).catch((err: unknown) => err)

    expect(String(error)).toContain('HTTP 429')
    expect(String(error)).toContain('quota exceeded')
  })

  it('rejects an empty query', async () => {
    await expect(searchWeb({ query: '   ' }, { credentials })).rejects.toThrow(/non-empty query/)
  })
})
