import { CheckCircle2 } from 'lucide-react'
import type { ReactNode } from 'react'

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
    <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-950/30">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-neutral-800 dark:text-slate-400">
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
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:border-slate-300 hover:bg-slate-100 dark:border-white/10 dark:bg-neutral-950/40 dark:hover:border-white/15 dark:hover:bg-neutral-800/70">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white text-slate-500 dark:bg-neutral-800 dark:text-slate-400">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">{title}</div>
        <div className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">{description}</div>
      </div>
      <div className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">{time}</div>
    </div>
  )
}

export function Meta({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-white/10 dark:bg-neutral-950/40"><div className="text-[10px] text-slate-400 dark:text-slate-500">{label}</div><div className="mt-1 truncate text-xs text-slate-700 dark:text-slate-200">{value}</div></div>
}

export function LibraryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:border-slate-300 hover:bg-slate-100 dark:border-white/10 dark:bg-neutral-950/40 dark:hover:border-white/15 dark:hover:bg-neutral-800/70">
      <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 truncate text-base font-semibold text-slate-900 dark:text-slate-50">{value}</div>
    </div>
  )
}
