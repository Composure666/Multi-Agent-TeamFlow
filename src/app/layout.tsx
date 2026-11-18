import type { Metadata } from 'next'
import { Geist, Geist_Mono, Noto_Serif_SC } from 'next/font/google'

import { GlobalSearch } from '@/components/global-search'
import { NotificationCenter } from '@/components/notification-center'
import { StreamProvider } from '@/components/stream-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { BRAND_NAME, BRAND_TAGLINE_ZH } from '@/lib/brand'

import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

// 标题字体：Noto Serif SC（600/700），中文标题衬线化；正文仍走 Geist + 系统黑体。
// 注意（2026-11-18 实测）：不要在这里写 subsets: ['chinese-simplified']——
// 本项目 Next 16.2.6 内置的 next/font/google 字体数据（font-data.json）里 Noto Serif SC
// 只有 cyrillic / latin / latin-ext / vietnamese，写 chinese-simplified 会在 tsc 报错
// （TS2322）。但这不影响中文覆盖：subsets 只决定 preload 哪些文件，构建时 next/font 会
// 下载 css2 返回的全部 unicode-range 分包——实测产物含 202 条 @font-face（600/700 各 101），
// 101 个 woff2 共 5.75MB，含 U+4E00 等 CJK 区间，中文标题按需加载对应分包，
// 正是提案 B 说的「按 unicode-range 自动分包，只下发用到的字」。运行时不请求 Google Fonts。
const notoSerifSC = Noto_Serif_SC({
  variable: '--font-noto-serif-sc',
  subsets: ['latin'],
  weight: ['600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: BRAND_TAGLINE_ZH,
  icons: {
    // 只声明 PNG：这里曾经把 /icons/agenthub-mark.svg 列为首选 favicon —— 那个「SVG」其实
    // 只是一张 512px PNG 的 base64 包装（不含矢量图形），578KB、gzip 后仍有 434KB，
    // 而每次页面加载浏览器都会优先抓它。已删除该文件与这一条声明。
    // PNG 档位覆盖所有真实用途（16/32 标签页、180 apple-touch、192/512 PWA），
    // 且图标已按 scripts/gen-icons.py 做了调色板优化（512px 从 433KB → 30KB）。
    icon: [
      { url: '/icons/agenthub-mark-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/agenthub-mark-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/agenthub-mark-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/agenthub-mark-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: ['/icons/agenthub-256.png'],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} ${notoSerifSC.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-screen overflow-x-hidden">
        {/*
          防闪烁内联脚本（theme-switcher）：在首次绘制前执行，从 localStorage 读
          `agenthub-theme`，把 `data-theme` 写到 <html>。无值/非法值 → `graphite`（石墨琥珀）。
          无 JS 时 `:root` 本身仍是 ink 浅色（无 JS 兜底不变）；有 JS 时脚本在首次绘制前已写 graphite，首屏仍正确；明暗仍走 next-themes 的 .dark。
          必须是 <body> 首位的原生 <script>（不是 next/script，也不用字面 <head> 元素）：
          实测 App Router 会丢弃字面 <head>；next/script beforeInteractive 则被 React 19
          序列化成 __next_s 载荷、由客户端运行时再插入——执行时机晚于解析期。
          原生 <script> 随 HTML 流在解析期同步执行，与 next-themes 自身的防闪脚本同一机制。
          与 <html suppressHydrationWarning> 配合，data-theme 在 hydration 前已写好，
          不会触发 hydration mismatch 警告。
        */}
        <script
          id="agenthub-theme-init"
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("agenthub-theme");var v=["ink","pine","terra","graphite","wine","obsidian"].indexOf(t)>=0?t:"graphite";document.documentElement.setAttribute("data-theme",v)}catch(e){document.documentElement.setAttribute("data-theme","graphite")}`,
          }}
        />
        <ThemeProvider>
          <StreamProvider>
            {children}
            <NotificationCenter />
          </StreamProvider>
        </ThemeProvider>
        <GlobalSearch />
      </body>
    </html>
  )
}
