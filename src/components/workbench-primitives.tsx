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
}: {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  actions?: ReactNode
  /** 标题行上方：面包屑等导航行（运行调试板页头用） */
  breadcrumb?: ReactNode
  /** 标题行下方：元信息行（运行调试板页头用） */
  meta?: ReactNode
}) {
  return (
    <PageCard>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {Icon != null && (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)]">
              <Icon className="size-5 text-[var(--agenthub-accent)]" />
            </div>
          )}
          <div className="min-w-0">
            {breadcrumb != null && <div className="mb-1">{breadcrumb}</div>}
            <div className="font-heading text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {title}
            </div>
            {description != null && (
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
            )}
            {meta != null && <div className="mt-1">{meta}</div>}
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
