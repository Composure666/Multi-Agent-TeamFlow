import { describe, expect, it } from 'vitest'

import {
  WebFetchError,
  extractReadableText,
  fetchWebUrl,
  formatWebFetchError,
  validateFetchUrl,
} from './web-fetch'

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }]
const privateLookup = async () => [{ address: '127.0.0.1', family: 4 }]

function response(body: string, init: ResponseInit = {}) {
  return new Response(body, init)
}

describe('web_fetch tool', () => {
  it('rejects non-HTTPS URLs and credentials', async () => {
    await expect(validateFetchUrl('http://example.com', publicLookup)).rejects.toThrow('https://')
    await expect(validateFetchUrl('https://user:pass@example.com', publicLookup)).rejects.toThrow('credentials')
  })

  it('blocks localhost, private IPs, link-local IPs, and metadata hosts', async () => {
    await expect(validateFetchUrl('https://localhost', publicLookup)).rejects.toThrow('restricted host')
    await expect(validateFetchUrl('https://127.0.0.1', publicLookup)).rejects.toThrow('restricted IP')
    await expect(validateFetchUrl('https://10.0.0.1', publicLookup)).rejects.toThrow('restricted IP')
    await expect(validateFetchUrl('https://169.254.169.254', publicLookup)).rejects.toThrow('restricted IP')
    await expect(validateFetchUrl('https://metadata.google.internal', publicLookup)).rejects.toThrow('restricted host')
  })

  it('blocks domains that resolve to private addresses', async () => {
    await expect(validateFetchUrl('https://example.com', privateLookup)).rejects.toThrow('restricted IP')
  })

  it('fetches text and extracts HTML title/content', async () => {
    const fetchImpl = async () =>
      response('<html><head><title>Example &amp; Test</title><script>bad()</script></head><body><h1>Hello</h1><p>World&nbsp;!</p></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })

    const result = await fetchWebUrl(
      { url: 'https://example.com/page', maxChars: 1000 },
      { fetchImpl, lookupImpl: publicLookup },
    )

    expect(result).toMatchObject({
      url: 'https://example.com/page',
      finalUrl: 'https://example.com/page',
      status: 200,
      contentType: 'text/html',
      title: 'Example & Test',
      truncated: false,
    })
    expect(result.text).toContain('Hello World !')
    expect(result.text).not.toContain('bad()')
  })

  it('follows redirects and validates each hop', async () => {
    const calls: string[] = []
    const fetchImpl = async (input: RequestInfo | URL) => {
      calls.push(String(input))
      if (calls.length === 1) {
        return response('', { status: 302, headers: { location: 'https://example.com/final' } })
      }
      return response('done', { status: 200, headers: { 'content-type': 'text/plain' } })
    }

    const result = await fetchWebUrl({ url: 'https://example.com/start' }, { fetchImpl, lookupImpl: publicLookup })

    expect(calls).toEqual(['https://example.com/start', 'https://example.com/final'])
    expect(result.finalUrl).toBe('https://example.com/final')
    expect(result.text).toBe('done')
  })

  it('blocks redirects to private addresses', async () => {
    const fetchImpl = async () => response('', { status: 302, headers: { location: 'https://127.0.0.1/admin' } })

    await expect(fetchWebUrl({ url: 'https://example.com/start' }, { fetchImpl, lookupImpl: publicLookup })).rejects.toThrow(
      'restricted IP',
    )
  })

  it('rejects non-text content types', async () => {
    const fetchImpl = async () => response('binary', { status: 200, headers: { 'content-type': 'image/png' } })

    await expect(fetchWebUrl({ url: 'https://example.com/image' }, { fetchImpl, lookupImpl: publicLookup })).rejects.toThrow(
      'only supports text',
    )
  })

  it('truncates returned text by maxChars', async () => {
    const fetchImpl = async () => response('abcdef', { status: 200, headers: { 'content-type': 'text/plain' } })

    const result = await fetchWebUrl({ url: 'https://example.com/text', maxChars: 3 }, { fetchImpl, lookupImpl: publicLookup })

    expect(result.text).toBe('abc')
    expect(result.truncated).toBe(true)
  })

  it('respects external abort signals', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl = async () => response('unused', { status: 200, headers: { 'content-type': 'text/plain' } })

    await expect(
      fetchWebUrl({ url: 'https://example.com/text' }, { fetchImpl, lookupImpl: publicLookup, abortSignal: controller.signal }),
    ).rejects.toThrow('aborted or timed out')
  })

  it('extracts basic text for non-HTML responses', () => {
    expect(extractReadableText(' {\n  "ok": true\n} ', 'application/json')).toEqual({ text: '{ "ok": true }' })
  })
})

describe('web_fetch failure classification', () => {
  it('classifies a non-HTTPS input as a caller-side URL problem', async () => {
    const error = await validateFetchUrl('http://example.com', publicLookup).catch((err: unknown) => err)

    expect(error).toBeInstanceOf(WebFetchError)
    expect((error as WebFetchError).kind).toBe('non_https_input')
    expect(formatWebFetchError(error)).toContain('https://')
    expect(formatWebFetchError(error)).toContain('提示：')
  })

  it('blames the target site — not the caller — when a redirect lands on http://', async () => {
    // 现场就是这种：so.com / sogou 的反爬把请求 302 到 http:// 的验证页
    const fetchImpl = async () =>
      response('', { status: 302, headers: { location: 'http://qcaptcha.so.com/verify' } })

    const error = await fetchWebUrl({ url: 'https://example.com/start' }, {
      fetchImpl,
      lookupImpl: publicLookup,
    }).catch((err: unknown) => err)

    expect(error).toBeInstanceOf(WebFetchError)
    expect((error as WebFetchError).kind).toBe('non_https_redirect')
    const formatted = formatWebFetchError(error)
    expect(formatted).toContain('redirected from https://example.com/start')
    expect(formatted).toContain('不是你入参 URL 写错了')
  })

  it('rejects search engine result pages and points at web_search', async () => {
    const fetchImpl = async () => response('unused', { status: 200, headers: { 'content-type': 'text/html' } })

    for (const url of [
      'https://www.baidu.com/s?wd=test',
      'https://www.bing.com/search?q=test',
      'https://www.sogou.com/web?query=test',
      'https://duckduckgo.com/html/?q=test',
    ]) {
      const error = await fetchWebUrl({ url }, { fetchImpl, lookupImpl: publicLookup }).catch((err: unknown) => err)
      expect(error).toBeInstanceOf(WebFetchError)
      expect((error as WebFetchError).kind).toBe('search_engine_result_page')
      expect(formatWebFetchError(error)).toContain('web_search')
    }
  })

  it('still allows fetching pages on sites that merely host search', async () => {
    const fetchImpl = async () => response('article body', { status: 200, headers: { 'content-type': 'text/html' } })

    const result = await fetchWebUrl({ url: 'https://news.sogou.com/article/1' }, {
      fetchImpl,
      lookupImpl: publicLookup,
    })

    expect(result.text).toBe('article body')
  })
})
