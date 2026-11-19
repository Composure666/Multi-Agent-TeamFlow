import { useEffect, useState } from 'react'

/** Tailwind `xl` 断点（≥1280px）的反面：详情侧栏只在 xl 以上以内联侧栏呈现，低于它改走 Dialog。 */
export const BELOW_XL_MEDIA_QUERY = '(max-width: 1279px)'

/** Tailwind `lg` 断点（≥1024px）的反面：经验侧栏只在 lg 以上以内联侧栏呈现，低于它改走 Dialog。 */
export const BELOW_LG_MEDIA_QUERY = '(max-width: 1023px)'

/**
 * 纯函数：当前是否命中 media query。
 * - SSR / 无 window / 无 matchMedia 时返回 false（不抛错），与 hook 的服务端初值一致。
 * - matchMedia 抛错时同样回退 false。
 */
export function getMediaQueryMatches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia(query).matches
  } catch {
    return false
  }
}

/**
 * 最小 media-query hook（D1 用）。
 * - 初值 false：服务端渲染与客户端首帧一致，不产生 hydration mismatch；挂载后 effect 再同步真实值。
 * - 视口变化时跟随更新；不要用 CSS 媒体查询去开关 Dialog 挂载。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mediaQueryList = window.matchMedia(query)
    const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    setMatches(mediaQueryList.matches)
    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleChange)
      return () => mediaQueryList.removeEventListener('change', handleChange)
    }
    mediaQueryList.addListener(handleChange)
    return () => mediaQueryList.removeListener(handleChange)
  }, [query])

  return matches
}

/** 是否低于 xl 断点（<1280px）：详情侧栏改走 Dialog 的判断条件。 */
export function useIsBelowXl(): boolean {
  return useMediaQuery(BELOW_XL_MEDIA_QUERY)
}

/** 是否低于 lg 断点（<1024px）：经验侧栏改走 Dialog 的判断条件。 */
export function useIsBelowLg(): boolean {
  return useMediaQuery(BELOW_LG_MEDIA_QUERY)
}
