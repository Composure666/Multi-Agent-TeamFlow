import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BELOW_XL_MEDIA_QUERY, getMediaQueryMatches, useIsBelowXl, useMediaQuery } from './use-media-query'

function stubMatchMedia(matches: boolean) {
  const mediaQueryList = {
    matches,
    media: BELOW_XL_MEDIA_QUERY,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => false,
  }
  vi.stubGlobal('window', { matchMedia: vi.fn(() => mediaQueryList) })
  return mediaQueryList
}

function Probe() {
  const belowXl = useIsBelowXl()
  const narrow = useMediaQuery('(max-width: 767px)')
  return createElement('span', null, belowXl ? 'below-xl' : 'xl-or-above', '|', narrow ? 'narrow' : 'wide')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('use-media-query', () => {
  it('xl 断点查询是 max-width: 1279px（Tailwind xl = ≥1280px 的反面）', () => {
    expect(BELOW_XL_MEDIA_QUERY).toBe('(max-width: 1279px)')
  })

  it('无 window 时 getMediaQueryMatches 返回 false，不抛错', () => {
    expect(typeof window).toBe('undefined')
    expect(getMediaQueryMatches(BELOW_XL_MEDIA_QUERY)).toBe(false)
  })

  it('matchMedia 命中时返回 true，未命中时返回 false', () => {
    stubMatchMedia(true)
    expect(getMediaQueryMatches(BELOW_XL_MEDIA_QUERY)).toBe(true)
    stubMatchMedia(false)
    expect(getMediaQueryMatches(BELOW_XL_MEDIA_QUERY)).toBe(false)
  })

  it('matchMedia 抛错时回退 false', () => {
    vi.stubGlobal('window', {
      matchMedia: () => {
        throw new Error('matchMedia 不可用')
      },
    })
    expect(getMediaQueryMatches(BELOW_XL_MEDIA_QUERY)).toBe(false)
  })

  it('hook 服务端初值恒为 false（不读 window，不产生 hydration mismatch）', () => {
    stubMatchMedia(true)
    const html = renderToString(createElement(Probe))
    expect(html).toContain('xl-or-above')
    expect(html).toContain('wide')
    expect(html).not.toContain('below-xl')
    expect(html).not.toContain('narrow')
  })

  it('hook 服务端渲染不依赖 matchMedia 也能跑', () => {
    vi.stubGlobal('window', {})
    const html = renderToString(createElement(Probe))
    expect(html).toContain('xl-or-above')
    expect(html).toContain('wide')
  })
})
