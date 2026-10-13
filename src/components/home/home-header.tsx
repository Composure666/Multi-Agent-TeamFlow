'use client'

import { ArrowRight, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { HOME_NAV } from '@/components/home/home-data'
import { WorkbenchLink } from '@/components/home/home-primitives'
import { ThemeToggle } from '@/components/theme-toggle'
import { buttonVariants } from '@/components/ui/button'
import { BRAND_NAME, BRAND_TAGLINE_EN } from '@/lib/brand'
import { cn } from '@/lib/utils'

const APP_MARK_URL = '/icons/agenthub-mark-32.png'

const linkBase =
  'rounded-lg px-3 py-2 text-sm font-medium text-slate-600 outline-none transition-colors hover:bg-[var(--agenthub-accent-soft)] hover:text-[var(--agenthub-accent)] focus-visible:ring-2 focus-visible:ring-[var(--agenthub-accent)]/30 dark:text-slate-300'

/**
 * 项目主页顶部导航。
 *
 * 与工作台的两个差异点：
 *  1. 工作台是应用内壳层（ElectronTitleBar + 侧栏），主页是独立长文档，所以这里自带 sticky 导航；
 *  2. 只有这里需要客户端状态（移动端抽屉、滚动后才上背景），其余分区都是服务端组件。
 */
export function HomeHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // 移动端抽屉打开时支持 Esc 关闭
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b',
        scrolled ? 'home-header border-[var(--agenthub-border)]' : 'border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-5 sm:px-6 lg:px-8">
        <a href="#top" className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--agenthub-accent)]/30">
          <span
            aria-hidden="true"
            className="size-8 shrink-0 rounded-lg bg-[#EAF2FF] bg-cover bg-center bg-no-repeat ring-1 ring-[var(--agenthub-border)]"
            style={{ backgroundImage: `url(${APP_MARK_URL})` }}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {BRAND_NAME}
            </span>
            <span className="hidden truncate text-[11px] leading-4 text-slate-500 sm:block dark:text-slate-400">
              {BRAND_TAGLINE_EN}
            </span>
          </span>
        </a>

        <nav aria-label="页面分区" className="ml-auto hidden items-center gap-0.5 md:flex">
          {HOME_NAV.map((item) => (
            <a key={item.href} href={item.href} className={linkBase}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 md:ml-3">
          <ThemeToggle />
          {/* 窄屏放不下「导航 + 主题 + CTA」三件套，所以 CTA 收进移动端抽屉，
              顶部只在 sm 以上直接露出，避免品牌名被挤到省略号。 */}
          <WorkbenchLink
            href="/"
            className={cn(
              buttonVariants({ variant: 'default', size: 'lg' }),
              'hidden h-9 gap-1.5 px-4 sm:inline-flex',
            )}
          >
            进入工作台
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </WorkbenchLink>
          <button
            type="button"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon-lg' }), 'md:hidden')}
            aria-label={menuOpen ? '关闭导航菜单' : '打开导航菜单'}
            aria-expanded={menuOpen}
            aria-controls="home-mobile-nav"
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav
          id="home-mobile-nav"
          aria-label="页面分区（移动端）"
          className="border-t border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] px-5 pb-5 pt-2 md:hidden"
        >
          <ul className="flex flex-col">
            {HOME_NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className={cn(linkBase, 'block py-2.5 text-[15px]')}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <WorkbenchLink
            href="/"
            className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'mt-3 h-10 w-full gap-1.5')}
          >
            进入工作台
            <ArrowRight className="size-4" aria-hidden="true" />
          </WorkbenchLink>
        </nav>
      )}
    </header>
  )
}
