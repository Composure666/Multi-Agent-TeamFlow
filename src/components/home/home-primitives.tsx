import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * 项目主页的版式原子。
 *
 * 单独成文件（而不是留在 `home-sections.tsx` 里）的原因：
 * `home-guide.tsx` 是**客户端组件**（左导航要切内容），而 `home-sections.tsx` 是服务端组件且
 * 聚合了全部分区。如果客户端组件直接从 `home-sections.tsx` 里 import 这几个小组件，
 * 打包器会把整个分区模块（含全部静态文案与图标）一并拖进客户端 bundle。
 * 抽到这里的代价是多一个小文件，收益是客户端只拿到这三个原子。
 *
 * 视觉口径与工作台一致：颜色 / 圆角走 globals.css 的 `--agenthub-*` 令牌，
 * 文本色沿用工作台的 slate 阶梯（`.dark` 下已统一重映射）。
 */

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-5 sm:px-6 lg:px-8', className)}>{children}</div>
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--agenthub-accent)]">
      {children}
    </span>
  )
}

export function SectionHead({
  eyebrow,
  title,
  description,
  align = 'center',
}: {
  eyebrow: string
  title: string
  description?: ReactNode
  align?: 'center' | 'left'
}) {
  const centered = align === 'center'
  return (
    <div className={cn('flex flex-col gap-3', centered ? 'items-center text-center' : 'items-start')}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
        {title}
      </h2>
      {description != null && (
        <p
          className={cn(
            'text-sm leading-7 text-slate-500 sm:text-[15px] dark:text-slate-400',
            centered && 'max-w-2xl',
          )}
        >
          {description}
        </p>
      )}
    </div>
  )
}

/** 卡片规格对齐工作台的 `PageCard`：rounded-2xl + 品牌描边 + surface 底 + 轻阴影。 */
export const cardClass =
  'home-card rounded-2xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] shadow-sm'

/**
 * 指向工作台（`/` 及其 `?setup=` 深链）的站内链接 —— 主页上一律用它，别直接用 `next/link`。
 *
 * 必须 `prefetch={false}`：`/home` 是**免鉴权**的公开访客面，而 `/` 与 `/?setup=*` 都在
 * Basic 鉴权后面。Next 的预取**只在 production 生效**（dev 完全不预取），默认会在链接
 * 进入视口时就去抓 RSC 载荷；浏览器收到 401 + `WWW-Authenticate` 后弹出**原生 Basic
 * 登录框**，那是个模态窗口，会把整页的鼠标 / 键盘 / 滚轮事件全部吞掉 —— 访客看到的现象
 * 是「这个页面点不动」，而控制台、网络面板都干干净净，极难往鉴权方向想。
 *
 * 收敛成一个组件是为了让这个不变量有单一出处：以后在主页新增任何指向工作台的 CTA，
 * 都不会再漏掉这一个 prop。
 */
export function WorkbenchLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} prefetch={false} />
}
