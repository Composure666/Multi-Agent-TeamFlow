'use client'
// analytics-workspace.tsx - v3: full feature restore, real data, unique keys

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
  FileCode2,
  Filter,
  MoreHorizontal,
  RefreshCw,
  Search,
  TrendingUp,
  Workflow,
  X,
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
  fetchUsageSummary,
  type AutomationDashboard,
  type AutomationRunListItem,
  type AutomationTrendPoint,
  type UsageSummary,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'

type AnalyticsRunRecord = {
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

type AnalyticsDistributionItem = {
  label: string
  value: number
  count: number
}

type LiveActivityItem = {
  time: string
  title: string
  description: string
  status: '运行中' | '已完成' | '失败'
}

type TaskListTab = '全部' | '运行中' | '已完成' | '失败'

const CHART_COLORS = ['#2F5FD0', '#7C3AED', '#10B981', '#F59E0B', '#6B7280']

function getDateRangeForPreset(preset: string): { start: string; end: string; days: number } {
  const now = new Date()
  const end = now.toISOString().slice(0, 10)
  if (preset === '最近30天') return { start: new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10), end, days: 30 }
  if (preset === '最近90天') return { start: new Date(now.getTime() - 89 * 86400000).toISOString().slice(0, 10), end, days: 90 }
  return { start: new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10), end, days: 7 }
}

export function AnalyticsWorkspace() {
  const [usageData, setUsageData] = useState<UsageSummary | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageError, setUsageError] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<AutomationDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [taskTab, setTaskTab] = useState<TaskListTab>('全部')
  const [taskSearch, setTaskSearch] = useState('')
  const [taskCategoryFilter, setTaskCategoryFilter] = useState<Set<string>>(new Set())
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const [hoveredBar, setHoveredBar] = useState<number | null>(null)
  const [hoveredLine, setHoveredLine] = useState<number | null>(null)
  const [dateRangeOpen, setDateRangeOpen] = useState(false)
  const dateRangeRef = useRef<HTMLDivElement>(null)
  const [datePreset, setDatePreset] = useState('最近7天')
  const [dateStart, setDateStart] = useState(() => getDateRangeForPreset('最近7天').start)
  const [dateEnd, setDateEnd] = useState(() => getDateRangeForPreset('最近7天').end)
  const openRunBoardTarget = useAppStore((state) => state.openRunBoardTarget)

  const load = useCallback(async () => {
    setLoading(true); setUsageLoading(true); setError(null); setUsageError(null)
    try {
      const startTs = new Date(dateStart).getTime()
      const endTs = new Date(dateEnd).getTime() + 86400000 - 1
      const days = Math.max(1, Math.round((endTs - startTs) / 86400000))
      const [nextDashboard, nextUsage] = await Promise.all([
        fetchAutomationDashboard({ start: startTs, end: endTs, days }),
        fetchUsageSummary({ start: startTs, end: endTs }),
      ])
      setDashboard(nextDashboard); setUsageData(nextUsage)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message); setUsageError(message)
    } finally { setLoading(false); setUsageLoading(false) }
  }, [dateStart, dateEnd])

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

  const recentRuns = useMemo(() => (dashboard?.recentRuns ?? []).map(mapAutomationRun), [dashboard?.recentRuns])
  const trend = useMemo(() => {
    const raw = dashboard?.trend.length ? dashboard.trend : buildEmptyWeekTrend()
    // 长周期（>31 天）按周聚合，避免柱体过密
    if (raw.length > 31) {
      const weeks: (AutomationTrendPoint & { idx: number })[] = []
      for (let i = 0; i < raw.length; i += 7) {
        const chunk = raw.slice(i, i + 7)
        const value = chunk.reduce((s, p) => s + p.value, 0)
        const completed = chunk.reduce((s, p) => s + (p.completed ?? 0), 0)
        weeks.push({ label: chunk[0].label, value, completed, idx: weeks.length })
      }
      return weeks
    }
    return raw.map((p, i) => ({ ...p, idx: i }))
  }, [dashboard])
  const maxTrend = Math.max(...trend.map((p) => Math.max(p.value, p.completed ?? 0)), 1)
  const distribution = useMemo(() => buildAgentDistribution(dashboard?.recentRuns ?? []), [dashboard?.recentRuns])
  const successRate = calculateSuccessRate(dashboard?.recentRuns ?? [])
  const failedRuns = dashboard?.recentRuns.filter((r) => r.status === 'failed').length ?? 0
  const totalRuns = usageData?.allTime.runs ?? 0
  const selectedRuns = usageData?.selected.runs ?? 0
  const todayRuns = usageData?.today.runs ?? 0
  const selectedTokens = usageData?.selected.totalTokens ?? 0
  const todayTokens = usageData?.today.totalTokens ?? 0
  const prevSelectedRuns = usageData?.prevSelected.runs ?? 0
  const prevSelectedTokens = usageData?.prevSelected.totalTokens ?? 0
  const allTokens = usageData?.allTime.totalTokens ?? 0
  const automationCount = dashboard?.automations.length ?? 0
  const activeAutomationCount = dashboard?.automations.filter((a) => a.status === 'enabled' || a.status === 'running').length ?? 0

  // Compute trend values for KPI sparklines and trend arrows
  const runsTrend = prevSelectedRuns > 0 ? Math.round(((selectedRuns - prevSelectedRuns) / prevSelectedRuns) * 100) : 0
  const tokensTrend = prevSelectedTokens > 0 ? Math.round(((selectedTokens - prevSelectedTokens) / prevSelectedTokens) * 1000) / 10 : 0

  const openRunTarget = useCallback((run: AnalyticsRunRecord) => {
    if (!run.conversationId) return
    openRunBoardTarget({ conversationId: run.conversationId, runId: run.agentRunId ?? undefined })
  }, [openRunBoardTarget])

  const liveActivities = useMemo(() => buildLiveActivities(recentRuns), [recentRuns])
  const taskTypeDistribution = useMemo(() => buildTaskTypeDistribution(recentRuns), [recentRuns])
  // 从 recentRuns 派生可筛的 Agent 类型列表（按出现频次降序，稳定）
  const availableTaskCategories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const run of recentRuns) counts.set(run.category, (counts.get(run.category) ?? 0) + 1)
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([label]) => label)
  }, [recentRuns])

  const filteredTasks = useMemo(() => {
    let tasks = recentRuns
    if (taskTab !== '全部') tasks = tasks.filter((r) => r.status === taskTab)
    if (taskCategoryFilter.size > 0) tasks = tasks.filter((r) => taskCategoryFilter.has(r.category))
    if (taskSearch.trim()) {
      const q = taskSearch.trim().toLowerCase()
      tasks = tasks.filter((r) => r.title.toLowerCase().includes(q) || r.category.toLowerCase().includes(q))
    }
    return tasks
  }, [recentRuns, taskTab, taskSearch, taskCategoryFilter])

  const isInitialLoading = (loading || usageLoading) && !dashboard && !usageData
  const loadError = error ?? usageError


  const handleExport = useCallback(() => {
    const data = {
      exportedAt: new Date().toISOString(),
      dateRange: { preset: datePreset, start: dateStart, end: dateEnd },
      summary: {
        totalRuns, selectedRuns, todayRuns,
        selectedTokens, todayTokens, allTokens,
        automationCount, successRate,
        prevSelectedRuns, prevSelectedTokens,
      },
      usage: {
        allTime: usageData?.allTime,
        today: usageData?.today,
        selected: usageData?.selected,
        prevSelected: usageData?.prevSelected,
      },
      automationStats: dashboard?.stats,
      trend: trend.map(p => ({ label: p.label, value: p.value, completed: p.completed })),
      agentDistribution: distribution,
      taskTypeDistribution,
      recentRuns: recentRuns,
      liveActivities,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = "agenthub-analytics-" + dateStart + "_" + dateEnd + ".json"; a.click()
    URL.revokeObjectURL(url)
  }, [datePreset, dateStart, dateEnd, totalRuns, selectedRuns, todayRuns, selectedTokens, todayTokens, allTokens, automationCount, successRate, prevSelectedRuns, prevSelectedTokens, usageData, dashboard, trend, distribution, taskTypeDistribution, recentRuns, liveActivities])
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
            <button type="button" onClick={() => setDateRangeOpen(!dateRangeOpen)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition">
              <Calendar className="size-3.5 text-slate-400" />
              <span>{datePreset}</span>
              <ChevronDown className={cn("size-3 text-slate-400 transition", dateRangeOpen && "rotate-180")} />
            </button>
            {dateRangeOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {["最近7天", "最近30天", "最近90天"].map((p) => (
                  <button key={p} type="button" onClick={() => { const r = getDateRangeForPreset(p); setDatePreset(p); setDateStart(r.start); setDateEnd(r.end); setDateRangeOpen(false) }} className={cn("block w-full px-3 py-2 text-left text-xs transition hover:bg-slate-50", datePreset === p ? "text-[#2F5FD0] font-medium bg-blue-50/50" : "text-slate-600")}>{p}</button>
                ))}
                <div className="my-1 border-t border-slate-100" />
                <div className="px-3 py-2">
                  <div className="text-[10px] font-medium text-slate-400 mb-1.5">自定义范围</div>
                  <div className="flex items-center gap-1">
                    <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className="h-7 w-full rounded border border-slate-200 px-1.5 text-xs text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-200" />
                    <span className="text-slate-300">~</span>
                    <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="h-7 w-full rounded border border-slate-200 px-1.5 text-xs text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-200" />
                  </div>
                  <button type="button" onClick={() => { setDatePreset("自定义"); setDateRangeOpen(false) }} className="mt-1.5 w-full rounded bg-[#2F5FD0] py-1 text-xs font-medium text-white hover:bg-[#244FB3] transition">应用</button>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
            <span>{dateStart}</span>
            <span className="text-slate-300">~</span>
            <span>{dateEnd}</span>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg border-slate-200 text-xs" disabled={loading || usageLoading} onClick={() => void load()}>
            <RefreshCw className={cn('size-3', (loading || usageLoading) && 'animate-spin')} />
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
              <KpiCard icon={Bot} label="Agent 运行数" value={`${selectedRuns}`} trend={runsTrend} caption={`较上周期 ${prevSelectedRuns}`} subCaption={`今日 ${todayRuns} 次 · 全部 ${totalRuns} 次`} sparkline={trend.map(p => p.value)} tone="blue" />
              <KpiCard icon={Coins} label="Token 用量" value={formatTok(selectedTokens)} trend={tokensTrend} caption={`较上周期 ${formatTok(prevSelectedTokens)}`} subCaption={`今日 ${formatTok(todayTokens)} · 全部 ${formatTok(allTokens)}`} sparkline={trend.map(p => p.value)} tone="purple" />
              <KpiCard icon={Workflow} label="自动化任务" value={`${automationCount}`} trend={0} caption={`${activeAutomationCount} 个任务进行中`} subCaption={`启用 ${dashboard?.automations.filter((a) => a.status === 'enabled').length ?? 0} · 运行中 ${dashboard?.automations.filter((a) => a.status === 'running').length ?? 0}`} sparkline={trend.map(p => p.completed)} tone="emerald" />
              <KpiCard icon={CheckCircle2} label="自动化成功率" value={`${successRate}%`} trend={dashboard?.stats.previousSuccessRate ? Math.round(successRate - dashboard.stats.previousSuccessRate) : 0} caption="选中范围成功率" subCaption={failedRuns > 0 ? `${failedRuns} 次失败需关注` : '全部任务运行正常'} sparkline={trend.map(p => p.value > 0 ? Math.round((p.completed / p.value) * 100) : 0)} tone={failedRuns > 0 ? 'rose' : 'emerald'} />
            </div>

            {/* Main area: 3-column layout */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(220px,1fr)_minmax(240px,1.1fr)] lg:gap-5">
              {/* Left: Trend Chart */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between gap-2"><div><h2 className="text-[15px] font-semibold tracking-tight text-slate-900">运行趋势</h2>
                    <p className="mt-1 text-sm text-slate-500">展示近7天 Agent 运行次数与任务完成情况</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-5 text-sm text-slate-500">
                  <span className="flex items-center gap-2"><span className="inline-block size-2 rounded-full bg-[#2F5FD0]" />Agent 运行次数</span>
                  <span className="flex items-center gap-2"><span className="inline-block size-2 rounded-full bg-[#10B981]" />任务完成数</span>
                </div>
                <TrendChart data={trend} maxTrend={maxTrend} hoveredBar={hoveredBar} hoveredLine={hoveredLine} onHoverBar={setHoveredBar} onHoverLine={setHoveredLine} />
              </div>

              {/* Middle: Agent Type Distribution Donut */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold tracking-tight text-slate-900">Agent 类型分布</h2>
                </div>
                <DonutChart items={distribution} total={totalRuns} />
                <div className="mt-3 space-y-2">
                  {distribution.map((item, i) => (
                    <div key={`dist-${item.label}-${i}`} className="flex items-center justify-between text-[13px]">
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-slate-600">{item.label}</span>
                      </span>
                      <span className="text-slate-500">{item.value}% <span className="ml-1.5 text-slate-400">{item.count}</span></span>
                    </div>
                  ))}
                  {distribution.length === 0 && <div className="py-3 text-center text-xs text-slate-400">暂无分布数据</div>}
                </div>
              </div>

              {/* Right: Sidebar */}
              <div className="space-y-4 lg:row-span-2">{/* Live Activity */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">实时运行动态</h2>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600"><span className="size-1.5 rounded-full bg-emerald-500" />LIVE</span>
                  </div>
                  <div className="mt-3 space-y-0">
                    {liveActivities.length === 0 ? (
                      <div className="py-3 text-center text-xs text-slate-400">暂无实时动态</div>
                    ) : liveActivities.map((item, i) => {
                      const dotColor = item.status === '已完成' ? 'bg-emerald-500' : item.status === '运行中' ? 'bg-blue-500' : 'bg-rose-500'
                      const prevStatus = i > 0 ? liveActivities[i - 1].status : item.status
                      const lineColor = prevStatus === '已完成' ? 'bg-emerald-200' : prevStatus === '运行中' ? 'bg-blue-200' : 'bg-rose-200'
                      const isLast = i === liveActivities.length - 1
                      return (
                        <div key={`live-${i}-${item.title}`} className="flex gap-3">
                          {/* 时间线：时间 + 圆点 + 连接线 */}
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

                {/* Task Type Distribution */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">最近任务类型</h2>
                  <div className="mt-3 space-y-2.5">
                    {taskTypeDistribution.map((item, i) => (
                      <div key={`tt-${item.label}-${i}`}>
                        <div className="mb-1.5 flex items-center justify-between text-[13px]">
                          <span className="flex items-center gap-2 text-slate-600"><span className="size-1.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />{item.label}</span>
                          <span className="font-medium text-slate-700">{item.value}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{ width: `${item.value}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} /></div>
                      </div>
                    ))}
                    {taskTypeDistribution.length === 0 && <div className="py-3 text-center text-xs text-slate-400">暂无分布数据</div>}
                  </div>
                </div>
              </div>
            {/* Task List */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md lg:col-span-2">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
                <div><h2 className="text-[15px] font-semibold tracking-tight text-slate-900">任务列表</h2></div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                    <Input value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} placeholder="搜索任务名称 / Agent 名称..." className="h-8 w-60 rounded-lg border-slate-200 bg-slate-50 pl-8 text-xs shadow-none focus-visible:ring-1 focus-visible:ring-blue-200" />
                  </div>
                  {/* 筛选下拉：按 Agent 类型多选，与搜索/状态 tab 组合生效 */}
                  <DropdownMenu open={filterMenuOpen} onOpenChange={setFilterMenuOpen}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          'h-8 w-8 rounded-lg border-slate-200 p-0',
                          taskCategoryFilter.size > 0 && 'border-[#2F5FD0] bg-blue-50/60 text-[#2F5FD0]',
                        )}
                        aria-label="筛选 Agent 类型"
                      >
                        <Filter className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuLabel className="flex items-center justify-between">
                        <span>按 Agent 类型筛选</span>
                        {taskCategoryFilter.size > 0 && (
                          <button
                            type="button"
                            onClick={() => setTaskCategoryFilter(new Set())}
                            className="text-xs font-normal text-[#2F5FD0] hover:underline"
                          >
                            清除 ({taskCategoryFilter.size})
                          </button>
                        )}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {availableTaskCategories.length === 0 && (
                        <div className="px-2 py-2 text-sm text-slate-400">暂无 Agent 类型</div>
                      )}
                      {availableTaskCategories.map((category) => (
                        <DropdownMenuCheckboxItem
                          key={`cat-${category}`}
                          checked={taskCategoryFilter.has(category)}
                          onCheckedChange={(checked) => {
                            setTaskCategoryFilter((prev) => {
                              const next = new Set(prev)
                              if (checked) next.add(category)
                              else next.delete(category)
                              return next
                            })
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {category}
                        </DropdownMenuCheckboxItem>
                      ))}
                      {taskCategoryFilter.size > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setTaskCategoryFilter(new Set())
                              setFilterMenuOpen(false)
                            }}
                            className="text-[#2F5FD0]"
                          >
                            清除全部筛选
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="flex items-center gap-1 border-b border-slate-100 px-5">
                {(['全部', '运行中', '已完成', '失败'] as TaskListTab[]).map((tab) => {
                  const count = tab === '全部' ? recentRuns.length : recentRuns.filter((r) => r.status === tab).length
                  return (
                    <button key={`tab-${tab}`} type="button" onClick={() => setTaskTab(tab)} className={cn('relative px-3 py-2.5 text-[13px] font-medium transition', taskTab === tab ? 'text-[#2F5FD0]' : 'text-slate-500 hover:text-slate-700')}>
                      {tab}<span className={cn('ml-1.5 text-xs', taskTab === tab ? 'text-[#2F5FD0]' : 'text-slate-400')}>{count}</span>
                      {taskTab === tab && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#2F5FD0]" />}
                    </button>
                  )
                })}
              </div>
              <TaskTable tasks={filteredTasks} onOpenRun={openRunTarget} />
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
  trend: number; caption: string; subCaption: string; sparkline: number[];
  tone: 'blue' | 'purple' | 'emerald' | 'rose'
}) {
  const tones: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', purple: 'bg-purple-50 text-purple-600',
    emerald: 'bg-emerald-50 text-emerald-600', rose: 'bg-rose-50 text-rose-600',
  }
  const sparkColor = tone === 'blue' ? '#2F5FD0' : tone === 'purple' ? '#7C3AED' : tone === 'emerald' ? '#10B981' : '#F43F5E'
  const trendUp = trend >= 0
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
          <div className={cn('mt-2 flex items-center gap-1 text-sm font-medium', trendUp ? 'text-emerald-600' : 'text-rose-500')}>
            <TrendingUp className={cn('size-3.5', !trendUp && 'rotate-180')} />
            <span>{trendUp ? '+' : ''}{trend > 100 ? `${Math.round(trend / 10) / 10}%` : `${trend}%`}</span>
            <span className="ml-1 font-normal text-slate-400">{caption}</span>
          </div>
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
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`)
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
  data: (AutomationTrendPoint & { idx: number; completed: number })[];
  maxTrend: number; hoveredBar: number | null; hoveredLine: number | null;
  onHoverBar: (i: number | null) => void; onHoverLine: (i: number | null) => void;
}) {
  const chartH = 160, padL = 40, padR = 16, padT = 16, padB = 24
  const svgW = 560, svgH = chartH + padT + padB
  const plotW = svgW - padL - padR, plotH = chartH
  const gap = plotW / data.length
  const barW = Math.max(12, Math.min(32, gap * 0.45))
  const yTicks = [0, Math.round(maxTrend * 0.25), Math.round(maxTrend * 0.5), Math.round(maxTrend * 0.75), maxTrend]
  // 折线点位（与柱体共用同一 x 轴和 y 轴，确保共生）
  const linePts = data.map((p, i) => {
    const x = padL + gap * i + gap / 2
    const y = padT + plotH - ((p.completed ?? 0) / maxTrend) * plotH
    return { x, y, value: p.completed ?? 0, label: p.label, idx: p.idx }
  })
  const linePath = linePts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${linePts[linePts.length - 1]?.x ?? padL},${padT + plotH} L${linePts[0]?.x ?? padL},${padT + plotH} Z`

  // Tooltip：用 HTML 绝对定位，避免 SVG 裁剪；hoverIndex 同时服务柱和线
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
        {/* Grid */}
        {yTicks.map((tick, i) => {
          const y = padT + plotH - (tick / maxTrend) * plotH
          return (
            <g key={`yt-${i}-${tick}`}>
              <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="#F4F6FA" strokeWidth="1" />
              <text x={padL - 8} y={y + 3} textAnchor="end" fill="#CBD5E1" fontSize="10">{tick}</text>
            </g>
          )
        })}
        {/* 完成数区域填充（与柱体共生） */}
        {linePts.length > 1 && <path d={areaPath} fill="url(#trend-area)" />}
        {/* Bars */}
        {data.map((point, i) => {
          const cx = padL + gap * i + gap / 2
          const barH = (point.value / maxTrend) * plotH
          const y = padT + plotH - barH
          const isH = hoveredBar === i
          return (
            <g key={`bar-${point.idx}`} onMouseEnter={() => onHoverBar(i)} onMouseLeave={() => onHoverBar(null)} className="cursor-pointer">
              <rect x={cx - barW / 2} y={y} width={barW} height={barH} rx="3" fill={isH ? '#1d4ed8' : '#2F5FD0'} opacity={isH ? 1 : 0.85} />
              <text x={cx} y={padT + plotH + 18} textAnchor="middle" fill="#94A3B8" fontSize="10">{point.label}</text>
            </g>
          )
        })}
        {/* Line */}
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
      {/* HTML Tooltip：定位在容器内，自动翻转不越界 */}
      {hoverPoint && hoverIdx !== null && (() => {
        const cx = padL + gap * hoverIdx + gap / 2
        const cxPct = (cx / svgW) * 100
        const flipX = cxPct > 70
        const left = flipX ? `calc(${cxPct}% - ${TT_W}px - 12px)` : `calc(${cxPct}% + 12px)`
        return (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg"
            style={{ left, width: TT_W }}
          >
            <div className="text-xs font-medium text-slate-500">{hoverPoint.label}</div>
            <div className="mt-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm text-slate-600"><span className="size-2 rounded-full bg-[#2F5FD0]" />Agent 运行次数</span>
              <span className="text-sm font-semibold text-slate-900">{hoverPoint.value}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm text-slate-600"><span className="size-2 rounded-full bg-[#10B981]" />任务完成数</span>
              <span className="text-sm font-semibold text-slate-900">{hoverPoint.completed ?? 0}</span>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

/* ─ Donut Chart ── */
function DonutChart({ items, total }: { items: AnalyticsDistributionItem[]; total: number }) {
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
        <span className="text-[10px] text-slate-400">总运行次数</span>
      </div>
    </div>
  )
}

/* ─ Status Badge ── */
function StatusBadge({ status }: { status: '运行中' | '已完成' | '等待中' | '成功' | '失败' }) {
  const s: Record<string, string> = { 运行中: 'bg-blue-50 text-blue-600', 已完成: 'bg-emerald-50 text-emerald-600', 等待中: 'bg-amber-50 text-amber-600', 成功: 'bg-emerald-50 text-emerald-600', 失败: 'bg-rose-50 text-rose-600' }
  return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', s[status] ?? 'bg-slate-100 text-slate-500')}>{status}</span>
}

/* ─ Task Table ── */
function TaskTable({ tasks, onOpenRun }: { tasks: AnalyticsRunRecord[]; onOpenRun: (run: AnalyticsRunRecord) => void }) {
  // 本地已删除 ID 集合 —— 真实后端删除接口未接入前，先在视图层隐藏，
  // 这样删除操作有真实交互反馈（行消失 + toast），又不会触碰全局 store。
  const [localRemovedIds, setLocalRemovedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 8
  const addNotification = useAppStore((s) => s.addNotification)
  const visibleTasks = tasks.filter((task) => !localRemovedIds.has(task.id))
  const totalPages = Math.max(1, Math.ceil(visibleTasks.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedTasks = visibleTasks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const handleCopyTitle = useCallback(
    async (run: AnalyticsRunRecord) => {
      try {
        await navigator.clipboard.writeText(run.title)
        addNotification({
          id: `ntf_copy_${run.id}_${Date.now()}`,
          title: '任务名称已复制',
          body: `已复制「${run.title}」到剪贴板。`,
          level: 'success',
          source: 'ui',
          category: 'task',
          createdAt: Date.now(),
          toast: true,
        })
      } catch {
        addNotification({
          id: `ntf_copy_err_${run.id}_${Date.now()}`,
          title: '复制失败',
          body: '剪贴板不可用，请检查浏览器权限。',
          level: 'error',
          source: 'ui',
          category: 'task',
          createdAt: Date.now(),
          toast: true,
        })
      }
    },
    [addNotification],
  )

  const handleRerun = useCallback(
    (run: AnalyticsRunRecord) => {
      // 当前数据源是后端运行历史的只读视图，「重新运行」需切换到新建任务流；
      // 这里给出明确反馈，避免静默点击。
      if (run.status === '运行中') return
      addNotification({
        id: `ntf_rerun_${run.id}_${Date.now()}`,
        title: '已记录重运行意图',
        body: `任务「${run.title}」需要新的会话上下文，请前往「新建任务」使用相同配置。`,
        level: 'info',
        source: 'ui',
        category: 'task',
        createdAt: Date.now(),
        toast: true,
      })
    },
    [addNotification],
  )

  const handleRemove = useCallback(
    (run: AnalyticsRunRecord) => {
      const confirmed = typeof window === 'undefined' ? true : window.confirm(`确认从任务列表中移除「${run.title}」？`)
      if (!confirmed) return
      setLocalRemovedIds((prev) => {
        const next = new Set(prev)
        next.add(run.id)
        return next
      })
      addNotification({
        id: `ntf_remove_${run.id}_${Date.now()}`,
        title: '已从列表移除',
        body: `任务「${run.title}」已从当前视图移除。`,
        level: 'success',
        source: 'ui',
        category: 'task',
        createdAt: Date.now(),
        toast: true,
      })
    },
    [addNotification],
  )

  if (visibleTasks.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-slate-400">
        <EmptyState
          title={localRemovedIds.size > 0 ? '所有任务都已移除' : '暂无匹配任务'}
          description={localRemovedIds.size > 0 ? '刷新页面即可恢复列表' : '尝试调整筛选条件或搜索关键词'}
        />
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-slate-100 text-sm font-medium text-slate-400">
            <th className="px-5 py-2.5">任务名称</th>
            <th className="px-5 py-2.5">Agent 类型</th>
            <th className="px-5 py-2.5">创建时间</th>
            <th className="px-5 py-2.5">运行时长</th>
            <th className="px-5 py-2.5">状态</th>
            <th className="px-5 py-2.5 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {pagedTasks.map((run) => (
            <tr key={`row-${run.id}`} className="border-b border-slate-50 transition hover:bg-slate-50/50">
              <td className="px-5 py-3"><div className="truncate font-medium text-slate-800">{run.title}</div></td>
              <td className="px-5 py-3"><CategoryTag category={run.category} /></td>
              <td className="px-5 py-3 text-slate-500">{run.createdAt}</td>
              <td className="px-5 py-3 text-slate-500">{run.duration}</td>
              <td className="px-5 py-3"><StatusBadge status={run.status} /></td>
              <td className="px-5 py-3 text-right">
                <button type="button" onClick={() => onOpenRun(run)} className="mr-3 text-[13px] font-medium text-[#2F5FD0] hover:text-[#244FB3]">查看</button>
                {/* 行操作下拉：替代原本无响应的 MoreHorizontal */}
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
                      查看详情
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void handleCopyTitle(run)}>
                      <FileCode2 className="size-3.5" />
                      复制任务名称
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleRerun(run)} disabled={run.status === '运行中'}>
                      <RefreshCw className="size-3.5" />
                      重新运行
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => handleRemove(run)}>
                      <X className="size-3.5" />
                      从列表移除
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
          <span className="text-sm text-slate-400">共 {visibleTasks.length} 条，第 {currentPage}/{totalPages} 页</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="size-3.5" />上一页
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={`page-${p}`}
                type="button"
                onClick={() => setPage(p)}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md text-sm font-medium transition',
                  p === currentPage ? 'bg-[#2F5FD0] text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {p}
              </button>
            ))}
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

function CategoryTag({ category }: { category: string }) {
  const c: Record<string, string> = { 代码开发: 'bg-blue-50 text-blue-600', 内容文档: 'bg-purple-50 text-purple-600', 数据分析: 'bg-emerald-50 text-emerald-600', 设计产物: 'bg-amber-50 text-amber-600', 自定义任务: 'bg-slate-100 text-slate-600', 内容推送: 'bg-sky-50 text-sky-600', 兴趣推荐: 'bg-pink-50 text-pink-600', 项目报告: 'bg-indigo-50 text-indigo-600' }
  return <span className={cn('rounded-md px-2 py-0.5 text-sm font-medium', c[category] ?? 'bg-slate-100 text-slate-600')}>{category}</span>
}

/* ─ Backward compat exports ── */
export function AutomationRunRow({ run, table = false, onOpenRun }: { run: AnalyticsRunRecord; table?: boolean; onOpenRun?: (run: AnalyticsRunRecord) => void }) {
  return (
    <button type="button" onClick={() => onOpenRun?.(run)} className={cn('grid w-full gap-3 border-slate-100 bg-white p-3 text-left transition hover:bg-slate-50 sm:grid-cols-[minmax(0,1.3fr)_120px_88px_88px_80px] sm:items-center', table ? 'border-b last:border-b-0' : 'rounded-xl border')}>
      <div className="min-w-0"><div className="truncate text-sm font-medium text-slate-900">{run.title}</div><div className="mt-0.5 text-xs text-slate-500 sm:hidden">{run.category} · {run.duration} · {run.time}</div></div>
      <div className="hidden truncate text-xs text-slate-500 sm:block">{run.category}</div>
      <div className="hidden text-xs text-slate-500 sm:block">{run.duration}</div>
      <div className="hidden text-xs text-slate-500 sm:block">{run.time}</div>
      <span className={cn('w-fit rounded-full px-2 py-1 text-[10px] font-medium', run.status === '成功' ? 'bg-emerald-50 text-emerald-600' : run.status === '运行中' ? 'bg-blue-50 text-blue-600' : 'bg-rose-50 text-rose-600')}>{run.status}</span>
    </button>
  )
}

export function mapAutomationRun(item: AutomationRunListItem): AnalyticsRunRecord {
  return {
    id: item.id, conversationId: item.conversationId, agentRunId: item.agentRunId, title: item.title, category: item.category,
    status: item.status === 'success' ? '成功' : item.status === 'running' ? '运行中' : '失败',
    duration: item.status === 'running' ? '进行中' : formatDuration(item.durationMs),
    time: formatRelativeRunTime(item.startedAt), createdAt: formatCreatedAt(item.startedAt),
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
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatTok(n: number): string {
  if (n < 1000) return `${n}`; if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`; return `${(n / 1_000_000).toFixed(2)}M`
}

function calculateSuccessRate(runs: AutomationRunListItem[]): number {
  if (runs.length === 0) return 100
  return Math.round((runs.filter((r) => r.status === 'success').length / runs.length) * 100)
}

function buildEmptyWeekTrend(): AutomationTrendPoint[] {
  return ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label) => ({ label, value: 0, completed: 0 }))
}


function buildAgentDistribution(runs: AutomationRunListItem[]): AnalyticsDistributionItem[] {
  const counts = new Map<string, number>()
  for (const run of runs) counts.set(run.category, (counts.get(run.category) ?? 0) + 1)
  const total = runs.length
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count]) => ({ label, value: total > 0 ? Math.round((count / total) * 1000) / 10 : 0, count }))
}

function buildTaskTypeDistribution(runs: AnalyticsRunRecord[]): AnalyticsDistributionItem[] {
  const counts = new Map<string, number>()
  for (const run of runs) counts.set(run.category, (counts.get(run.category) ?? 0) + 1)
  const total = runs.length
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count]) => ({ label, value: total > 0 ? Math.round((count / total) * 1000) / 10 : 0, count }))
}

function buildLiveActivities(runs: AnalyticsRunRecord[]): LiveActivityItem[] {
  return runs.slice(0, 5).map((run) => ({
    time: extractLiveTime(run.time),
    title: run.title,
    description: run.category,
    status: run.status === '运行中' ? '运行中' : run.status === '成功' ? '已完成' : '失败',
  }))
}

/** 从相对时间文案中提取时间轴标签：`今日 14:32`/`昨日 14:32` → `14:32`；`3 天前`/`05-21` → 原样保留 */
function extractLiveTime(value: string): string {
  const trimmed = value.trim()
  const clock = trimmed.match(/(\d{1,2}:\d{2})$/)
  return clock ? clock[1] : trimmed || '—'
}







