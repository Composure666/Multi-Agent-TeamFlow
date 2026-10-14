'use client'

import { ArrowRight, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { HOME_NAV } from '@/components/home/home-data'
import { ThemeToggle } from '@/components/theme-toggle'
import { buttonVariants } from '@/components/ui/button'
import { BRAND_NAME, BRAND_TAGLINE_EN } from '@/lib/brand'
import { cn } from '@/lib/utils'

const APP_MARK_URL = '/icons/agenthub-mark-32.png'

/**
 * 顶栏 CTA —— 目标必须是访客真的能到达的地方。
 *
 * ❗ 不要改回 `/`。`/` 在工作台应用本体里当然是入口，但**对外托管部署**时它在
 * nginx `auth_basic` 后面：匿名访客点下去只会弹浏览器原生 Basic 登录框，那是模态窗口、
 * 会吞掉整页的鼠标 / 键盘 / 滚轮事件，而控制台零报错 —— 访客看到的现象是「页面点不动」。
 * 公开页的干净出口只有三类：页内锚点、源码仓库、联系作者。
 */
const CTA_HREF = '#download'
const CTA_LABEL = '下载桌面端'

/** 触控热区扩展：视觉尺寸不变，用伪元素把可点区域撑到 44×44（WCAG 2.2 只要求 24×24，
 *  但拇指操作下 44 是通行惯例；图标按钮视觉上是 2rem~2.25rem，差的就是这几像素）。 */
const HIT_AREA = "relative before:absolute before:-inset-1.5 before:content-['']"

const linkBase =
  'whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-600 outline-none transition-colors hover:bg-[var(--agenthub-accent-soft)] hover:text-[var(--agenthub-accent)] focus-visible:ring-2 focus-visible:ring-[var(--agenthub-accent)]/30 dark:text-slate-300'

/**
 * 项目主页顶部导航。
 *
 * 与工作台的两个差异点：
 *  1. 工作台是应用内壳层（ElectronTitleBar + 侧栏），主页是独立长文档，所以这里自带 sticky 导航；
 *  2. 只有这里需要客户端状态（移动端抽屉、滚动后才上背景），其余分区都是服务端组件。
 *
 * ❗ 关于断点：桌面导航在 `xl`(1280) 才展开，1280 以下一律收进折叠菜单。
 * 起因是 2026-10-14 的主页审查实测到 768–1120px 整段顶栏折行崩坏（导航盒 96px 压过 65px 的
 * header，`功能模块` 被压成每行一个字）。根因是「8 个中文导航项 + 品牌名 + 英文副标题 +
 * 主题按钮 + CTA」在这个宽度区间里放不下。三种修法实测对比：
 *   ① 只给链接加 nowrap        → 折行变成整页横向滚动（768px 下 +83px），更糟；
 *   ② 把 CTA 藏到 xl 以上      → 不折行了，但 768–1279 既没有导航也没有 CTA，
 *                                而且品牌名在这段仍然被截断；
 *   ③ 把导航降到 xl（当前做法）→ 品牌名、副标题、CTA 全部完整，无折行、无横向滚动。
 * 选 ③。代价是 1024–1279 的用户要展开一次菜单才能看到分区列表，换来的是每个宽度下
 * 都有一个常驻主 CTA —— 对落地页而言后者更重要。
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

  // 折叠菜单打开时支持 Esc 关闭
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
            <span className="hidden truncate text-3xs leading-4 text-slate-500 md:block dark:text-slate-400">
              {BRAND_TAGLINE_EN}
            </span>
          </span>
        </a>

        <nav aria-label="页面分区" className="ml-auto hidden items-center gap-0.5 xl:flex">
          {HOME_NAV.map((item) => (
            <a key={item.href} href={item.href} className={linkBase}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 xl:ml-3">
          <ThemeToggle className={HIT_AREA} />
          {/* 窄屏放不下「导航 + 主题 + CTA」三件套，所以 CTA 收进折叠菜单，
              顶部只在 sm 以上直接露出，避免品牌名被挤到省略号。 */}
          <a
            href={CTA_HREF}
            className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'hidden h-9 gap-1.5 px-4 sm:inline-flex')}
          >
            {CTA_LABEL}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </a>
          <button
            type="button"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon-lg' }), HIT_AREA, 'xl:hidden')}
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
          aria-label="页面分区（折叠菜单）"
          className="border-t border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] px-5 pb-5 pt-2 xl:hidden"
        >
          <ul className="flex flex-col">
            {HOME_NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className={cn(linkBase, 'block py-2.5 text-base')}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href={CTA_HREF}
            className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'mt-3 h-11 w-full gap-1.5')}
            onClick={() => setMenuOpen(false)}
          >
            {CTA_LABEL}
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </nav>
      )}
    </header>
  )
}
