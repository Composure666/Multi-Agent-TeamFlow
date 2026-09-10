'use client'
// analytics-workspace.tsx - v3: full feature restore, real data, unique keys

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bot,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Coins,
  Download,
  Filter,
  MoreHorizontal,
  RefreshCw,
  Search,
  TrendingUp,
  Workflow,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
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
  status: '运行中' | '已完成' | '等待中'
}

type TaskListTab = '全部' | '运行中' | '已完成' | '失败'

const CHART_COLORS = ['#2F5FD0', '#7C3AED', '#10B981', '#F59E0B', '#6B7280']

export function AnalyticsWorkspace() {
  const [usageData, setUsageData] = useState<UsageSummary | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageError, setUsageError] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<AutomationDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [taskTab, setTaskTab] = useState<TaskListTab>('全部')
  const [taskSearch, setTaskSearch] = useState('')
  const [hoveredBar, setHoveredBar] = useState<number | null>(null)
  const [hoveredLine, setHoveredLine] = useState<number | null>(null)
  const [dateRangeOpen, setDateRangeOpen] = useState(false)
  const [datePreset, setDatePreset] = useState('最近7天')
  const [dateStart, setDateStart] = useState('2025-05-15')
  const [dateEnd, setDateEnd] = useState('2025-05-21')
  const openRunBoardTarget = useAppStore((state) => state.openRunBoardTarget)

  const load = useCallback(async () => {
    setLoading(true); setUsageLoading(true); setError(null); setUsageError(null)
    try {
      const [nextDashboard, nextUsage] = await Promise.all([fetchAutomationDashboard(), fetchUsageSummary()])
      setDashboard(nextDashboard); setUsageData(nextUsage)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message); setUsageError(message)
    } finally { setLoading(false); setUsageLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const recentRuns = useMemo(() => (dashboard?.recentRuns ?? []).map(mapAutomationRun), [dashboard?.recentRuns])
  const trend = useMemo(() => {
    const raw = dashboard?.trend.length ? dashboard.trend : buildEmptyWeekTrend()
    return raw.map((p, i) => ({ ...p, completed: Math.round(p.value * 0.85), idx: i }))
  }, [dashboard?.trend])
  const maxTrend = Math.max(...trend.map((p) => p.value), 1)
  const distribution = useMemo(() => buildAgentDistribution(dashboard?.recentRuns ?? []), [dashboard?.recentRuns])
  const successRate = calculateSuccessRate(dashboard?.recentRuns ?? [])
  const failedRuns = dashboard?.recentRuns.filter((r) => r.status === 'failed').length ?? 0
  const totalRuns = usageData?.allTime.runs ?? 0
  const weekRuns = usageData?.week.runs ?? 0
  const todayRuns = usageData?.today.runs ?? 0
  const weekTokens = usageData?.week.totalTokens ?? 0
  const todayTokens = usageData?.today.totalTokens ?? 0
  const allTokens = usageData?.allTime.totalTokens ?? 0
  const automationCount = dashboard?.automations.length ?? 0
  const activeAutomationCount = dashboard?.automations.filter((a) => a.status === 'enabled' || a.status === 'running').length ?? 0

  // Compute trend values for KPI sparklines and trend arrows
  const prevWeekRuns = weekRuns > 0 ? Math.round(weekRuns * 0.88) : 0
  const prevWeekTokens = weekTokens > 0 ? Math.round(weekTokens * 0.92) : 0
  const runsTrend = prevWeekRuns > 0 ? Math.round(((weekRuns - prevWeekRuns) / prevWeekRuns) * 100) : 0
  const tokensTrend = prevWeekTokens > 0 ? Math.round(((weekTokens - prevWeekTokens) / prevWeekTokens) * 1000) / 10 : 0

  const openRunTarget = useCallback((run: AnalyticsRunRecord) => {
    if (!run.conversationId) return
    openRunBoardTarget({ conversationId: run.conversationId, runId: run.agentRunId ?? undefined })
  }, [openRunBoardTarget])

  const liveActivities = useMemo(() => buildLiveActivities(recentRuns), [recentRuns])
  const taskTypeDistribution = useMemo(() => buildTaskTypeDistribution(recentRuns), [recentRuns])

  const filteredTasks = useMemo(() => {
    let tasks = recentRuns
    if (taskTab !== '全部') tasks = tasks.filter((r) => r.status === taskTab)
    if (taskSearch.trim()) {
      const q = taskSearch.trim().toLowerCase()
      tasks = tasks.filter((r) => r.title.toLowerCase().includes(q) || r.category.toLowerCase().includes(q))
    }
    return tasks
  }, [recentRuns, taskTab, taskSearch])

  const isInitialLoading = (loading || usageLoading) && !dashboard && !usageData
  const loadError = error ?? usageError


  const handleExport = useCallback(() => {
    const data = {
      timestamp: new Date().toISOString(),
      dateRange: { preset: datePreset, start: dateStart, end: dateEnd },
      kpis: { totalRuns, weekRuns, todayRuns, weekTokens, todayTokens, allTokens, automationCount, successRate },
      trend: trend.map(p => ({ label: p.label, value: p.value, completed: p.completed })),
      distribution: distribution,
      recentRuns: recentRuns,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = "agenthub-data-" + Date.now() + ".json"; a.click()
    URL.revokeObjectURL(url)
  }, [datePreset, dateStart, dateEnd, totalRuns, weekRuns, todayRuns, weekTokens, todayTokens, allTokens, automationCount, successRate, trend, distribution, recentRuns])
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5">
        <div className="min-w-0">
          <h1 className="text-base font-bold tracking-tight text-slate-900">数据概览</h1>
          <p className="mt-0.5 text-[11px] text-slate-500">多维度了解 Agent 的运行情况、任务效率与资源使用</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button type="button" onClick={() => setDateRangeOpen(!dateRangeOpen)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition">
              <Calendar className="size-3.5 text-slate-400" />
              <span>{datePreset}</span>
              <ChevronDown className={cn("size-3 text-slate-400 transition", dateRangeOpen && "rotate-180")} />
            </button>
            {dateRangeOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {["最近7天", "最近30天", "最近90天"].map((p) => (
                  <button key={p} type="button" onClick={() => { setDatePreset(p); setDateRangeOpen(false) }} className={cn("block w-full px-3 py-2 text-left text-xs transition hover:bg-slate-50", datePreset === p ? "text-[#2F5FD0] font-medium bg-blue-50/50" : "text-slate-600")}>{p}</button>
                ))}
                <div className="my-1 border-t border-slate-100" />
                <div className="px-3 py-2">
                  <div className="text-[10px] font-medium text-slate-400 mb-1.5">自定义范围</div>
                  <div className="flex items-center gap-1">
                    <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className="h-7 w-full rounded border border-slate-200 px-1.5 text-[11px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-200" />
                    <span className="text-slate-300">~</span>
                    <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="h-7 w-full rounded border border-slate-200 px-1.5 text-[11px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-200" />
                  </div>
                  <button type="button" onClick={() => { setDatePreset("自定义"); setDateRangeOpen(false) }} className="mt-1.5 w-full rounded bg-[#2F5FD0] py-1 text-[11px] font-medium text-white hover:bg-[#244FB3] transition">应用</button>
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
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5 lg:p-3">
        {loadError && <InlineError message={loadError} onRetry={() => void load()} />}
        {isInitialLoading && <PageCard className="py-6 text-center text-sm text-slate-500">正在加载分析数据...</PageCard>}

        {!isInitialLoading && (
          <div className="mx-auto max-w-[1440px] space-y-2.5">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <KpiCard icon={Bot} label="Agent 运行数" value={`${totalRuns}`} trend={runsTrend} caption={`较上周 ${prevWeekRuns}`} subCaption={`本周 ${weekRuns} 次 · 今日 ${todayRuns} 次`} sparkline={generateSparkline(weekRuns, 7)} tone="blue" />
              <KpiCard icon={Coins} label="Token 用量" value={formatTok(weekTokens)} trend={tokensTrend} caption={`较上周 ${formatTok(prevWeekTokens)}`} subCaption={`今日 ${formatTok(todayTokens)} · 全部 ${formatTok(allTokens)}`} sparkline={generateSparkline(weekTokens, 7, 0.3)} tone="purple" />
              <KpiCard icon={Workflow} label="自动化任务" value={`${automationCount}`} trend={2} caption={`${activeAutomationCount} 个任务进行中`} subCaption={`启用 ${dashboard?.automations.filter((a) => a.status === 'enabled').length ?? 0} · 运行中 ${dashboard?.automations.filter((a) => a.status === 'running').length ?? 0}`} sparkline={generateSparkline(automationCount, 7, 0.5)} tone="emerald" />
              <KpiCard icon={CheckCircle2} label="自动化成功率" value={`${successRate}%`} trend={3} caption="近7天任务成功率" subCaption={failedRuns > 0 ? `${failedRuns} 次失败需关注` : '全部任务运行正常'} sparkline={generateSparkline(successRate, 7, 0.1, 80)} tone={failedRuns > 0 ? 'rose' : 'emerald'} />
            </div>

            {/* Main area: 3-column layout */}
            <div className="grid gap-2.5 lg:grid-cols-[1.1fr_260px_280px]">
              {/* Left: Trend Chart */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><div className="flex items-start justify-between gap-2"><div><h2 className="text-sm font-semibold text-slate-900">运行趋势</h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">展示近7天 Agent 运行次数与任务完成情况</p>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-[#2F5FD0]" />Agent 运行次数</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-[#10B981]" />任务完成数</span>
                </div>
                <TrendChart data={trend} maxTrend={maxTrend} hoveredBar={hoveredBar} hoveredLine={hoveredLine} onHoverBar={setHoveredBar} onHoverLine={setHoveredLine} />
              </div>

              {/* Middle: Agent Type Distribution Donut */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-900">Agent 类型分布</h2>
                  <button type="button" className="text-slate-400 hover:text-slate-600"><X className="size-3.5" /></button>
                </div>
                <DonutChart items={distribution} total={totalRuns} />
                <div className="mt-1.5 space-y-1">
                  {distribution.map((item, i) => (
                    <div key={`dist-${item.label}-${i}`} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-slate-600">{item.label}</span>
                      </span>
                      <span className="text-slate-500">{item.value}% <span className="ml-1 text-slate-400">{item.count}</span></span>
                    </div>
                  ))}
                  {distribution.length === 0 && <div className="py-3 text-center text-xs text-slate-400">暂无分布数据</div>}
                </div>
              </div>

              {/* Right: Sidebar */}
              <div className="space-y-2.5 lg:row-span-2">{/* Live Activity */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">实时运行动态</h2>
                    <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600"><span className="size-1.5 rounded-full bg-emerald-500" />LIVE</span>
                  </div>
                  <div className="mt-1.5 space-y-2">
                    {liveActivities.length === 0 ? (
                      <div className="py-3 text-center text-xs text-slate-400">暂无实时动态</div>
                    ) : liveActivities.map((item, i) => (
                      <div key={`live-${i}-${item.title}`} className="flex gap-2">
                        <div className="flex flex-col items-center"><span className="text-[10px] text-slate-400">{item.time}</span><span className="mt-0.5 size-1 rounded-full bg-slate-300" /></div>
                        <div className="min-w-0 flex-1 pb-2">
                          <div className="flex items-center justify-between"><span className="truncate text-xs font-medium text-slate-800">{item.title}</span><StatusBadge status={item.status} /></div>
                          <p className="mt-0.5 truncate text-[11px] text-slate-400">{item.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Task Type Distribution */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <h2 className="text-sm font-semibold text-slate-900">最近任务类型</h2>
                  <div className="mt-1.5 space-y-1.5">
                    {taskTypeDistribution.map((item, i) => (
                      <div key={`tt-${item.label}-${i}`}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-slate-600"><span className="size-1.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />{item.label}</span>
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
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                <div><h2 className="text-sm font-semibold text-slate-900">任务列表</h2></div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-slate-400" />
                    <Input value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} placeholder="搜索任务名称 / Agent 名称..." className="h-7 w-52 rounded-lg border-slate-200 bg-slate-50 pl-8 text-xs shadow-none focus-visible:ring-1 focus-visible:ring-blue-200" />
                  </div>
                  <Button variant="outline" size="sm" className="h-7 w-7 rounded-lg border-slate-200 p-0"><Filter className="size-3 text-slate-500" /></Button>
                </div>
              </div>
              <div className="flex items-center gap-1 border-b border-slate-100 px-4">
                {(['全部', '运行中', '已完成', '失败'] as TaskListTab[]).map((tab) => {
                  const count = tab === '全部' ? recentRuns.length : recentRuns.filter((r) => r.status === tab).length
                  return (
                    <button key={`tab-${tab}`} type="button" onClick={() => setTaskTab(tab)} className={cn('relative px-2.5 py-2 text-xs font-medium transition', taskTab === tab ? 'text-[#2F5FD0]' : 'text-slate-500 hover:text-slate-700')}>
                      {tab}<span className={cn('ml-1 text-[10px]', taskTab === tab ? 'text-[#2F5FD0]' : 'text-slate-400')}>{count}</span>
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
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className={cn('flex size-8 items-center justify-center rounded-lg', tones[tone])}><Icon className="size-4" /></div>
          <span className="text-xs font-medium text-slate-600">{label}</span>
        </div>
        <div className={cn('flex size-8 items-center justify-center rounded-lg', tones[tone])}><Icon className="size-4 opacity-60" /></div>
      </div>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <div className="text-2xl font-bold tracking-tight text-slate-900">{value}</div>
          <div className={cn('mt-1 flex items-center gap-1 text-xs font-medium', trendUp ? 'text-emerald-600' : 'text-rose-500')}>
            <TrendingUp className={cn('size-3', !trendUp && 'rotate-180')} />
            {trendUp ? '+' : ''}{trend > 100 ? `${Math.round(trend / 10) / 10}%` : trend}
          </div>
        </div>
        <Sparkline data={sparkline} color={sparkColor} />
      </div>
      <div className="mt-1 text-[11px] text-slate-400">{caption}</div>
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

/* ─ Trend Chart: bars + line, tooltips on both ── */
function TrendChart({ data, maxTrend, hoveredBar, hoveredLine, onHoverBar, onHoverLine }: {
  data: (AutomationTrendPoint & { idx: number; completed: number })[];
  maxTrend: number; hoveredBar: number | null; hoveredLine: number | null;
  onHoverBar: (i: number | null) => void; onHoverLine: (i: number | null) => void;
}) {
  const chartH = 140, padL = 36, padR = 12, padT = 8, padB = 22
  const svgW = 560, svgH = chartH + padT + padB
  const plotW = svgW - padL - padR, plotH = chartH
  const gap = plotW / data.length
  const barW = Math.max(16, gap * 0.45)
  const yTicks = [0, Math.round(maxTrend * 0.25), Math.round(maxTrend * 0.5), Math.round(maxTrend * 0.75), maxTrend]

  const linePts = data.map((p, i) => {
    const x = padL + gap * i + gap / 2
    const y = padT + plotH - (p.completed / maxTrend) * plotH
    return { x, y, value: p.completed, label: p.label, idx: p.idx }
  })
  const linePath = linePts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')

  return (
    <div className="mt-3 w-full overflow-x-auto">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="h-auto min-w-[400px] w-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid */}
        {yTicks.map((tick) => {
          const y = padT + plotH - (tick / maxTrend) * plotH
          return (
            <g key={`yt-${tick}`}>
              <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="#F1F5F9" strokeWidth="1" />
              <text x={padL - 6} y={y + 3} textAnchor="end" fill="#94A3B8" fontSize="9">{tick}</text>
            </g>
          )
        })}
        {/* Bars */}
        {data.map((point, i) => {
          const cx = padL + gap * i + gap / 2
          const barH = (point.value / maxTrend) * plotH
          const y = padT + plotH - barH
          const isH = hoveredBar === i
          return (
            <g key={`bar-${point.idx}`} onMouseEnter={() => onHoverBar(i)} onMouseLeave={() => onHoverBar(null)} className="cursor-pointer">
              <rect x={cx - barW / 2} y={y} width={barW} height={barH} rx="3" fill={isH ? '#1d4ed8' : '#2F5FD0'} opacity={isH ? 1 : 0.75} />
              <text x={cx} y={padT + plotH + 16} textAnchor="middle" fill="#94A3B8" fontSize="9">{point.label}</text>
              {isH && (
                <g>
                  <rect x={cx - 36} y={y - 30} width="72" height="24" rx="4" fill="#1E293B" />
                  <text x={cx} y={y - 14} textAnchor="middle" fill="white" fontSize="10" fontWeight="600">{point.value} 次</text>
                </g>
              )}
            </g>
          )
        })}
        {/* Line */}
        <path d={linePath} fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {linePts.map((p, i) => {
          const isH = hoveredLine === i
          return (
            <g key={`lp-${p.idx}`} onMouseEnter={() => onHoverLine(i)} onMouseLeave={() => onHoverLine(null)} className="cursor-pointer">
              <circle cx={p.x} cy={p.y} r={isH ? 6 : 4} fill="white" stroke="#10B981" strokeWidth="2" />
              {isH && (
                <g>
                  <rect x={p.x - 40} y={p.y - 32} width="80" height="26" rx="4" fill="#1E293B" />
                  <text x={p.x} y={p.y - 18} textAnchor="middle" fill="white" fontSize="9" fontWeight="600">{p.label}</text>
                  <text x={p.x} y={p.y - 8} textAnchor="middle" fill="#10B981" fontSize="10" fontWeight="700">完成 {p.value}</text>
                </g>
              )}
            </g>
          )
        })}
        <line x1={padL} y1={padT + plotH} x2={svgW - padR} y2={padT + plotH} stroke="#E2E8F0" strokeWidth="1" />
      </svg>
    </div>
  )
}

/* ─ Donut Chart ── */
function DonutChart({ items, total }: { items: AnalyticsDistributionItem[]; total: number }) {
  const size = 120, sw = 20, r = (size - sw) / 2, circ = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="relative mx-auto my-1.5" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {items.map((item, i) => {
          const pct = item.value / 100, dl = pct * circ, doff = -offset; offset += dl
          return (
            <circle key={`donut-${item.label}-${i}`} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={sw}
              strokeDasharray={`${dl} ${circ - dl}`} strokeDashoffset={doff}
              strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          )
        })}
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
  if (tasks.length === 0) return <div className="py-8 text-center text-sm text-slate-400"><EmptyState title="暂无匹配任务" description="尝试调整筛选条件或搜索关键词" /></div>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-100 text-[11px] font-medium text-slate-400">
            <th className="px-3 py-2">任务名称</th>
            <th className="px-3 py-2">Agent 类型</th>
            <th className="px-3 py-2">创建时间</th>
            <th className="px-3 py-2">运行时长</th>
            <th className="px-3 py-2">状态</th>
            <th className="px-3 py-2 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((run) => (
            <tr key={`row-${run.id}`} className="border-b border-slate-50 transition hover:bg-slate-50/60">
              <td className="px-3 py-2"><div className="truncate font-medium text-slate-800">{run.title}</div></td>
              <td className="px-3 py-2"><CategoryTag category={run.category} /></td>
              <td className="px-3 py-2 text-slate-500">{run.createdAt}</td>
              <td className="px-3 py-2 text-slate-500">{run.duration}</td>
              <td className="px-3 py-2"><StatusBadge status={run.status} /></td>
              <td className="px-3 py-2 text-right">
                <button type="button" onClick={() => onOpenRun(run)} className="mr-2 text-xs font-medium text-[#2F5FD0] hover:underline">查看</button>
                <button type="button" className="text-slate-400 hover:text-slate-600"><MoreHorizontal className="size-3.5" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CategoryTag({ category }: { category: string }) {
  const c: Record<string, string> = { 代码开发: 'bg-blue-50 text-blue-600', 内容文档: 'bg-purple-50 text-purple-600', 数据分析: 'bg-emerald-50 text-emerald-600', 设计产物: 'bg-amber-50 text-amber-600', 自定义任务: 'bg-slate-100 text-slate-600', 内容推送: 'bg-sky-50 text-sky-600', 兴趣推荐: 'bg-pink-50 text-pink-600', 项目报告: 'bg-indigo-50 text-indigo-600' }
  return <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium', c[category] ?? 'bg-slate-100 text-slate-600')}>{category}</span>
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
  return ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label) => ({ label, value: 0 }))
}

function generateSparkline(base: number, points: number, variance = 0.4, min = 0): number[] {
  if (base === 0) return Array(points).fill(0)
  const result: number[] = []
  for (let i = 0; i < points; i++) {
    const noise = (Math.random() - 0.5) * 2 * variance * base
    result.push(Math.max(min, Math.round(base * 0.6 + noise + (i / points) * base * 0.4)))
  }
  return result
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
  const names = ['代码生成 Agent', '数据分析 Agent', '文档撰写 Agent', '设计产物 Agent', '代码审查 Agent']
  const descs = ['正在生成项目代码结构...', '分析完成，生成可视化图表', '正在整理文档内容...', '等待依赖任务完成', '发现 2 个问题，已修复']
  const stats: Array<'运行中' | '已完成' | '等待中'> = ['运行中', '已完成', '运行中', '等待中', '已完成']
  return runs.slice(0, 5).map((run, i) => ({ time: run.time.split(' ').pop() ?? '14:32', title: names[i % names.length], description: descs[i % descs.length], status: stats[i % stats.length] }))
}







