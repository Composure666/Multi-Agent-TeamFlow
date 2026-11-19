import { AlertTriangle, Inbox, Loader2, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Shared workbench primitives — keep visual language consistent across modules.
 * Tokens come from globals.css (--agenthub-*), so dark mode works automatically.
 */

/**
 * 侧栏列表行规范（batch2-consistency B2 定死，二选一已定：走交互卡片档）：
 * - Agent 库 / 团队库 / 产物库三处侧栏行统一为 `agenthub-card-interactive` + `px-3 py-2.5`；
 * - 行高只由该 padding 与内容决定，不再各写各的 `px-2 py-2` / `px-3 py-3`；
 * - 圆角、描边、阴影与 hover 抬升全部由 `agenthub-card-interactive`（globals.css）提供，行上不再手写。
 */

/**
 * 页面外壳与 gutter 规则（module-audit-top5 A2/A3 定死）：
 * - 外层统一 `p-4 lg:p-6`，调用处不要改写 padding；
 * - 内容默认 `max-w-5xl`；数据型页面（数据概览、能力中心、信息中心、自动化）
 *   与卡片墙页（Agent 库）显式传 `contentClassName="w-full max-w-none"`；
 * - 其余页面走默认 `max-w-5xl`。
 */
export function PageShell({
  children,
  className,
  contentClassName,
}: {
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <div className={cn('h-full min-h-0 overflow-y-auto p-4 lg:p-6', className)}>
      <div className={cn('mx-auto flex max-w-5xl flex-col gap-4 lg:gap-5', contentClassName)}>{children}</div>
    </div>
  )
}

export function PageCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'agenthub-card-container p-4 sm:p-5',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
  breadcrumb,
  meta,
  /** 仅运行调试板用：收紧卡片 padding 与行间距（P0 间距收紧），其他调用处保持默认 */
  compact = false,
}: {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  actions?: ReactNode
  /** 标题行上方：面包屑等导航行（运行调试板页头用） */
  breadcrumb?: ReactNode
  /** 标题行下方：元信息行（运行调试板页头用） */
  meta?: ReactNode
  compact?: boolean
}) {
  return (
    <PageCard className={compact ? 'p-3 sm:px-4 sm:py-3' : 'p-3 sm:p-5'}>
      {/* 移动端标题行与 actions 同行、超宽时 actions 自动换行（B4）：
          标题块 basis 180px 是可读底线——actions 再宽也不把标题压成 "A…"；
          actions 小时同行紧凑（卡片约 87px），超宽时换到第二行、标题独占整行，
          桌面端（sm+）与原来完全一致。 */}
      <div className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 grow basis-[180px] items-start gap-3">
          {Icon != null && (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] sm:size-10">
              <Icon className="size-4 text-[var(--agenthub-accent)] sm:size-5" />
            </div>
          )}
          <div className="min-w-0">
            {breadcrumb != null && <div className={compact ? 'mb-0.5' : 'mb-1'}>{breadcrumb}</div>}
            <div className="font-heading truncate text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
              {title}
            </div>
            {description != null && (
              <p className={cn(compact ? 'mt-0.5' : 'mt-0.5 sm:mt-1', 'line-clamp-1 text-sm leading-6 text-slate-500 dark:text-slate-400 sm:line-clamp-none')}>{description}</p>
            )}
            {meta != null && <div className={compact ? 'mt-0.5' : 'mt-1'}>{meta}</div>}
          </div>
        </div>
        {actions != null && <div className="flex w-fit shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </PageCard>
  )
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <PageCard className="flex flex-col items-center gap-2 py-10 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]">
        <Icon className="size-5" />
      </div>
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
      {description && <p className="max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>}
      {action && (
        <Button type="button" variant="outline" size="sm" className="mt-1" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </PageCard>
  )
}

export function InlineError({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
      <div className="flex min-w-0 items-center gap-2">
        <AlertTriangle className="size-4 shrink-0" />
        <span className="break-words">{message}</span>
      </div>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onRetry}>
          重试
        </Button>
      )}
    </div>
  )
}

export type WorkspaceState = 'loading' | 'refreshing' | 'empty' | 'error' | 'ready'

export function WorkspaceStateView({
  state,
  title,
  description,
  emptyDescription,
  errorDescription,
  action,
  onRetry,
  children,
}: {
  state: WorkspaceState
  title?: string
  description?: string
  emptyDescription?: string
  errorDescription?: string
  action?: { label: string; onClick: () => void }
  /** 数据加载视图的重试入口：传入时加载态显示「重新加载」按钮 */
  onRetry?: () => void
  children?: ReactNode
}) {
  if (state === 'ready') return <>{children}</>
  if (state === 'loading' || state === 'refreshing') {
    return (
      <PageCard className="flex min-h-32 flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground motion-safe:animate-ah-fade-in">
        <Loader2 className="size-4 motion-safe:animate-spin" />
        {state === 'refreshing' ? '正在刷新…' : '正在加载…'}
        {onRetry && (
          <Button type="button" variant="outline" size="sm" className="mt-1" onClick={onRetry}>
            重新加载
          </Button>
        )}
      </PageCard>
    )
  }
  if (state === 'error') {
    return <InlineError message={errorDescription ?? description ?? '加载失败'} onRetry={action?.onClick} />
  }
  return <EmptyState title={title ?? '暂无内容'} description={emptyDescription ?? description} action={action} />
}

export function ToolbarGroup({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] p-1 shadow-[var(--agenthub-shadow-card)]" aria-label={label}>
      {children}
    </div>
  )
}

export function StatusBadge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
  children: ReactNode
}) {
  return <span className={cn('agenthub-status-badge', `agenthub-status-${tone}`)}>{children}</span>
}
