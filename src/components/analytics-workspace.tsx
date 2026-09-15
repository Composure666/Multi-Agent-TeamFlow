'use client'
// analytics-workspace.tsx - v4: 全组件改接真实运行数据（数据源 agent_runs）
//
// v3 及之前的所有「任务 / 趋势 / 分布 / 成功率」都取自 automation_runs（自动化任务运行，
// 库内仅几十条且集中在 demo 种子），而 KPI 运行数取自 usage（agent_runs），两张表混用导致
// 「运行数 119 / 任务列表 4 条」这种自相矛盾的显示。v4 统一以 /api/analytics 为准。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coins,
  Download,
  Filter,
  LogIn,
  MoreHorizontal,
  RefreshCw,
  Search,
  TrendingUp,
  Workflow,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { EmptyState, InlineError, PageCard } from '@/components/workbench-primitives'
import {
  fetchAutomationDashboard,
  fetchRunAnalytics,
  fetchUsageSummary,
  type AutomationDashboard,
  type AutomationRunListItem,
  type RunAnalytics,
  type RunAnalyticsItem,
  type UsageSummary,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'

type RunStatus = '成功' | '失败' | '运行中' | '已中止'

type AnalyticsRunRecord = {
  id: string
  conversationId: string
  agentId: string
  agentName: string
  title: string
  category: string
  status: RunStatus
  duration: string
  time: string
  createdAt: string
  startedAt: number
  totalTokens: number
  isSubRun: boolean
}

type DistributionItem = {
  label: string
  value: number
  count: number
}

type LiveActivityItem = {
  time: string
  title: string
  description: string
  status: RunStatus
}

type TaskListTab = '全部' | '运行中' | '成功' | '失败' | '已中止'

const CHART_COLORS = ['#2F5FD0', '#7C3AED', '#10B981', '#F59E0B', '#6B7280']

const STATUS_COLORS: Record<RunStatus, string> = {
  成功: '#10B981',
  运行中: '#2F5FD0',
  失败: '#F43F5E',
  已中止: '#94A3B8',
}

const DATE_PRESETS = ['最近7天', '最近30天', '最近90天', '全部'] as const
type DatePreset = (typeof DATE_PRESETS)[number]

/** 「全部」时传 0，后端会用库内最早一条 run 把起点钳住 */
const ALL_TIME_START = '2000-01-01'

function getDateRangeForPreset(preset: string): { start: string; end: string; days: number } {
  const now = new Date()
  const end = now.toISOString().slice(0, 10)
  if (preset === '全部') return { start: ALL_TIME_START, end, days: 3650 }
  if (preset === '最近30天') return { start: new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10), end, days: 30 }
  if (preset === '最近90天') return { start: new Date(now.getTime() - 89 * 86400000).toISOString().slice(0, 10), end, days: 90 }
  return { start: new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10), end, days: 7 }
}

export function AnalyticsWorkspace() {
  const [analytics, setAnalytics] = useState<RunAnalytics | null>(null)
  const [usageData, setUsageData] = useState<UsageSummary | null>(null)
  const [dashboard, setDashboard] = useState<AutomationDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [taskTab, setTaskTab] = useState<TaskListTab>('全部')
  const [taskSearch, setTaskSearch] = useState('')
  const [taskAgentFilter, setTaskAgentFilter] = useState<Set<string>>(new Set())
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const [hoveredBar, setHoveredBar] = useState<number | null>(null)
  const [hoveredLine, setHoveredLine] = useState<number | null>(null)
  const [dateRangeOpen, setDateRangeOpen] = useState(false)
  const dateRangeRef = useRef<HTMLDivElement>(null)
  const [datePreset, setDatePreset] = useState<DatePreset>('最近7天')
  const [dateStart, setDateStart] = useState(() => getDateRangeForPreset('最近7天').start)
  const [dateEnd, setDateEnd] = useState(() => getDateRangeForPreset('最近7天').end)
  const openRunBoardTarget = useAppStore((state) => state.openRunBoardTarget)
  const openConversation = useAppStore((state) => state.openConversation)

  const isAllTime = datePreset === '全部'

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const startTs = isAllTime ? 0 : new Date(dateStart).getTime()
      const endTs = new Date(dateEnd).getTime() + 86400000 - 1
      const days = Math.max(1, Math.round((endTs - startTs) / 86400000))
      const [nextAnalytics, nextUsage, nextDashboard] = await Promise.all([
        fetchRunAnalytics({ start: startTs, end: endTs, days }),
        fetchUsageSummary({ start: startTs, end: endTs }),
        fetchAutomationDashboard({ start: startTs, end: endTs, days }),
      ])
      setAnalytics(nextAnalytics); setUsageData(nextUsage); setDashboard(nextDashboard)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setLoading(false) }
  }, [dateStart, dateEnd, isAllTime])

  useEffect(() => { void load() }, [load])

  // 点击日期范围选择器外部时关闭下拉
  useEffect(() => {
    if (!dateRangeOpen) return
    const handler = (e: MouseEvent) => {
      if (dateRangeRef.current && !dateRangeRef.current.contains(e.target as Node)) {
        setDateRangeOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dateRangeOpen])

  const stats = analytics?.stats
  const runs = useMemo(
    () => (analytics?.items ?? []).map(mapRunItem),
    [analytics?.items],
  )
  const trend = useMemo(() => {
    const raw = analytics?.trend ?? []
    // 长周期（>31 天）按周聚合，避免柱体过密
    if (raw.length > 31) {
      const weeks: Array<{ label: string; date: string; value: number; completed: number; idx: number }> = []
      for (let i = 0; i < raw.length; i += 7) {
        const chunk = raw.slice(i, i + 7)
        weeks.push({
          label: chunk[0].label,
          date: chunk[0].date,
          value: chunk.reduce((s, p) => s + p.value, 0),
          completed: chunk.reduce((s, p) => s + p.completed, 0),
          idx: weeks.length,
        })
      }
      return weeks
    }
    return raw.map((p, i) => ({ ...p, idx: i }))
  }, [analytics?.trend])
  const maxTrend = Math.max(...trend.map((p) => Math.max(p.value, p.completed)), 1)
  const agentDistribution = useMemo(() => analytics?.agentDistribution ?? [], [analytics])
  const statusDistribution = useMemo(() => analytics?.statusDistribution ?? [], [analytics])
  const successRate = stats?.successRate ?? 0
  const totalRuns = stats?.total ?? 0
  const todayRuns = stats?.todayCount ?? 0
  const allTimeRuns = stats?.allTimeTotal ?? 0
  const selectedTokens = usageData?.selected.totalTokens ?? 0
  const todayTokens = usageData?.today.totalTokens ?? 0
  const prevSelectedTokens = usageData?.prevSelected.totalTokens ?? 0
  const allTokens = usageData?.allTime.totalTokens ?? 0
  const automationCount = dashboard?.automations.length ?? 0
  const activeAutomationCount = dashboard?.automations.filter((a) => a.status === 'enabled' || a.status === 'running').length ?? 0

  // 环比：全部时间没有「上一周期」的概念，隐藏箭头
  const runsTrend = !isAllTime && stats && stats.prevTotal > 0
    ? Math.round(((stats.total - stats.prevTotal) / stats.prevTotal) * 100)
    : null
  const tokensTrend = prevSelectedTokens > 0 ? Math.round(((selectedTokens - prevSelectedTokens) / prevSelectedTokens) * 1000) / 10 : 0

  const openRunTarget = useCallback((run: AnalyticsRunRecord) => {
    openRunBoardTarget({ conversationId: run.conversationId, runId: run.id })
  }, [openRunBoardTarget])

  const liveActivities = useMemo(() => buildLiveActivities(runs), [runs])

  // 可筛的 Agent 列表：从真实运行记录派生，按出现频次降序
  const availableAgents = useMemo(() => {
    const counts = new Map<string, number>()
    for (const run of runs) counts.set(run.agentName, (counts.get(run.agentName) ?? 0) + 1)
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([label]) => label)
  }, [runs])

  const filteredTasks = useMemo(() => {
    let tasks = runs
    if (taskTab !== '全部') tasks = tasks.filter((r) => r.status === taskTab)
    if (taskAgentFilter.size > 0) tasks = tasks.filter((r) => taskAgentFilter.has(r.agentName))
    if (taskSearch.trim()) {
      const q = taskSearch.trim().toLowerCase()
      tasks = tasks.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.agentName.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q),
      )
    }
    return tasks
  }, [runs, taskTab, taskSearch, taskAgentFilter])

  const isInitialLoading = loading && !analytics && !usageData
  const loadError = error

  const handleExport = useCallback(() => {
    const data = {
      exportedAt: new Date().toISOString(),
      dateRange: { preset: datePreset, start: dateStart, end: dateEnd },
      source: 'agent_runs (真实运行记录)',
      summary: {
        totalRuns, todayRuns, allTimeRuns,
        successRate, success: stats?.success ?? 0, running: stats?.running ?? 0,
        failed: stats?.failed ?? 0, aborted: stats?.aborted ?? 0,
        avgDurationMs: stats?.avgDurationMs ?? 0,
        selectedTokens, todayTokens, allTokens,
        automationCount,
      },
      usage: {
        allTime: usageData?.allTime,
        today: usageData?.today,
        selected: usageData?.selected,
        prevSelected: usageData?.prevSelected,
      },
      automationStats: dashboard?.stats,
      trend: trend.map((p) => ({ label: p.label, date: p.date, value: p.value, completed: p.completed })),
      agentDistribution,
      statusDistribution,
      runs,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `agenthub-analytics-${dateStart}_${dateEnd}.json`; a.click()
    URL.revokeObjectURL(url)
  }, [datePreset, dateStart, dateEnd, totalRuns, todayRuns, allTimeRuns, successRate, stats, selectedTokens, todayTokens, allTokens, automationCount, usageData, dashboard, trend, agentDistribution, statusDistribution, runs])

  const rangeLabel = isAllTime
    ? '全部时间'
    : `${dateStart} ~ ${dateEnd}`

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#F0F2F5] dark:bg-[#0F1115]">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-6">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">数据概览</h1>
          <p className="mt-1 text-[13px] text-slate-500">多维度了解 Agent 的运行情况、任务效率与资源使用</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={dateRangeRef}>
            <button type="button" onClick={() => setDateRangeOpen(!dateRangeOpen)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50">
              <Calendar className="size-3.5 text-slate-400" />
              <span>{datePreset}</span>
              <ChevronDown className={cn('size-3 text-slate-400 transition', dateRangeOpen && 'rotate-180')} />
            </button>
            {dateRangeOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {DATE_PRESETS.map((p) => (
                  <button key={p} type="button" onClick={() => { const r = getDateRangeForPreset(p); setDatePreset(p); setDateStart(r.start); setDateEnd(r.end); setDateRangeOpen(false) }} className={cn('block w-full px-3 py-2 text-left text-xs transition hover:bg-slate-50', datePreset === p ? 'bg-blue-50/50 font-medium text-[#2F5FD0]' : 'text-slate-600')}>{p}</button>
                ))}
                <div className="my-1 border-t border-slate-100" />
                <div className="px-3 py-2">
                  <div className="mb-1.5 text-[10px] font-medium text-slate-400">自定义范围</div>
                  <div className="flex items-center gap-1">
                    <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className="h-7 w-full rounded border border-slate-200 px-1.5 text-xs text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-200" />
                    <span className="text-slate-300">~</span>
                    <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="h-7 w-full rounded border border-slate-200 px-1.5 text-xs text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-200" />
                  </div>
                  <button type="button" onClick={() => { setDatePreset('自定义' as DatePreset); setDateRangeOpen(false) }} className="mt-1.5 w-full rounded bg-[#2F5FD0] py-1 text-xs font-medium text-white transition hover:bg-[#244FB3]">应用</button>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
            <span>{rangeLabel}</span>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg border-slate-200 text-xs" disabled={loading} onClick={() => void load()}>
            <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
            刷新
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg border-slate-200 text-xs" onClick={() => handleExport()}>
            <Download className="size-3" />
            导出
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="agenthub-hide-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6 lg:py-5 xl:px-8 xl:py-6">
        {loadError && <InlineError message={loadError} onRetry={() => void load()} />}
        {isInitialLoading && <PageCard className="py-6 text-center text-sm text-slate-500">正在加载分析数据...</PageCard>}

        {!isInitialLoading && (
          <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:gap-4">
              <KpiCard
                icon={Bot}
                label="Agent 运行数"
                value={`${totalRuns}`}
                trend={runsTrend}
                caption={isAllTime ? '全部时间累计' : `较上周期 ${stats?.prevTotal ?? 0}`}
                subCaption={`今日 ${todayRuns} 次 · 全部 ${allTimeRuns} 次`}
                sparkline={trend.map((p) => p.value)}
                tone="blue"
              />
              <KpiCard
                icon={Coins}
                label="Token 用量"
                value={formatTok(selectedTokens)}
                trend={tokensTrend}
                caption={`较上周期 ${formatTok(prevSelectedTokens)}`}
                subCaption={`今日 ${formatTok(todayTokens)} · 全部 ${formatTok(allTokens)}`}
                sparkline={trend.map((p) => p.value)}
                tone="purple"
              />
              <KpiCard
                icon={Workflow}
                label="自动化任务"
                value={`${automationCount}`}
                trend={null}
                caption={`${activeAutomationCount} 个任务进行中`}
                subCaption={`启用 ${dashboard?.automations.filter((a) => a.status === 'enabled').length ?? 0} · 运行中 ${dashboard?.automations.filter((a) => a.status === 'running').length ?? 0}`}
                sparkline={trend.map((p) => p.completed)}
                tone="emerald"
              />
              <KpiCard
                icon={CheckCircle2}
                label="任务成功率"
                value={`${successRate}%`}
                trend={null}
                caption={`成功 ${stats?.success ?? 0} / 已结束 ${(stats?.success ?? 0) + (stats?.failed ?? 0) + (stats?.aborted ?? 0)}`}
                subCaption={
                  (stats?.failed ?? 0) + (stats?.aborted ?? 0) > 0
                    ? `失败 ${stats?.failed ?? 0} · 中止 ${stats?.aborted ?? 0} · 平均耗时 ${formatDuration(stats?.avgDurationMs ?? null)}`
                    : `全部成功 · 平均耗时 ${formatDuration(stats?.avgDurationMs ?? null)}`
                }
                sparkline={trend.map((p) => (p.value > 0 ? Math.round((p.completed / p.value) * 100) : 0))}
                tone={(stats?.failed ?? 0) > 0 ? 'rose' : 'emerald'}
              />
            </div>

            {/* Main area: 3-column layout */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(220px,1fr)_minmax(240px,1.1fr)] lg:gap-5">
              {/* Left: Trend Chart */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">运行趋势</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {isAllTime ? '全部时间' : `${dateStart} ~ ${dateEnd}`} Agent 运行次数与成功次数
                      {trend.length > 31 && '（按周聚合）'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-5 text-sm text-slate-500">
                  <span className="flex items-center gap-2"><span className="inline-block size-2 rounded-full bg-[#2F5FD0]" />Agent 运行次数</span>
                  <span className="flex items-center gap-2"><span className="inline-block size-2 rounded-full bg-[#10B981]" />成功次数</span>
                </div>
                {trend.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-400">该时间段内没有运行记录</div>
                ) : (
                  <TrendChart data={trend} maxTrend={maxTrend} hoveredBar={hoveredBar} hoveredLine={hoveredLine} onHoverBar={setHoveredBar} onHoverLine={setHoveredLine} />
                )}
              </div>

              {/* Middle: Agent Distribution Donut */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold tracking-tight text-slate-900">Agent 运行分布</h2></div>
                <DonutChart items={agentDistribution} total={totalRuns} />
                <div className="mt-3 space-y-2">
                  {agentDistribution.map((item, i) => (
                    <div key={`dist-${item.label}-${i}`} className="flex items-center justify-between text-[13px]">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="truncate text-slate-600">{item.label}</span>
                      </span>
                      <span className="shrink-0 text-slate-500">{item.value}% <span className="ml-1.5 text-slate-400">{item.count}</span></span>
                    </div>
                  ))}
                  {agentDistribution.length === 0 && <div className="py-3 text-center text-xs text-slate-400">暂无分布数据</div>}
                </div>
              </div>

              {/* Right: Sidebar */}
              <div className="space-y-4 lg:row-span-2">
                {/* Live Activity */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">最近运行动态</h2>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600"><span className="size-1.5 rounded-full bg-emerald-500" />LIVE</span>
                  </div>
                  <div className="mt-3 space-y-0">
                    {liveActivities.length === 0 ? (
                      <div className="py-3 text-center text-xs text-slate-400">暂无运行动态</div>
                    ) : liveActivities.map((item, i) => {
                      const dotColor = item.status === '成功' ? 'bg-emerald-500' : item.status === '运行中' ? 'bg-blue-500' : item.status === '已中止' ? 'bg-slate-400' : 'bg-rose-500'
                      const prevStatus = i > 0 ? liveActivities[i - 1].status : item.status
                      const lineColor = prevStatus === '成功' ? 'bg-emerald-200' : prevStatus === '运行中' ? 'bg-blue-200' : prevStatus === '已中止' ? 'bg-slate-200' : 'bg-rose-200'
                      const isLast = i === liveActivities.length - 1
                      return (
                        <div key={`live-${i}-${item.title}`} className="flex gap-3">
                          <div className="flex w-12 shrink-0 flex-col items-center">
                            <span className="text-xs leading-none text-slate-400">{item.time}</span>
                            <div className="relative mt-1.5 flex flex-1 flex-col items-center">
                              <span className={cn('size-2.5 shrink-0 rounded-full ring-2 ring-white', dotColor, item.status === '运行中' && 'animate-pulse')} />
                              {!isLast && <span className={cn('mt-0.5 w-px flex-1', lineColor)} />}
                            </div>
                          </div>
                          <div className="min-w-0 flex-1 pb-3.5">
                            <div className="flex items-center justify-between gap-2"><span className="truncate text-[13px] font-medium text-slate-800">{item.title}</span><StatusBadge status={item.status} /></div>
                            <p className="mt-0.5 truncate text-sm text-slate-400">{item.description}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Status Distribution */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">运行状态分布</h2>
                  <div className="mt-3 space-y-2.5">
                    {statusDistribution.map((item) => (
                      <div key={`st-${item.label}`}>
                        <div className="mb-1.5 flex items-center justify-between text-[13px]">
                          <span className="flex items-center gap-2 text-slate-600"><span className="size-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[item.label as RunStatus] ?? '#94A3B8' }} />{item.label}</span>
                          <span className="font-medium text-slate-700">{item.count} 次 · {item.value}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{ width: `${item.value}%`, backgroundColor: STATUS_COLORS[item.label as RunStatus] ?? '#94A3B8' }} /></div>
                      </div>
                    ))}
                    {statusDistribution.length === 0 && <div className="py-3 text-center text-xs text-slate-400">暂无分布数据</div>}
                  </div>
                </div>
              </div>

              {/* Task List */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md lg:col-span-2">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">任务列表</h2>
                    <p className="mt-0.5 text-xs text-slate-400">
                      数据源 agent_runs · 范围内共 {totalRuns} 条
                      {analytics?.truncated && `（列表展示最近 ${analytics.items.length} 条）`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                      <Input value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} placeholder="搜索任务 / Agent..." className="h-8 w-60 rounded-lg border-slate-200 bg-slate-50 pl-8 text-xs shadow-none focus-visible:ring-1 focus-visible:ring-blue-200" />
                    </div>
                    <DropdownMenu open={filterMenuOpen} onOpenChange={setFilterMenuOpen}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn('h-8 w-8 rounded-lg border-slate-200 p-0', taskAgentFilter.size > 0 && 'border-[#2F5FD0] bg-blue-50/60 text-[#2F5FD0]')}
                          aria-label="按 Agent 筛选"
                        >
                          <Filter className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuLabel className="flex items-center justify-between">
                          <span>按 Agent 筛选</span>
                          {taskAgentFilter.size > 0 && (
                            <button type="button" onClick={() => setTaskAgentFilter(new Set())} className="text-xs font-normal text-[#2F5FD0] hover:underline">清除 ({taskAgentFilter.size})</button>
                          )}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {availableAgents.length === 0 && <div className="px-2 py-2 text-sm text-slate-400">暂无 Agent</div>}
                        {availableAgents.map((name) => (
                          <DropdownMenuCheckboxItem
                            key={`agent-${name}`}
                            checked={taskAgentFilter.has(name)}
                            onCheckedChange={(checked) => {
                              setTaskAgentFilter((prev) => {
                                const next = new Set(prev)
                                if (checked) next.add(name)
                                else next.delete(name)
                                return next
                              })
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {name}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-100 px-5">
                  {(['全部', '运行中', '成功', '失败', '已中止'] as TaskListTab[]).map((tab) => {
                    const count = tab === '全部' ? runs.length : runs.filter((r) => r.status === tab).length
                    return (
                      <button key={`tab-${tab}`} type="button" onClick={() => setTaskTab(tab)} className={cn('relative shrink-0 px-3 py-2.5 text-[13px] font-medium transition', taskTab === tab ? 'text-[#2F5FD0]' : 'text-slate-500 hover:text-slate-700')}>
                        {tab}<span className={cn('ml-1.5 text-xs', taskTab === tab ? 'text-[#2F5FD0]' : 'text-slate-400')}>{count}</span>
                        {taskTab === tab && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#2F5FD0]" />}
                      </button>
                    )
                  })}
                </div>
                <TaskTable tasks={filteredTasks} onOpenRun={openRunTarget} onOpenConversation={openConversation} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── KPI Card with sparkline, trend arrow ── */
function KpiCard({ icon: Icon, label, value, trend, caption, subCaption, sparkline, tone }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string;
  trend: number | null; caption: string; subCaption: string; sparkline: number[];
  tone: 'blue' | 'purple' | 'emerald' | 'rose'
}) {
  const tones: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', purple: 'bg-purple-50 text-purple-600',
    emerald: 'bg-emerald-50 text-emerald-600', rose: 'bg-rose-50 text-rose-600',
  }
  const sparkColor = tone === 'blue' ? '#2F5FD0' : tone === 'purple' ? '#7C3AED' : tone === 'emerald' ? '#10B981' : '#F43F5E'
  const trendUp = (trend ?? 0) >= 0
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={cn('flex size-9 items-center justify-center rounded-lg', tones[tone])}><Icon className="size-4" /></div>
          <span className="text-[13px] font-medium text-slate-700">{label}</span>
        </div>
      </div>
      <div className="mt-3.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[28px] font-semibold leading-none tracking-tight text-slate-900">{value}</div>
          {trend === null ? (
            <div className="mt-2 text-sm text-slate-400">{caption}</div>
          ) : (
            <div className={cn('mt-2 flex items-center gap-1 text-sm font-medium', trendUp ? 'text-emerald-600' : 'text-rose-500')}>
              <TrendingUp className={cn('size-3.5', !trendUp && 'rotate-180')} />
              <span>{trendUp ? '+' : ''}{trend > 100 ? `${Math.round(trend / 10) / 10}%` : `${trend}%`}</span>
              <span className="ml-1 font-normal text-slate-400">{caption}</span>
            </div>
          )}
        </div>
        <Sparkline data={sparkline} color={sparkColor} />
      </div>
      <div className="mt-3 text-xs text-slate-400">{subCaption}</div>
    </article>
  )
}

/* ── Sparkline SVG ── */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 80, h = 32
  const max = Math.max(...data, 1), min = Math.min(...data, 0), range = max - min || 1
  const pts = data.map((v, i) => `${data.length > 1 ? (i / (data.length - 1)) * w : 0},${h - ((v - min) / range) * (h - 4) - 2}`)
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`).join(' ')
  const areaD = `${pathD} L${w},${h} L0,${h} Z`
  const gid = `sp-${color.replace('#', '')}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={areaD} fill={`url(#${gid})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ─ Trend Chart: bars + area line, HTML tooltip that never overflows ── */
function TrendChart({ data, maxTrend, hoveredBar, hoveredLine, onHoverBar, onHoverLine }: {
  data: Array<{ label: string; date: string; value: number; completed: number; idx: number }>;
  maxTrend: number; hoveredBar: number | null; hoveredLine: number | null;
  onHoverBar: (i: number | null) => void; onHoverLine: (i: number | null) => void;
}) {
  const chartH = 160, padL = 40, padR = 16, padT = 16, padB = 24
  const svgW = 560, svgH = chartH + padT + padB
  const plotW = svgW - padL - padR, plotH = chartH
  const gap = plotW / data.length
  const barW = Math.max(6, Math.min(32, gap * 0.45))
  const yTicks = [0, Math.round(maxTrend * 0.25), Math.round(maxTrend * 0.5), Math.round(maxTrend * 0.75), maxTrend]
  const linePts = data.map((p, i) => {
    const x = padL + gap * i + gap / 2
    const y = padT + plotH - (p.completed / maxTrend) * plotH
    return { x, y, value: p.completed, label: p.label, idx: p.idx }
  })
  const linePath = linePts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${linePts[linePts.length - 1]?.x ?? padL},${padT + plotH} L${linePts[0]?.x ?? padL},${padT + plotH} Z`

  const hoverIdx = hoveredBar ?? hoveredLine
  const hoverPoint = hoverIdx !== null ? data[hoverIdx] : null
  const TT_W = 168

  return (
    <div className="relative mt-4 w-full">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="h-auto max-h-[300px] min-w-[440px] w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((tick, i) => {
          const y = padT + plotH - (tick / maxTrend) * plotH
          return (
            <g key={`yt-${i}-${tick}`}>
              <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="#F4F6FA" strokeWidth="1" />
              <text x={padL - 8} y={y + 3} textAnchor="end" fill="#CBD5E1" fontSize="10">{tick}</text>
            </g>
          )
        })}
        {linePts.length > 1 && <path d={areaPath} fill="url(#trend-area)" />}
        {data.map((point, i) => {
          const cx = padL + gap * i + gap / 2
          const barH = (point.value / maxTrend) * plotH
          const y = padT + plotH - barH
          const isH = hoveredBar === i
          return (
            <g key={`bar-${point.date}`} onMouseEnter={() => onHoverBar(i)} onMouseLeave={() => onHoverBar(null)} className="cursor-pointer">
              <rect x={cx - barW / 2} y={y} width={barW} height={barH} rx="3" fill={isH ? '#1d4ed8' : '#2F5FD0'} opacity={isH ? 1 : 0.85} />
              {data.length <= 31 && (
                <text x={cx} y={padT + plotH + 18} textAnchor="middle" fill="#94A3B8" fontSize="10">{point.label}</text>
              )}
            </g>
          )
        })}
        <path d={linePath} fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {linePts.map((p, i) => {
          const isH = hoveredLine === i
          return (
            <g key={`lp-${p.idx}`} onMouseEnter={() => onHoverLine(i)} onMouseLeave={() => onHoverLine(null)} className="cursor-pointer">
              <circle cx={p.x} cy={p.y} r={isH ? 5 : 3.5} fill="white" stroke="#10B981" strokeWidth="2" />
            </g>
          )
        })}
        <line x1={padL} y1={padT + plotH} x2={svgW - padR} y2={padT + plotH} stroke="#F1F5F9" strokeWidth="1" />
      </svg>
      {hoverPoint && hoverIdx !== null && (() => {
        const cx = padL + gap * hoverIdx + gap / 2
        const cxPct = (cx / svgW) * 100
        const flipX = cxPct > 70
        const left = flipX ? `calc(${cxPct}% - ${TT_W}px - 12px)` : `calc(${cxPct}% + 12px)`
        return (
          <div className="pointer-events-none absolute top-2 z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg" style={{ left, width: TT_W }}>
            <div className="text-xs font-medium text-slate-500">{hoverPoint.label}</div>
            <div className="mt-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm text-slate-600"><span className="size-2 rounded-full bg-[#2F5FD0]" />运行次数</span>
              <span className="text-sm font-semibold text-slate-900">{hoverPoint.value}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm text-slate-600"><span className="size-2 rounded-full bg-[#10B981]" />成功次数</span>
              <span className="text-sm font-semibold text-slate-900">{hoverPoint.completed}</span>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

/* ─ Donut Chart ── */
function DonutChart({ items, total }: { items: DistributionItem[]; total: number }) {
  const size = 120, sw = 20, r = (size - sw) / 2, circ = 2 * Math.PI * r
  // 预计算每段的弧长与起始偏移（不可在 render 中就地累加）
  const segments = items.map((item, i) => {
    const dl = (item.value / 100) * circ
    const prev = items.slice(0, i).reduce((sum, it) => sum + (it.value / 100) * circ, 0)
    return { item, i, dl, doff: -prev }
  })
  return (
    <div className="relative mx-auto my-1.5" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments.map(({ item, i, dl, doff }) => (
          <circle key={`donut-${item.label}-${i}`} cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={sw}
            strokeDasharray={`${dl} ${circ - dl}`} strokeDashoffset={doff}
            strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-slate-900">{total}</span>
        <span className="text-[10px] text-slate-400">运行总数</span>
      </div>
    </div>
  )
}

/* ─ Status Badge ── */
function StatusBadge({ status }: { status: RunStatus }) {
  const s: Record<string, string> = {
    运行中: 'bg-blue-50 text-blue-600',
    成功: 'bg-emerald-50 text-emerald-600',
    失败: 'bg-rose-50 text-rose-600',
    已中止: 'bg-slate-100 text-slate-500',
  }
  return <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', s[status] ?? 'bg-slate-100 text-slate-500')}>{status}</span>
}

/* ─ Task Table ── */
function TaskTable({ tasks, onOpenRun, onOpenConversation }: {
  tasks: AnalyticsRunRecord[]
  onOpenRun: (run: AnalyticsRunRecord) => void
  onOpenConversation: (conversationId: string) => void
}) {
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 10
  const totalPages = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedTasks = tasks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // 筛选条件变化后回到第一页，避免停在空白页
  useEffect(() => { setPage(1) }, [tasks])

  if (tasks.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-slate-400">
        <EmptyState title="暂无匹配任务" description="尝试调整时间范围、筛选条件或搜索关键词" />
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-slate-100 text-sm font-medium text-slate-400">
            <th className="px-5 py-2.5">任务名称</th>
            <th className="px-5 py-2.5">Agent</th>
            <th className="px-5 py-2.5">开始时间</th>
            <th className="px-5 py-2.5">运行时长</th>
            <th className="px-5 py-2.5">Token</th>
            <th className="px-5 py-2.5">状态</th>
            <th className="px-5 py-2.5 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {pagedTasks.map((run) => (
            <tr key={`row-${run.id}`} className="border-b border-slate-50 transition hover:bg-slate-50/50">
              <td className="max-w-[280px] px-5 py-3">
                <div className="truncate font-medium text-slate-800" title={run.title}>{run.title}</div>
                {run.isSubRun && <span className="text-[10px] text-slate-400">子任务</span>}
              </td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="max-w-[120px] truncate text-slate-700" title={run.agentName}>{run.agentName}</span>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{run.category}</span>
                </div>
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-slate-500">{run.createdAt}</td>
              <td className="whitespace-nowrap px-5 py-3 text-slate-500">{run.duration}</td>
              <td className="whitespace-nowrap px-5 py-3 text-slate-500">{run.totalTokens > 0 ? formatTok(run.totalTokens) : '—'}</td>
              <td className="px-5 py-3"><StatusBadge status={run.status} /></td>
              <td className="px-5 py-3 text-right">
                <button type="button" onClick={() => onOpenRun(run)} className="mr-3 text-[13px] font-medium text-[#2F5FD0] hover:text-[#244FB3]">查看</button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`任务「${run.title}」的操作`}
                      className="inline-flex size-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => onOpenRun(run)}>
                      <Search className="size-3.5" />
                      运行详情
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onOpenConversation(run.conversationId)}>
                      <LogIn className="size-3.5" />
                      打开会话
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* 分页控件 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          <span className="text-sm text-slate-400">共 {tasks.length} 条，第 {currentPage}/{totalPages} 页</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="size-3.5" />上一页
            </button>
            {buildPageNumbers(currentPage, totalPages).map((p, i) =>
              p === '…' ? (
                <span key={`gap-${i}`} className="px-1 text-sm text-slate-400">…</span>
              ) : (
                <button
                  key={`page-${p}`}
                  type="button"
                  onClick={() => setPage(p as number)}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-md text-sm font-medium transition',
                    p === currentPage ? 'bg-[#2F5FD0] text-white' : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  {p}
                </button>
              ),
            )}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              下一页<ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** 页码序列：首页 + 当前页附近 + 末页，中间用省略号 */
function buildPageNumbers(current: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set<number>([1, total, current, current - 1, current + 1])
  const sorted = Array.from(pages).filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out: Array<number | '…'> = []
  let prev = 0
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push('…')
    out.push(p)
    prev = p
  }
  return out
}

/* ─ Data mapping ── */
export function mapRunItem(item: RunAnalyticsItem): AnalyticsRunRecord {
  const status: RunStatus =
    item.status === 'success' ? '成功'
      : item.status === 'running' ? '运行中'
        : item.status === 'aborted' ? '已中止'
          : '失败'
  return {
    id: item.id,
    conversationId: item.conversationId,
    agentId: item.agentId,
    agentName: item.agentName,
    title: item.title,
    category: item.category,
    status,
    duration: item.durationMs === null ? '进行中' : formatDuration(item.durationMs),
    time: formatRelativeRunTime(item.startedAt),
    createdAt: formatCreatedAt(item.startedAt),
    startedAt: item.startedAt,
    totalTokens: item.totalTokens,
    isSubRun: item.isSubRun,
  }
}

export function formatDuration(value: number | null): string {
  if (value === null) return '—'
  if (value < 1000) return `${value}ms`
  const s = Math.max(0, Math.round(value / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60); const sec = s % 60
  return sec > 0 ? `${m}分${sec}秒` : `${m}分`
}

function formatRelativeRunTime(value: number): string {
  const now = new Date(); const target = new Date(value)
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const td = new Date(target); td.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - td.getTime()) / 86400000)
  const clock = target.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (diff === 0) return `今日 ${clock}`; if (diff === 1) return `昨日 ${clock}`
  if (diff > 1 && diff < 7) return `${diff} 天前`
  return target.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function formatCreatedAt(value: number): string {
  const d = new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatTok(n: number): string {
  if (n < 1000) return `${n}`; if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`; return `${(n / 1_000_000).toFixed(2)}M`
}

function buildLiveActivities(runs: AnalyticsRunRecord[]): LiveActivityItem[] {
  return runs.slice(0, 8).map((run) => ({
    time: extractLiveTime(run.time),
    title: run.title,
    description: `${run.agentName} · ${run.category}`,
    status: run.status,
  }))
}

/** 从相对时间文案中提取时间轴标签：`今日 14:32` → `14:32`；`3 天前`/`05-21` → 原样保留 */
function extractLiveTime(value: string): string {
  const trimmed = value.trim()
  const clock = trimmed.match(/(\d{1,2}:\d{2})$/)
  return clock ? clock[1] : trimmed || '—'
}

/* ── 自动化工作区复用的映射 ──
 * 数据源是 automation_runs（自动化任务运行），与概览页的 agent_runs 是两张不同的表，
 * 不要混用 —— 概览页 v3 之前的「任务列表只显示几条」就是因为把它们当成了一回事。 */
export type AutomationRunRecord = {
  id: string
  conversationId: string | null
  agentRunId: string | null
  title: string
  category: string
  status: '成功' | '失败' | '运行中'
  duration: string
  time: string
  createdAt: string
}

export function mapAutomationRun(item: AutomationRunListItem): AutomationRunRecord {
  return {
    id: item.id,
    conversationId: item.conversationId,
    agentRunId: item.agentRunId,
    title: item.title,
    category: item.category,
    status: item.status === 'success' ? '成功' : item.status === 'running' ? '运行中' : '失败',
    duration: item.status === 'running' ? '进行中' : formatDuration(item.durationMs),
    time: formatRelativeRunTime(item.startedAt),
    createdAt: formatCreatedAt(item.startedAt),
  }
}
