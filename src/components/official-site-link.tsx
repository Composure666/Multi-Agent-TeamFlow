'use client'

import { Globe } from 'lucide-react'
import { useEffect, useState } from 'react'

import { fetchSiteLinks, type SiteLinksView } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * 工作台底栏的「官网」入口 —— 目标地址来自设置里的「官网」页。
 *
 * 两个刻意的设计：
 *  1. **未配置就整块不渲染**。宁可没有入口，也不要一个点开 404 的死链；
 *     这个判断放在这里，调用方（桌面导航 / 移动端抽屉）不需要再各判一次。
 *  2. 用 `<a target="_blank">` 而不是 `window.open`：右键能复制链接、中键能开新标签，
 *     而且在 Electron 里行为已经是对的 —— `electron/main.ts` 的 `setWindowOpenHandler`
 *     会把站外地址交给 `shell.openExternal`，即用系统默认浏览器打开，
 *     不会把整个应用导航走。
 *
 * 请求做了模块级缓存：底栏与移动端抽屉会各渲染一份，但一次页面加载只发一条请求。
 */
let cached: Promise<SiteLinksView> | null = null

function loadSiteLinks(): Promise<SiteLinksView> {
  cached ??= fetchSiteLinks().catch((err) => {
    // 失败就把缓存清掉，下次挂载可以重试；否则一次网络抖动会让入口永久消失。
    cached = null
    throw err
  })
  return cached
}

export function useOfficialWebsiteUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadSiteLinks()
      .then((links) => {
        if (!cancelled) setUrl(links.officialWebsiteUrl)
      })
      .catch((err) => console.error('[OfficialSiteLink] load site links failed', err))
    return () => {
      cancelled = true
    }
  }, [])

  return url
}

export function OfficialSiteLink({
  variant,
  compact = false,
  className,
}: {
  variant: 'sidebar' | 'drawer'
  compact?: boolean
  /** 调用方补的尺寸类。侧栏把它和「使用指南」并排成一行，需要 `flex-1` 才能等分。 */
  className?: string
}) {
  const url = useOfficialWebsiteUrl()
  if (!url) return null

  if (variant === 'drawer') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={cn(
          'flex min-h-10 w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-600 transition active:scale-[0.99] hover:border-slate-300 hover:bg-[#EEF4FF] dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:border-white/15 dark:hover:bg-neutral-800',
          className,
        )}
      >
        <Globe className="size-5 stroke-[2.1]" />
        <span className="min-w-0 flex-1 truncate">官网</span>
      </a>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white text-left text-slate-600 transition hover:border-slate-300 hover:bg-[#EEF4FF] hover:text-slate-900 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:border-white/15 dark:hover:bg-neutral-800 dark:hover:text-slate-100',
        compact ? 'justify-center px-2 py-2' : 'px-2 py-2',
        className,
      )}
      title="官网"
      aria-label="官网"
    >
      <Globe className="size-4 shrink-0" />
      {!compact && <span className="text-xs font-medium">官网</span>}
    </a>
  )
}
