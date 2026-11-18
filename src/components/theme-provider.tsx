'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

import { DEFAULT_THEME, THEME_STORAGE_KEY, isValidThemeId, type ThemeId } from '@/lib/themes'

/**
 * 主题 Provider。两件事分开管：
 *
 * - 明暗：基于 next-themes，用 class 切换（.dark 加在 html），
 *   defaultTheme='system' 跟随系统配色，并允许用户在头部 toggle 中手动切换。
 * - 主题（六套）：走 <html> 的 `data-theme` 属性 + localStorage `agenthub-theme`。
 *   内联防闪脚本（layout.tsx <head>）在绘制前已写好 data-theme；这里读
 *   `document.documentElement.dataset.theme` 作初始值，与脚本一致，防 hydration mismatch。
 *   `setTheme` 同时写 attribute + localStorage + state，整站 CSS 变量即时切换，无需刷新。
 */
const ThemeChoiceContext = createContext<{ theme: ThemeId; setTheme: (theme: ThemeId) => void } | null>(null)

function readInitialTheme(): ThemeId {
  if (typeof document === 'undefined') return DEFAULT_THEME
  const value = document.documentElement.dataset.theme
  return isValidThemeId(value) ? value : DEFAULT_THEME
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(readInitialTheme)

  const setTheme = useCallback((next: ThemeId) => {
    if (!isValidThemeId(next)) return
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // 无痕/存储被禁时主题仍可当次生效，只是不持久化。
    }
    setThemeState(next)
  }, [])

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ThemeChoiceContext.Provider value={{ theme, setTheme }}>
        {children}
      </ThemeChoiceContext.Provider>
    </NextThemesProvider>
  )
}

/** 在 ThemeProvider 内读取当前主题并切换。Provider 外调用会抛错。 */
export function useThemeChoice(): { theme: ThemeId; setTheme: (theme: ThemeId) => void } {
  const context = useContext(ThemeChoiceContext)
  if (!context) throw new Error('useThemeChoice must be used within ThemeProvider')
  return context
}
