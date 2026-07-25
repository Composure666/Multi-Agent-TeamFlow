'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, Bot, CheckCircle2, Coins, Layers, RefreshCw, Workflow } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState, InlineError, PageCard, PageHeader, PageShell } from '@/components/workbench-primitives'
import {
  fetchAutomationDashboard,
  fetchUsageSummary,
  type AutomationDashboard,
  type AutomationRunListItem,
  type UsageSummary,
} from '@/lib/api'
import { cn } from '@/lib/utils'

type AnalyticsKpi = {
  label: string
  value: string
  caption: string
  icon: React.ComponentType<{ className?: string }>
  toneClassName: string
}

type AnalyticsTrendPoint = {
  label: string
  value: number
}

type AnalyticsRunRecord = {
  id: string
  title: string
  category: string
  status: '成功' | '失败' | '运行中'
  duration: string
  time: string
}

type AnalyticsDistributionItem = {
  label: string
  value: number
  className: string
}

export function AnalyticsWorkspace() {
  const [usageData, setUsageData] = useState<UsageSummary | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageError, setUsageError] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<AutomationDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setUsageLoading(true)
    setError(null)
    setUsageError(null)
    try {
      const [nextDashboard, nextUsage] = await Promise.all([
        fetchAutomationDashboard(),
        fetchUsageSummary(),
      ])
      setDashboard(nextDashboard)
      setUsageData(nextUsage)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setUsageError(message)
    } finally {
      setLoading(false)
      setUsageLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const recentRuns = useMemo(() => (dashboard?.recentRuns ?? []).map(mapAutomationRun), [dashboard?.recentRuns])
  const trend = dashboard?.trend.length ? dashboard.trend : buildEmptyWeekTrend()
  const maxTrend = Math.max(...trend.map((point) => point.value), 1)
  const distribution = useMemo(() => buildAnalyticsDistribution(dashboard?.recentRuns ?? []), [dashboard?.recentRuns])
  const successRate = calculateSuccessRate(dashboard?.recentRuns ?? [])
  const failedRuns = dashboard?.recentRuns.filter((run) => run.status === 'failed').length ?? 0
  const kpis: AnalyticsKpi[] = [
    { label: 'Agent 运行', value: `${usageData?.allTime.runs ?? 0}`, caption: `本周 ${usageData?.week.runs ?? 0} 次 · 今日 ${usageData?.today.runs ?? 0} 次`, icon: Bot, toneClassName: 'bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]' },
    { label: 'Token 用量', value: formatTok(usageData?.week.totalTokens ?? 0), caption: `今日 ${formatTok(usageData?.today.totalTokens ?? 0)} · 全部 ${formatTok(usageData?.allTime.totalTokens ?? 0)}`, icon: Coins, toneClassName: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300' },
    { label: '自动化任务', value: `${dashboard?.automations.length ?? 0}`, caption: `${dashboard?.automations.filter((item) => item.status === 'enabled' || item.status === 'running').length ?? 0} 个启用或运行中`, icon: Workflow, toneClassName: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' },
    { label: '自动化成功率', value: `${successRate}%`, caption: failedRuns > 0 ? `${failedRuns} 次失败需关注` : '近期无失败记录', icon: CheckCircle2, toneClassName: failedRuns > 0 ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' },
  ]
  const isInitialLoading = (loading || usageLoading) && !dashboard && !usageData
  const loadError = error ?? usageError

  return (
    <PageShell className="p-2 lg:p-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" contentClassName="w-full max-w-none gap-2.5 lg:gap-3">
      <PageHeader
        icon={BarChart3}
        title="分析"
        description="接入真实 usage、Agent 运行与自动化运行数据，观察任务质量、成功率与近期趋势。"
        actions={(
          <Button variant="outline" size="sm" className="w-fit" disabled={loading || usageLoading} onClick={() => void load()}>
            <RefreshCw className={cn('size-3.5', (loading || usageLoading) && 'animate-spin')} />
            刷新数据
          </Button>
        )}
      />

      {loadError && <InlineError message={loadError} onRetry={() => void load()} />}
      {isInitialLoading && <PageCard className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">正在加载分析数据...</PageCard>}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <AnalyticsKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <section className="grid gap-2.5 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <div className="rounded-2xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] p-3 shadow-sm dark:bg-neutral-900">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">运行趋势</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">近 7 天自动化任务触发次数</p>
            </div>
            <BarChart3 className="size-4 text-slate-400" />
          </div>
          <div className="mt-3 flex h-48 items-end gap-2.5 rounded-xl border border-[var(--agenthub-border)] bg-slate-50 p-3 dark:bg-neutral-950/40 sm:gap-4">
            {trend.map((point) => (
              <div key={point.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                <div className="flex w-full flex-1 items-end justify-center">
                  <div className="w-full max-w-8 rounded-t-lg bg-[var(--agenthub-accent)] transition hover:bg-[var(--agenthub-accent-hover)]" style={{ height: `${Math.max(14, (point.value / maxTrend) * 100)}%` }} />
                </div>
                <div className="text-center">
                  <div className="text-[11px] font-medium text-slate-700 dark:text-slate-300">{point.value}</div>
                  <div className="text-[10px] text-slate-400">{point.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] p-3 shadow-sm dark:bg-neutral-900">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">任务类型分布</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">按近期自动化运行记录统计</p>
            </div>
            <Layers className="size-4 text-slate-400" />
          </div>
          <div className="mt-3 space-y-3">
            {distribution.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--agenthub-border)] px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">暂无自动化运行分布数据。</div>
            ) : distribution.map((item) => (
              <div key={item.label}>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-400">{item.label}</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{item.value}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-white/10">
                  <div className={cn('h-full rounded-full', item.className)} style={{ width: `${item.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] p-3 shadow-sm dark:bg-neutral-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">最近运行记录</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">包含状态、耗时和任务类型，用于快速排查异常</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500 dark:bg-white/10 dark:text-slate-400">{recentRuns.length} 条记录</span>
        </div>
        {recentRuns.length === 0 ? (
          <EmptyState title="暂无运行记录" description="自动化任务运行后会显示在这里。" />
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-[var(--agenthub-border)]">
            {recentRuns.map((run) => (
              <AutomationRunRow key={run.id} run={run} table />
            ))}
          </div>
        )}
      </section>
    </PageShell>
  )
}

function buildEmptyWeekTrend(): AnalyticsTrendPoint[] {
  return ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label) => ({ label, value: 0 }))
}

function calculateSuccessRate(runs: AutomationRunListItem[]): number {
  const finished = runs.filter((run) => run.status !== 'running')
  if (finished.length === 0) return 0
  const succeeded = finished.filter((run) => run.status === 'success').length
  return Math.round((succeeded / finished.length) * 1000) / 10
}

function buildAnalyticsDistribution(runs: AutomationRunListItem[]): AnalyticsDistributionItem[] {
  const counts = new Map<string, number>()
  for (const run of runs) counts.set(run.category, (counts.get(run.category) ?? 0) + 1)
  const total = runs.length
  const colors = ['bg-[var(--agenthub-accent,#2F5FD0)]', 'bg-slate-500', 'bg-slate-400', 'bg-slate-300']
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, count], index) => ({
      label,
      value: total > 0 ? Math.round((count / total) * 100) : 0,
      className: colors[index] ?? 'bg-slate-300',
    }))
}

function AnalyticsKpiCard({ kpi }: { kpi: AnalyticsKpi }) {
  const Icon = kpi.icon

  return (
    <article className="rounded-2xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] p-4 shadow-sm transition hover:border-[var(--agenthub-accent-border)] dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{kpi.value}</div>
        </div>
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', kpi.toneClassName)}>
          <Icon className="size-5" />
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{kpi.caption}</p>
    </article>
  )
}

export function AutomationRunRow({ run, table = false }: { run: AnalyticsRunRecord; table?: boolean }) {
  const statusClassName = run.status === '成功'
    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
    : run.status === '运行中'
      ? 'bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]'
      : 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300'

  return (
    <div className={cn('grid gap-3 border-slate-100 bg-[var(--agenthub-surface)] p-3 transition hover:bg-[var(--agenthub-accent-soft)]/40 dark:border-white/10 dark:bg-neutral-900 sm:grid-cols-[minmax(0,1.3fr)_120px_88px_88px_80px] sm:items-center', table ? 'border-b last:border-b-0' : 'rounded-xl border')}>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{run.title}</div>
        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 sm:hidden">{run.category} · {run.duration} · {run.time}</div>
      </div>
      <div className="hidden truncate text-xs text-slate-500 dark:text-slate-400 sm:block">{run.category}</div>
      <div className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">{run.duration}</div>
      <div className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">{run.time}</div>
      <span className={cn('w-fit rounded-full px-2 py-1 text-[10px] font-medium', statusClassName)}>{run.status}</span>
    </div>
  )
}

export function mapAutomationRun(item: AutomationRunListItem): AnalyticsRunRecord {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    status: item.status === 'success' ? '成功' : item.status === 'running' ? '运行中' : '失败',
    duration: item.status === 'running' ? '进行中' : formatDuration(item.durationMs),
    time: formatRelativeRunTime(item.startedAt),
  }
}

export function formatDuration(value: number | null): string {
  if (value === null) return '—'
  const totalSeconds = Math.max(0, Math.round(value / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function formatRelativeRunTime(value: number): string {
  const now = new Date()
  const target = new Date(value)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const targetDay = new Date(target)
  targetDay.setHours(0, 0, 0, 0)
  const diffDays = Math.round((today.getTime() - targetDay.getTime()) / (24 * 60 * 60 * 1000))
  const clock = target.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 0) return `今日 ${clock}`
  if (diffDays === 1) return `昨日 ${clock}`
  if (diffDays > 1 && diffDays < 7) return `${diffDays} 天前`
  return target.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function formatTok(n: number): string {
  if (n < 1000) return `${n}`
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}
