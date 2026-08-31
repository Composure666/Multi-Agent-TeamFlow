'use client'

import { CalendarClock, History, Languages, Newspaper, Plus, RefreshCw, Sparkles, TrendingUp, Video, X } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'

import { AutomationRunRow, mapAutomationRun } from '@/components/analytics-workspace'
import {
  automationFormFromTask,
  automationStatusClassName,
  automationStatusDescription,
  automationStatusLabel,
  buildAutomationPromptEnhanceInput,
  buildAutomationSaveBody,
  type AutomationFormState,
} from '@/components/automation-workspace-model'
import { PromptEnhanceModal } from '@/components/prompt-enhance-modal'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { LibraryStat, Meta } from '@/components/workbench-detail-primitives'
import {
  createAutomation,
  deleteAutomation,
  disableAutomation,
  enableAutomation,
  fetchAutomationDashboard,
  fetchAutomationRuns,
  fetchConversations,
  optimizePrompt,
  runAutomationNow,
  updateAutomation,
  type AutomationDashboard,
  type AutomationIconKey,
  type AutomationListItem,
  type AutomationRunDetailItem,
  type AutomationScheduleType,
  type AutomationStatus,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import type { AppNotification } from '@/shared/types'
import { useAgentList, useAppStore, useConversationList } from '@/stores/app-store'
type AutomationTaskPreset = {
  id: string
  title: string
  description: string
  category: string
  cadence: string
  latestRun: string
  latestRunAt: number | null
  rawStatus: AutomationStatus
  status: '运行中' | '已启用' | '待配置' | '已暂停'
  statusClassName: string
  lastError: string | null
  prompt: string
  agentId: string | null
  conversationId: string | null
  scheduleType: AutomationScheduleType
  scheduleConfig: unknown
  nextRunAt: number | null
  icon: ComponentType<{ className?: string }>
  iconWrapClassName: string
  iconClassName: string
}


const AUTOMATION_ICON_STYLES: Record<AutomationIconKey, Pick<AutomationTaskPreset, 'icon' | 'iconWrapClassName' | 'iconClassName'>> = {
  newspaper: { icon: Newspaper, iconWrapClassName: 'bg-slate-100', iconClassName: 'text-slate-600' },
  languages: { icon: Languages, iconWrapClassName: 'bg-emerald-50', iconClassName: 'text-emerald-600' },
  calendar_clock: { icon: CalendarClock, iconWrapClassName: 'bg-violet-50', iconClassName: 'text-violet-600' },
  video: { icon: Video, iconWrapClassName: 'bg-orange-50', iconClassName: 'text-orange-600' },
  history: { icon: History, iconWrapClassName: 'bg-cyan-50', iconClassName: 'text-cyan-600' },
}

function mapAutomationTask(item: AutomationListItem): AutomationTaskPreset {
  const iconStyle = AUTOMATION_ICON_STYLES[item.iconKey]
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    cadence: item.cadence,
    latestRun: item.latestRunAt ? formatRelativeRunTime(item.latestRunAt) : '尚未运行',
    latestRunAt: item.latestRunAt,
    rawStatus: item.status,
    status: automationStatusLabel(item.status),
    statusClassName: automationStatusClassName(item.status),
    lastError: item.lastError,
    prompt: item.prompt,
    agentId: item.agentId,
    conversationId: item.conversationId,
    scheduleType: item.scheduleType,
    scheduleConfig: item.scheduleConfig,
    nextRunAt: item.nextRunAt,
    ...iconStyle,
  }
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

function formatSyncTime(value: number | null): string {
  if (value === null) return '尚未同步'
  const date = new Date(value)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(value: number | null): string {
  if (value === null) return '—'
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}


function trendBarHeight(value: number, maxValue: number): number {
  if (value <= 0) return 4
  return Math.round(18 + (value / Math.max(maxValue, 1)) * 68)
}

type LoadDashboardOptions = {
  silent?: boolean
}


export function AutomationWorkspace() {
  const [dashboard, setDashboard] = useState<AutomationDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showAllRuns, setShowAllRuns] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null)
  const [form, setForm] = useState<AutomationFormState>(() => automationFormFromTask())
  const [submitting, setSubmitting] = useState(false)
  const [promptFilling, setPromptFilling] = useState(false)
  const [promptEnhanceOpen, setPromptEnhanceOpen] = useState(false)
  const [promptEnhanceOriginal, setPromptEnhanceOriginal] = useState('')
  const [promptEnhanceResult, setPromptEnhanceResult] = useState('')
  const [promptEnhanceError, setPromptEnhanceError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [runHistory, setRunHistory] = useState<AutomationRunDetailItem[]>([])
  const [runHistoryLoading, setRunHistoryLoading] = useState(false)
  const [runsError, setRunsError] = useState<string | null>(null)
  const requestSeqRef = useRef(0)
  const hasDashboardRef = useRef(false)

  const loadDashboard = useCallback(async (options: LoadDashboardOptions = {}) => {
    const requestSeq = requestSeqRef.current + 1
    requestSeqRef.current = requestSeq
    const hasDashboard = hasDashboardRef.current
    if (!options.silent) {
      if (hasDashboard) setRefreshing(true)
      else setLoading(true)
      setError(null)
    }
    try {
      const nextDashboard = await fetchAutomationDashboard()
      if (requestSeq !== requestSeqRef.current) return
      setDashboard(nextDashboard)
      hasDashboardRef.current = true
      setLastUpdatedAt(Date.now())
      setError(null)
    } catch (err) {
      if (requestSeq !== requestSeqRef.current) return
      const message = err instanceof Error ? err.message : '自动化数据加载失败'
      setError(hasDashboard ? `同步失败，当前显示上次同步数据：${message}` : message)
    } finally {
      if (requestSeq === requestSeqRef.current && !options.silent) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const hasRunningState = useMemo(
    () => Boolean(dashboard?.automations.some((item) => item.status === 'running') || dashboard?.recentRuns.some((run) => run.status === 'running')),
    [dashboard],
  )

  useEffect(() => {
    if (!hasRunningState) return
    const timer = window.setInterval(() => {
      void loadDashboard({ silent: true })
    }, 5000)
    return () => window.clearInterval(timer)
  }, [hasRunningState, loadDashboard])

  useEffect(() => {
    if (!selectedTaskId) {
      setRunHistory([])
      setRunsError(null)
      return
    }
    let cancelled = false
    setRunHistoryLoading(true)
    setRunsError(null)
    fetchAutomationRuns(selectedTaskId)
      .then((runs) => {
        if (!cancelled) setRunHistory(runs)
      })
      .catch((err) => {
        if (!cancelled) setRunsError(err instanceof Error ? err.message : '运行记录加载失败')
      })
      .finally(() => {
        if (!cancelled) setRunHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedTaskId, dashboard])

  const tasks = useMemo(
    () => (dashboard?.automations ?? []).map(mapAutomationTask),
    [dashboard?.automations],
  )
  const recentRuns = useMemo(
    () => (dashboard?.recentRuns ?? []).map(mapAutomationRun),
    [dashboard?.recentRuns],
  )
  const visibleRuns = showAllRuns ? recentRuns : recentRuns.slice(0, 4)
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null
  const trend = dashboard?.trend ?? []
  const maxTrend = Math.max(...trend.map((point) => point.value), 1)
  const syncBadge = refreshing ? '同步中' : hasRunningState ? '自动刷新' : '已同步'
  const initialLoading = loading && !dashboard
  const agents = useAgentList()
  const conversations = useConversationList()
  const addNotification = useAppStore((s) => s.addNotification)
  const setConversations = useAppStore((s) => s.setConversations)

  const refreshConversations = useCallback(async () => {
    setConversations(await fetchConversations())
  }, [setConversations])

  const notifyAutomation = useCallback((notification: Omit<AppNotification, 'id' | 'createdAt' | 'source'>) => {
    addNotification({
      ...notification,
      id: `ntf_${nanoid()}`,
      source: 'ui',
      createdAt: Date.now(),
    })
  }, [addNotification])

  const openCreateDialog = () => {
    setForm(automationFormFromTask())
    setDialogMode('create')
    setError(null)
  }

  const openEditDialog = () => {
    if (!selectedTask) return
    setForm(automationFormFromTask(selectedTask))
    setDialogMode('edit')
    setError(null)
  }

  const handleSaveAutomation = async () => {
    if (!form.title.trim() || !form.prompt.trim()) {
      setError('标题和任务提示词不能为空')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const body = buildAutomationSaveBody(form)
      const saved = dialogMode === 'edit' && selectedTask ? await updateAutomation(selectedTask.id, body) : await createAutomation(body)
      setDialogMode(null)
      setSelectedTaskId(saved.id)
      notifyAutomation({
        title: dialogMode === 'edit' ? '自动化任务已更新' : '自动化任务已创建',
        body: `任务「${saved.title}」已保存。`,
        level: 'success',
        automationId: saved.id,
      })
      await loadDashboard()
      await refreshConversations()
    } catch (err) {
      const message = err instanceof Error ? err.message : '自动化任务保存失败'
      setError(message)
      notifyAutomation({ title: '自动化任务保存失败', body: message, level: 'error', urgent: true })
    } finally {
      setSubmitting(false)
    }
  }

  const handleEnhanceAutomationPrompt = async () => {
    if (!form.title.trim() && !form.description.trim() && !form.prompt.trim()) {
      setError('请先填写标题、描述或任务提示词，再使用 AI 优化提示词')
      return
    }

    const originalPrompt = form.prompt.trim()
    const originalText = originalPrompt || '未输入原始提示词，AI 将根据任务标题、描述、分类和触发计划生成。'
    setPromptFilling(true)
    setPromptEnhanceOriginal(originalText)
    setPromptEnhanceResult('')
    setPromptEnhanceError(null)
    setPromptEnhanceOpen(true)
    setError(null)
    try {
      const result = await optimizePrompt(buildAutomationPromptEnhanceInput(form))
      setPromptEnhanceResult(result.enhancedText.trim())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI 优化提示词失败'
      setPromptEnhanceError(message)
      setError(message)
      notifyAutomation({ title: 'AI 优化提示词失败', body: message, level: 'error' })
    } finally {
      setPromptFilling(false)
    }
  }

  const handleAutomationAction = async (action: 'enable' | 'disable' | 'run' | 'delete') => {
    if (!selectedTask) return
    setActionLoading(action)
    setError(null)
    try {
      if (action === 'enable') await enableAutomation(selectedTask.id)
      if (action === 'disable') await disableAutomation(selectedTask.id)
      if (action === 'run') await runAutomationNow(selectedTask.id)
      if (action === 'delete') {
        if (!window.confirm(`确认删除自动化任务「${selectedTask.title}」？`)) return
        await deleteAutomation(selectedTask.id)
        setSelectedTaskId(null)
      }
      notifyAutomation({
        title: action === 'run' ? '已提交自动化运行' : action === 'delete' ? '自动化任务已删除' : '自动化任务状态已更新',
        body: action === 'run' ? `任务「${selectedTask.title}」已开始执行。` : `任务「${selectedTask.title}」操作已完成。`,
        level: 'success',
        automationId: selectedTask.id,
      })
      await loadDashboard()
      if (action === 'enable' || action === 'run') await refreshConversations()
    } catch (err) {
      const message = err instanceof Error ? err.message : '自动化操作失败'
      setError(message)
      notifyAutomation({ title: '自动化操作失败', body: message, level: 'error', automationId: selectedTask.id, urgent: true })
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="h-full p-4 xl:p-6">
      <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
        <div className="shrink-0 border-b border-slate-100 p-4 xl:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-950">自动化</h1>
              <p className="mt-1 text-sm text-slate-500">管理自动化任务并查看近期运行记录</p>
              <p className="mt-1 text-xs text-slate-400">最近同步：{formatSyncTime(lastUpdatedAt)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" disabled={refreshing} onClick={() => void loadDashboard()} className="h-9 rounded-xl border-slate-200 px-3 text-xs text-slate-700 transition hover:border-[var(--agenthub-accent-border)] hover:bg-slate-100 hover:text-slate-900">
                <RefreshCw className={cn('mr-1.5 size-3.5', refreshing && 'animate-spin')} />
                {refreshing ? '同步中' : '刷新'}
              </Button>
              <Button variant="outline" onClick={openCreateDialog} className="h-9 rounded-xl border-slate-200 px-3 text-xs text-slate-700 transition hover:border-[var(--agenthub-accent-border)] hover:bg-slate-100 hover:text-slate-900">
                <Plus className="mr-1.5 size-3.5" />
                添加
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1" scrollbarClassName="hidden">
          <div className="space-y-5 p-4 xl:p-5">
            {error && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-600">
                <span>自动化数据加载失败：{error}</span>
                <Button variant="outline" onClick={() => void loadDashboard()} className="h-8 rounded-xl border-rose-200 px-3 text-xs text-rose-600 hover:bg-rose-100">
                  重试
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <LibraryStat label="启用任务" value={initialLoading ? '—' : String(dashboard?.stats.enabledCount ?? 0)} />
              <LibraryStat label="今日运行" value={initialLoading ? '—' : String(dashboard?.stats.todayRunCount ?? 0)} />
              <LibraryStat label="成功率" value={initialLoading ? '—' : `${dashboard?.stats.successRate ?? 0}%`} />
              <LibraryStat label="待处理" value={initialLoading ? '—' : String(dashboard?.stats.pendingCount ?? 0)} />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {tasks.map((task) => (
                <AutomationTaskCard
                  key={task.id}
                  task={task}
                  selected={selectedTask?.id === task.id}
                  onSelect={(id) => setSelectedTaskId((current) => (current === id ? null : id))}
                />
              ))}
              {initialLoading && Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="min-h-[168px] rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm" />
              ))}
            </div>
            {!initialLoading && tasks.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">暂无自动化任务，点击“添加”创建第一个任务。</div>
            )}

            {selectedTask && (
              <div className="rounded-2xl border border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)]/50 p-4 text-sm text-slate-700">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-slate-950">{selectedTask.title}</h2>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', selectedTask.statusClassName)}>{selectedTask.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{automationStatusDescription(selectedTask.rawStatus)}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedTaskId(null)} className="rounded-lg p-1 text-slate-400 transition hover:bg-white/70 hover:text-slate-700" aria-label="关闭自动化详情">
                    <X className="size-4" />
                  </button>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-4">
                  <Meta label="分类" value={selectedTask.category} />
                  <Meta label="触发时间" value={selectedTask.cadence} />
                  <Meta label="下次运行" value={formatDateTime(selectedTask.nextRunAt)} />
                  <Meta label="最近运行" value={selectedTask.latestRun} />
                </div>
                <div className="mt-4 rounded-xl border border-white/70 bg-white/70 p-3 text-xs text-slate-600">
                  <div className="font-medium text-slate-700">任务提示词</div>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap">{selectedTask.prompt || '暂无提示词'}</p>
                  {selectedTask.lastError && <p className="mt-2 text-rose-600">最近错误：{selectedTask.lastError}</p>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={openEditDialog} className="h-8 rounded-xl bg-white px-3 text-xs">编辑</Button>
                  {selectedTask.rawStatus === 'enabled' || selectedTask.rawStatus === 'running' ? (
                    <Button variant="outline" disabled={actionLoading === 'disable'} onClick={() => void handleAutomationAction('disable')} className="h-8 rounded-xl bg-white px-3 text-xs">
                      {actionLoading === 'disable' ? '暂停中…' : '暂停'}
                    </Button>
                  ) : (
                    <Button variant="outline" disabled={actionLoading === 'enable'} onClick={() => void handleAutomationAction('enable')} className="h-8 rounded-xl bg-white px-3 text-xs">
                      {actionLoading === 'enable' ? '启用中…' : '启用'}
                    </Button>
                  )}
                  <Button disabled={actionLoading === 'run'} onClick={() => void handleAutomationAction('run')} className="h-8 rounded-xl px-3 text-xs">
                    {actionLoading === 'run' ? '提交中…' : '立即运行'}
                  </Button>
                  <Button variant="outline" disabled={actionLoading === 'delete'} onClick={() => void handleAutomationAction('delete')} className="h-8 rounded-xl border-red-200 bg-white px-3 text-xs text-red-600 hover:bg-red-50">
                    {actionLoading === 'delete' ? '删除中…' : '删除'}
                  </Button>
                </div>
                <div className="mt-4 rounded-xl border border-white/70 bg-white/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-medium text-slate-700">运行历史</div>
                    {runHistoryLoading && <span className="text-[10px] text-slate-400">加载中</span>}
                  </div>
                  {runsError && <p className="mt-2 text-xs text-rose-600">{runsError}</p>}
                  <div className="mt-2 space-y-2">
                    {runHistory.slice(0, 4).map((run) => (
                      <div key={run.id} className="rounded-lg border border-slate-100 bg-white p-2 text-xs text-slate-600">
                        <div className="flex items-center justify-between gap-2">
                          <span>{run.trigger === 'manual' ? '手动触发' : '计划触发'} · {run.status === 'success' ? '成功' : run.status === 'running' ? '运行中' : '失败'}</span>
                          <span className="text-slate-400">{formatRelativeRunTime(run.startedAt)}</span>
                        </div>
                        {run.error && <p className="mt-1 text-rose-600">{run.error}</p>}
                        {run.logs[0] && <p className="mt-1 text-slate-400">{run.logs[0].message}</p>}
                      </div>
                    ))}
                    {!runHistoryLoading && runHistory.length === 0 && <p className="text-xs text-slate-400">暂无运行历史</p>}
                  </div>
                </div>
              </div>
            )}

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950">近期运行记录</h2>
                    <p className="mt-1 text-xs text-slate-500">按最近触发时间展示自动化任务状态</p>
                  </div>
                  <span className="rounded-full bg-[var(--agenthub-accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--agenthub-accent)]">{syncBadge}</span>
                </div>
                <div className="mt-4 space-y-2">
                  {visibleRuns.map((run) => (
                    <AutomationRunRow key={run.id} run={run} />
                  ))}
                  {!initialLoading && recentRuns.length > 4 && (
                    <Button variant="ghost" onClick={() => setShowAllRuns((open) => !open)} className="h-8 w-full rounded-xl text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-800">
                      {showAllRuns ? '收起运行记录' : `查看全部 ${recentRuns.length} 条`}
                    </Button>
                  )}
                  {!initialLoading && recentRuns.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">暂无运行记录</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-xl bg-white text-[var(--agenthub-accent)] shadow-sm">
                    <TrendingUp className="size-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950">运行概览</h2>
                    <p className="text-xs text-slate-500">最近 7 天运行次数</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-7 items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                  {trend.map((point) => (
                    <div key={point.label} className="flex min-h-[96px] flex-col items-center justify-end gap-2" title={`${point.label}：${point.value} 次`}>
                      <div className="flex h-[86px] w-full items-end justify-center rounded-full bg-blue-100/70">
                        <div className={cn('mx-auto w-3 rounded-full', point.value > 0 ? 'bg-[var(--agenthub-accent)]' : 'bg-slate-200')} style={{ height: `${trendBarHeight(point.value, maxTrend)}px` }} />
                      </div>
                      <span className="text-[10px] text-slate-400">{point.label.slice(1)}</span>
                    </div>
                  ))}
                  {initialLoading && Array.from({ length: 7 }, (_, index) => (
                    <div key={index} className="flex min-h-[96px] flex-col items-center justify-end gap-2">
                      <div className="flex h-[86px] w-full items-end justify-center rounded-full bg-blue-100/70">
                        <div className="mx-auto h-1 w-3 rounded-full bg-slate-200" />
                      </div>
                      <span className="text-[10px] text-slate-400">—</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </ScrollArea>
      </section>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent className="flex max-h-[calc(100vh-2rem)] max-w-2xl flex-col overflow-hidden rounded-2xl border-slate-200 bg-white p-0">
          <DialogHeader className="shrink-0 px-6 pt-6">
            <DialogTitle>{dialogMode === 'edit' ? '编辑自动化任务' : '创建自动化任务'}</DialogTitle>
            <DialogDescription>配置任务提示词、执行目标和基础触发计划。</DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0 flex-1 px-6">
            <div className="grid gap-3 py-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-500">标题
                <Input value={form.title} onChange={(event) => setForm((draft) => ({ ...draft, title: event.target.value }))} className="mt-1" />
              </label>
              <label className="text-xs text-slate-500">分类
                <Input value={form.category} onChange={(event) => setForm((draft) => ({ ...draft, category: event.target.value }))} className="mt-1" />
              </label>
            </div>
            <label className="text-xs text-slate-500">描述
              <Input value={form.description} onChange={(event) => setForm((draft) => ({ ...draft, description: event.target.value }))} className="mt-1" />
            </label>
            <div>
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span>任务提示词</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title={promptFilling ? 'AI 优化中' : 'AI 优化提示词'}
                  aria-label="AI 优化提示词"
                  onClick={() => void handleEnhanceAutomationPrompt()}
                  disabled={promptFilling || submitting}
                  className="group relative size-7 rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-[var(--agenthub-accent)] disabled:cursor-wait disabled:opacity-60"
                >
                  <Sparkles className={cn('size-3.5', promptFilling && 'animate-pulse')} />
                  <span className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-normal text-slate-600 shadow-sm group-hover:block">
                    {promptFilling ? 'AI 优化中' : 'AI 优化提示词'}
                  </span>
                </Button>
              </div>
              <Textarea value={form.prompt} onChange={(event) => setForm((draft) => ({ ...draft, prompt: event.target.value }))} className="mt-1 min-h-32 max-h-64 resize-y whitespace-pre-wrap break-words" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-500">目标 Agent
                <select value={form.agentId} onChange={(event) => setForm((draft) => ({ ...draft, agentId: event.target.value }))} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                  <option value="">自动选择</option>
                  {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-500">目标会话
                <select value={form.conversationId} onChange={(event) => setForm((draft) => ({ ...draft, conversationId: event.target.value }))} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                  <option value="">未绑定</option>
                  {conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}
                </select>
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-xs text-slate-500">触发类型
                <select value={form.scheduleType} onChange={(event) => setForm((draft) => ({ ...draft, scheduleType: event.target.value as AutomationScheduleType }))} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                  <option value="manual">手动</option>
                  <option value="interval">间隔</option>
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                </select>
              </label>
              {form.scheduleType === 'interval' && (
                <label className="text-xs text-slate-500">间隔分钟
                  <Input type="number" min={1} value={form.intervalMinutes} onChange={(event) => setForm((draft) => ({ ...draft, intervalMinutes: event.target.value }))} className="mt-1" />
                </label>
              )}
              {(form.scheduleType === 'daily' || form.scheduleType === 'weekly') && (
                <label className="text-xs text-slate-500">时间
                  <Input type="time" value={form.timeOfDay} onChange={(event) => setForm((draft) => ({ ...draft, timeOfDay: event.target.value }))} className="mt-1" />
                </label>
              )}
              {form.scheduleType === 'weekly' && (
                <label className="text-xs text-slate-500">星期
                  <select value={form.dayOfWeek} onChange={(event) => setForm((draft) => ({ ...draft, dayOfWeek: event.target.value }))} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                    <option value="1">周一</option><option value="2">周二</option><option value="3">周三</option><option value="4">周四</option><option value="5">周五</option><option value="6">周六</option><option value="0">周日</option>
                  </select>
                </label>
              )}
              <label className="text-xs text-slate-500">状态
                <select value={form.status} onChange={(event) => setForm((draft) => ({ ...draft, status: event.target.value as Exclude<AutomationStatus, 'running'> }))} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                  <option value="draft">草稿</option>
                  <option value="enabled">启用</option>
                  <option value="paused">暂停</option>
                </select>
              </label>
            </div>
            </div>
          </ScrollArea>
          <DialogFooter className="shrink-0 border-t border-slate-100 px-6 py-4">
            <Button variant="outline" onClick={() => setDialogMode(null)} disabled={submitting || promptFilling}>取消</Button>
            <Button onClick={() => void handleSaveAutomation()} disabled={submitting || promptFilling}>{submitting ? '保存中…' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PromptEnhanceModal
        visible={promptEnhanceOpen}
        title={form.prompt.trim() ? 'AI 优化提示词' : 'AI 生成提示词'}
        description={form.prompt.trim() ? '对比原始提示词和优化后的提示词，选择继续使用原版或替换为优化版。' : '当前未输入提示词，AI 会根据任务信息生成一份可执行提示词。'}
        originalLabel="原始提示词"
        enhancedLabel={form.prompt.trim() ? '优化后的提示词' : '生成后的提示词'}
        loadingText={form.prompt.trim() ? '正在优化提示词…' : '正在生成提示词…'}
        keepOriginalText="使用原版"
        useEnhancedText={form.prompt.trim() ? '使用优化版' : '使用生成版'}
        originalText={promptEnhanceOriginal}
        enhancedText={promptEnhanceResult}
        loading={promptFilling}
        error={promptEnhanceError}
        onOpenChange={(open) => {
          if (!promptFilling) setPromptEnhanceOpen(open)
        }}
        onKeepOriginal={() => setPromptEnhanceOpen(false)}
        onUseEnhanced={() => {
          setForm((draft) => ({ ...draft, prompt: promptEnhanceResult }))
          setPromptEnhanceOpen(false)
          notifyAutomation({ title: '提示词已更新', body: '已使用 AI 处理后的提示词。', level: 'success' })
        }}
      />
    </div>
  )
}

function AutomationTaskCard({
  task,
  selected,
  onSelect,
}: {
  task: AutomationTaskPreset
  selected: boolean
  onSelect: (id: string) => void
}) {
  const Icon = task.icon

  return (
    <button
      type="button"
      onClick={() => onSelect(task.id)}
      className={cn(
        'group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[var(--agenthub-accent-border)] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--agenthub-accent-border)]',
        selected && 'border-[var(--agenthub-accent-border)] shadow-md',
      )}
      aria-pressed={selected}
    >
      <div className="flex items-start gap-3">
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-2xl transition duration-200 group-hover:scale-105', task.iconWrapClassName)}>
          <Icon className={cn('size-5', task.iconClassName)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-base font-semibold text-slate-950">{task.title}</h3>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', task.statusClassName)}>
              {task.status}
            </span>
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">{task.description}</p>
          <p className="mt-1 text-xs text-slate-400">{task.category}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
        <Meta label="触发时间" value={task.cadence} />
        <Meta label="最近运行" value={task.latestRun} />
      </div>
    </button>
  )
}
