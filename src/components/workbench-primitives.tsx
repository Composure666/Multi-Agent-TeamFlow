import { AlertTriangle, Inbox, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Shared workbench primitives — keep visual language consistent across modules.
 * Tokens come from globals.css (--agenthub-*), so dark mode works automatically.
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
        'rounded-2xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] p-4 shadow-sm dark:bg-neutral-900 sm:p-5',
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
}: {
  icon: LucideIcon
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <PageCard>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            <Icon className="size-5 shrink-0 text-[var(--agenthub-accent)]" />
            {title}
          </div>
          {description != null && (
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
          )}
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
