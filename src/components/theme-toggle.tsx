'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import { useThemeChoice } from '@/components/theme-provider'
import { THEMES, type ThemeId } from '@/lib/themes'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const MODE_OPTIONS = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
] as const

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, theme: mode, setTheme: setMode } = useTheme()
  const { theme: themeChoice, setTheme: setThemeChoice } = useThemeChoice()
  const [mounted, setMounted] = useState(false)

  // 避免 SSR / 首屏 hydration mismatch — 拿到主题后再渲染
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button size="icon" variant="ghost" className={cn(className)} disabled>
        <Sun className="size-4" />
      </Button>
    )
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={cn('group', className)}
          title={isDark ? '切到 Light Mode' : '切到 Dark Mode'}
          aria-label="切换主题"
        >
          {/* 外层 span 承接 hover / press 形变，内层图标承接 swap 入场动画 —— 分两个元素免得 transform 打架 */}
          <span className="inline-flex motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:group-hover:rotate-12 motion-safe:group-hover:scale-110 motion-safe:group-active:scale-90">
            {isDark ? (
              <Sun className="size-4 theme-toggle-icon motion-safe:transition-colors motion-safe:duration-200 group-hover:text-orange-500" />
            ) : (
              <Moon className="size-4 theme-toggle-icon motion-safe:transition-colors motion-safe:duration-200 group-hover:text-amber-500" />
            )}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>主题风格</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={themeChoice}
          onValueChange={(value) => setThemeChoice(value as ThemeId)}
        >
          {THEMES.map((item) => (
            <DropdownMenuRadioItem key={item.id} value={item.id} closeOnClick>
              <span
                aria-hidden="true"
                className="size-3.5 shrink-0 rounded-full ring-1 ring-black/15"
                style={{ backgroundColor: item.swatch.primary }}
              />
              <span className="min-w-0 flex-1 truncate">{item.nameZh}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>明暗</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mode ?? 'system'} onValueChange={(value) => setMode(value)}>
          {MODE_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} closeOnClick>
              <option.icon className="size-4 text-muted-foreground" aria-hidden="true" />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
