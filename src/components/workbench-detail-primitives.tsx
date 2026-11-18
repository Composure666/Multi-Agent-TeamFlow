import { CheckCircle2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function DetailSection({
  icon,
  title,
  aside,
  children,
}: {
  icon: ReactNode
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] p-3 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface-muted)]">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-[var(--agenthub-surface-raised)] dark:text-slate-400">
            {icon}
          </div>
          <h3 className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        </div>
        {aside && <div className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

export function SavedState() {
  return (
    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-300">
      <CheckCircle2 className="size-3" />
      已保存
    </span>
  )
}

export function HistoryRow({ icon, title, description, time }: { icon: ReactNode; title: string; description: string; time: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--agenthub-border)] bg-slate-50 px-3 py-2.5 transition hover:border-slate-300 hover:bg-slate-100 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface-muted)] dark:hover:border-white/15 dark:hover:bg-white/5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--agenthub-surface)] text-slate-500 dark:bg-[var(--agenthub-surface-raised)] dark:text-slate-400">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">{title}</div>
        <div className="mt-0.5 truncate text-3xs text-slate-500 dark:text-slate-400">{description}</div>
      </div>
      <div className="shrink-0 text-3xs text-slate-400 dark:text-slate-500">{time}</div>
    </div>
  )
}

export function Meta({
  label,
  value,
  sublabel,
  highlight,
}: {
  label: string
  value: string
  sublabel?: ReactNode
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-2.5',
        highlight
          ? 'border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)]'
          : 'border-[var(--agenthub-border)] bg-slate-50 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface-muted)]',
      )}
    >
      <div className="text-3xs text-slate-400 dark:text-slate-500">{label}</div>
      <div className="mt-1 truncate text-xs text-slate-700 dark:text-slate-200">{value}</div>
      {sublabel !== undefined && sublabel !== null && (
        <div className="mt-0.5 truncate text-3xs text-slate-500 dark:text-slate-400">{sublabel}</div>
      )}
    </div>
  )
}

export function LibraryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--agenthub-border)] bg-slate-50 px-3 py-2.5 transition hover:border-slate-300 hover:bg-slate-100 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface-muted)] dark:hover:border-white/15 dark:hover:bg-white/5">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 truncate text-base font-semibold text-slate-900 dark:text-slate-50">{value}</div>
    </div>
  )
}
