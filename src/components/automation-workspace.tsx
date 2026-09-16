'use client'

import { nanoid } from 'nanoid'
import {
  Activity,
  ArrowUpDown,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock4,
  Copy,
  ExternalLink,
  History,
  Info,
  Keyboard,
  Languages,
  LayoutGrid,
  List,
  Lock,
  MoreHorizontal,
  Newspaper,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  User,
  Video,
  XIcon,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'

import { mapAutomationRun } from '@/components/analytics-workspace'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Meta } from '@/components/workbench-detail-primitives'
import {
  AUTOMATION_TREND_RANGES,
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
  type AutomationTrendRange,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import type { AppNotification } from '@/shared/types'
import { useAgentList, useAppStore, useConversationList } from '@/stores/app-store'

// ────────────────────────────────────────────────────────────────────────────
// Constants & types
// ────────────────────────────────────────────────────────────────────────────

type StatPill = {
  id: 'enabled' | 'today' | 'success' | 'failed'
  label: string
  icon: LucideIcon
  tone: 'sky' | 'violet' | 'emerald' | 'rose'
}

const STAT_TILES: StatPill[] = [
  { id: 'enabled', label: '启用任务', icon: Play, tone: 'sky' },
  { id: 'today', label: '今日运行', icon: Activity, tone: 'violet' },
  { id: 'success', label: '成功率', icon: CheckCircle2, tone: 'emerald' },
  { id: 'failed', label: '异常任务', icon: CircleAlert, tone: 'rose' },
]

const TONE_CLASS: Record<StatPill['tone'], { wrap: string; chip: string; text: string; bar: string }> = {
  sky: {
    wrap: 'bg-sky-50 dark:bg-sky-500/10',
    chip: 'bg-white/80 text-sky-700 dark:bg-white/10 dark:text-sky-300',
    text: 'text-sky-600 dark:text-sky-300',
    bar: 'bg-sky-500/30 dark:bg-sky-500/40',
  },
  violet: {
    wrap: 'bg-violet-50 dark:bg-violet-500/10',
    chip: 'bg-white/80 text-violet-700 dark:bg-white/10 dark:text-violet-300',
    text: 'text-violet-600 dark:text-violet-300',
    bar: 'bg-violet-500/30 dark:bg-violet-500/40',
  },
  emerald: {
    wrap: 'bg-emerald-50 dark:bg-emerald-500/10',
    chip: 'bg-white/80 text-emerald-700 dark:bg-white/10 dark:text-emerald-300',
    text: 'text-emerald-600 dark:text-emerald-300',
    bar: 'bg-emerald-500/30 dark:bg-emerald-500/40',
  },
  rose: {
    wrap: 'bg-rose-50 dark:bg-rose-500/10',
    chip: 'bg-white/80 text-rose-700 dark:bg-white/10 dark:text-rose-300',
    text: 'text-rose-600 dark:text-rose-300',
    bar: 'bg-rose-500/30 dark:bg-rose-500/40',
  },
}

type TabKey = 'all' | 'enabled' | 'paused' | 'failed' | 'recent' | 'favorite'

const TABS: { id: TabKey; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'enabled', label: '启用' },
  { id: 'paused', label: '暂停' },
  { id: 'failed', label: '失败' },
  { id: 'recent', label: '最近运行' },
  { id: 'favorite', label: '收藏' },
]

type SortKey = 'next' | 'recent' | 'name' | 'status'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'next', label: '即将执行优先' },
  { value: 'recent', label: '最近运行优先' },
  { value: 'name', label: '按任务名称' },
  { value: 'status', label: '按任务状态' },
]

// ────────────────────────────────────────────────────────────────────────────
// Per-task visual config
// ────────────────────────────────────────────────────────────────────────────

const AUTOMATION_ICON_STYLES: Record<
  AutomationIconKey,
  { Icon: LucideIcon; wrap: string; icon: string }
> = {
  newspaper: { Icon: Newspaper, wrap: 'bg-sky-100 dark:bg-sky-500/15', icon: 'text-sky-600 dark:text-sky-300' },
  languages: { Icon: Languages, wrap: 'bg-emerald-100 dark:bg-emerald-500/15', icon: 'text-emerald-600 dark:text-emerald-300' },
  calendar_clock: { Icon: CalendarClock, wrap: 'bg-violet-100 dark:bg-violet-500/15', icon: 'text-violet-600 dark:text-violet-300' },
  video: { Icon: Video, wrap: 'bg-orange-100 dark:bg-orange-500/15', icon: 'text-orange-600 dark:text-orange-300' },
  history: { Icon: History, wrap: 'bg-cyan-100 dark:bg-cyan-500/15', icon: 'text-cyan-600 dark:text-cyan-300' },
}

// Derive a recognizable icon/color from category/title keywords so tasks that
// share the same default iconKey still look visually distinct on the grid.

const CATEGORY_ICON_HINTS: { keywords: string[]; style: { Icon: LucideIcon; wrap: string; icon: string } }[] = [
  { keywords: ['资讯', '新闻', '简报', '热点'], style: AUTOMATION_ICON_STYLES.newspaper },
  { keywords: ['学习', '英语', '单词', '语言', '翻译'], style: AUTOMATION_ICON_STYLES.languages },
  { keywords: ['日报', '周报', '总结', '复盘', '记录'], style: AUTOMATION_ICON_STYLES.history },
  { keywords: ['视频', '直播', '影视'], style: AUTOMATION_ICON_STYLES.video },
  { keywords: ['提醒', '日程', '日历', '打卡'], style: AUTOMATION_ICON_STYLES.calendar_clock },
]

function resolveTaskIconStyle(item: AutomationListItem): { Icon: LucideIcon; wrap: string; icon: string } {
  const text = `${item.category} ${item.title}`
  for (const hint of CATEGORY_ICON_HINTS) {
    if (hint.keywords.some((keyword) => text.includes(keyword))) return hint.style
  }
  return AUTOMATION_ICON_STYLES[item.iconKey] ?? AUTOMATION_ICON_STYLES.newspaper
}

// Category tag tones — deterministic by category text so the same category
// always renders the same color chip across cards.

const CATEGORY_CHIP_TONES = [
  'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
  'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
  'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
  'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300',
  'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300',
  'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
  'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
  'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/10 dark:text-fuchsia-300',
]

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function categoryChipClass(category: string): string {
  if (!category.trim()) return 'bg-slate-50 text-slate-500 dark:bg-white/5 dark:text-slate-400'
  return CATEGORY_CHIP_TONES[hashString(category) % CATEGORY_CHIP_TONES.length]
}

// Trigger icon by schedule type

const TRIGGER_ICON: Record<AutomationScheduleType, { Icon: LucideIcon; label: string; tone: string }> = {
  manual: { Icon: User, label: '手动', tone: 'text-slate-500 dark:text-slate-400' },
  interval: { Icon: Clock4, label: '定时', tone: 'text-violet-500 dark:text-violet-300' },
  daily: { Icon: Clock4, label: '每天', tone: 'text-sky-500 dark:text-sky-300' },
  weekly: { Icon: CalendarClock, label: '每周', tone: 'text-emerald-500 dark:text-emerald-300' },
}

// ────────────────────────────────────────────────────────────────────────────
// View model
// ────────────────────────────────────────────────────────────────────────────

type AutomationTaskView = {
  id: string
  title: string
  description: string
  summary: string
  category: string
  cadence: string
  triggerLabel: string
  scheduleType: AutomationScheduleType
  latestRun: string
  latestRunAt: number | null
  nextRunAt: number | null
  nextRunLabel: string | null
  rawStatus: AutomationStatus
  status: '运行中' | '已启用' | '待配置' | '已暂停'
  statusClassName: string
  statusTone: 'running' | 'enabled' | 'paused' | 'failed' | 'draft'
  lastError: string | null
  prompt: string
  agentId: string | null
  conversationId: string | null
  scheduleConfig: unknown
  icon: ComponentType<{ className?: string }>
  iconWrapClassName: string
  iconClassName: string
}

function mapAutomationTask(item: AutomationListItem, nowMs: number): AutomationTaskView {
  const iconStyle = resolveTaskIconStyle(item)
  const status = automationStatusLabel(item.status)
  const trimmedDescription = item.description.trim()
  const promptExcerpt = item.prompt.replace(/\s+/g, ' ').trim().slice(0, 48)
  const summary = trimmedDescription || (promptExcerpt ? `${promptExcerpt}…` : '') || item.category.trim() || '未填写描述'
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    summary,
    category: item.category,
    cadence: item.cadence,
    triggerLabel: item.cadence,
    scheduleType: item.scheduleType,
    latestRun: item.latestRunAt ? formatRelativeRunTime(item.latestRunAt, nowMs) : '尚未运行',
    latestRunAt: item.latestRunAt,
    nextRunAt: item.nextRunAt,
    nextRunLabel: item.nextRunAt ? formatNextRunLabel(item.nextRunAt, nowMs) : null,
    rawStatus: item.status,
    status,
    statusClassName: automationStatusClassName(item.status),
    statusTone: deriveStatusTone(item),
    lastError: item.lastError,
    prompt: item.prompt,
    agentId: item.agentId,
    conversationId: item.conversationId,
    scheduleConfig: item.scheduleConfig,
    icon: iconStyle.Icon,
    iconWrapClassName: iconStyle.wrap,
    iconClassName: iconStyle.icon,
  }
}

function deriveStatusTone(item: AutomationListItem): AutomationTaskView['statusTone'] {
  if (item.status === 'running') return 'running'
  if (item.lastError) return 'failed'
  if (item.status === 'paused') return 'paused'
  if (item.status === 'draft') return 'draft'
  return 'enabled'
}

const STATUS_TONE_CHIP: Record<AutomationTaskView['statusTone'], { dot: string; text: string; ring: string; label: string }> = {
  running: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
    ring: 'bg-emerald-50 dark:bg-emerald-500/10',
    label: '运行中',
  },
  enabled: {
    dot: 'bg-sky-500',
    text: 'text-sky-700 dark:text-sky-300',
    ring: 'bg-sky-50 dark:bg-sky-500/10',
    label: '已启用',
  },
  paused: {
    dot: 'bg-slate-400',
    text: 'text-slate-600 dark:text-slate-300',
    ring: 'bg-slate-100 dark:bg-white/5',
    label: '已暂停',
  },
  failed: {
    dot: 'bg-rose-500',
    text: 'text-rose-700 dark:text-rose-300',
    ring: 'bg-rose-50 dark:bg-rose-500/10',
    label: '异常',
  },
  draft: {
    dot: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
    ring: 'bg-amber-50 dark:bg-amber-500/10',
    label: '待配置',
  },
}

// ────────────────────────────────────────────────────────────────────────────
// Formatting helpers (pure functions only)
// ────────────────────────────────────────────────────────────────────────────

function formatRelativeRunTime(value: number, nowMs: number): string {
  const today = new Date(nowMs)
  today.setHours(0, 0, 0, 0)
  const target = new Date(value)
  const targetDay = new Date(target)
  targetDay.setHours(0, 0, 0, 0)
  const diffDays = Math.round((today.getTime() - targetDay.getTime()) / 86_400_000)
  const clock = target.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 0) return `今天 ${clock}`
  if (diffDays === 1) return `昨天 ${clock}`
  if (diffDays > 1 && diffDays < 7) return `${diffDays} 天前`
  return target.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function formatNextRunLabel(value: number, nowMs: number): string {
  const diff = Math.max(0, value - nowMs)
  const minutes = Math.round(diff / 60_000)
  if (minutes < 60) return minutes <= 1 ? '即将执行' : `${minutes} 分钟后`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时后`
  const days = Math.round(hours / 24)
  if (days === 1) return '明天'
  if (days < 7) return `${days} 天后`
  return new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function formatAbsoluteClock(value: number, nowMs: number): string {
  const today = new Date(nowMs)
  today.setHours(0, 0, 0, 0)
  const target = new Date(value)
  const targetDay = new Date(target)
  targetDay.setHours(0, 0, 0, 0)
  const clock = target.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  const diffDays = Math.round((targetDay.getTime() - today.getTime()) / 86_400_000)
  if (diffDays === 0) return `今天 ${clock}`
  if (diffDays === 1) return `明天 ${clock}`
  if (diffDays === 2) return `后天 ${clock}`
  return target.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' + clock
}

function formatSyncTime(value: number | null, nowMs: number): string {
  if (value === null) return '尚未同步'
  const diff = Math.max(0, nowMs - value)
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return '刚刚同步'
  if (minutes < 60) return `${minutes} 分钟前同步`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时前同步`
  const date = new Date(value)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) + ' 同步'
}

function formatDateTime(value: number | null): string {
  if (value === null) return '—'
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatDurationMs(value: number | null): string {
  if (value === null || value < 0) return '—'
  const seconds = value / 1000
  if (seconds < 1) return `${Math.round(value)}ms`
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds % 60)}s`
}

function resolveTimeZoneLabel(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '本地时区'
  } catch {
    return '本地时区'
  }
}

function formatNextRunCountdown(value: number, nowMs: number): string {
  const diff = Math.max(0, value - nowMs)
  if (diff <= 0) return '即将执行'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return '不足 1 分钟'
  if (minutes < 60) return `距离下次还有 ${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `距离下次还有 ${hours} 小时 ${minutes % 60} 分钟`
  const days = Math.floor(hours / 24)
  return `距离下次还有 ${days} 天 ${hours % 24} 小时`
}

function triggerTypeLabel(scheduleType: AutomationScheduleType): string {
  return TRIGGER_OPTIONS.find((option) => option.value === scheduleType)?.label ?? '手动触发'
}

function runSummaryText(run: AutomationRunDetailItem): string | null {
  if (run.status === 'failed' && run.error) return run.error
  const firstLog = run.logs[0]
  if (firstLog?.message.trim()) return firstLog.message.trim()
  if (run.status === 'running') return '正在执行中…'
  if (run.status === 'success') return '本次运行已成功完成。'
  return run.error ? run.error : null
}

// ────────────────────────────────────────────────────────────────────────────
// Dashboard tile visuals — real sparkline / ring / ratio bar
// ────────────────────────────────────────────────────────────────────────────

function TrendSparkline({ values, stroke, fill }: { values: number[]; stroke: string; fill: string }) {
  const data = values.length >= 2 ? values : [0, 0, 0, 0, 0, 0, 0]
  const max = Math.max(...data)
  const w = 100
  const h = 30
  const pad = 2
  const allZero = max === 0
  const points = allZero
    ? data.map((_, index) => {
        const x = pad + (index / (data.length - 1)) * (w - pad * 2)
        return [x, h / 2] as const
      })
    : data.map((value, index) => {
        const x = pad + (index / (data.length - 1)) * (w - pad * 2)
        const y = h - pad - (value / max) * (h - pad * 2 - 4)
        return [x, y] as const
      })
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `M${pad},${h} L${line.replace(/ /g, ' L')} L${w - pad},${h} Z`
  const [lastX, lastY] = points[points.length - 1] ?? [w - pad, h / 2]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      {!allZero && <path d={area} className={fill} />}
      <polyline
        points={line}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        strokeDasharray={allZero ? '3 3' : undefined}
        className={cn(stroke, allZero && 'opacity-40')}
      />
      {!allZero && <circle cx={lastX} cy={lastY} r="2.5" className={cn(fill, 'dark:fill-slate-900')} />}
    </svg>
  )
}

function RateRing({ rate, invalid }: { rate: number; invalid?: boolean }) {
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(100, Math.max(0, rate))
  const dash = (clamped / 100) * circumference
  return (
    <svg viewBox="0 0 40 40" className="size-11 shrink-0" aria-hidden>
      <circle cx="20" cy="20" r={radius} fill="none" strokeWidth="4" className="stroke-slate-100 dark:stroke-white/10" />
      {invalid ? (
        <text x="20" y="24" textAnchor="middle" fontSize="12" fontWeight="600" className="fill-slate-300 dark:fill-slate-600">--</text>
      ) : (
        <>
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            transform="rotate(-90 20 20)"
            className="stroke-emerald-500 dark:stroke-emerald-400"
          />
          <text x="20" y="24" textAnchor="middle" fontSize="11" fontWeight="600" className="fill-emerald-600 dark:fill-emerald-300">
            {Math.round(clamped)}
          </text>
        </>
      )}
    </svg>
  )
}

function RatioBar({ ratio, className }: { ratio: number; className: string }) {
  const pct = Math.min(100, Math.max(0, ratio * 100))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10" aria-hidden>
      <div className={cn('h-full rounded-full transition-all', className)} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Dashboard tile (KPI with real trend visual + action)
// ────────────────────────────────────────────────────────────────────────────

function DashboardTile({
  stat,
  value,
  delta,
  deltaLabel,
  hint,
  onAction,
  actionLabel,
  children,
}: {
  stat: StatPill
  value: string
  delta: string | null
  deltaLabel: string
  hint: string
  onAction?: () => void
  actionLabel?: string
  children?: ReactNode
}) {
  const Icon = stat.icon
  const tone = TONE_CLASS[stat.tone]
  return (
    <div className={cn('group relative flex min-h-[128px] flex-col gap-3 rounded-2xl border border-slate-200/70 p-4 transition-all duration-200 hover:-translate-y-[2px] hover:shadow-[0_10px_30px_-15px_rgba(15,23,42,0.18)] dark:border-white/10', tone.wrap)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-xl', tone.chip)}>
            <Icon className={cn('size-4', tone.text)} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{stat.label}</div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-xl font-semibold tracking-tight tabular-nums text-slate-950 dark:text-slate-50">{value}</span>
              {delta && (
                <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-medium', delta.startsWith('-') ? 'text-rose-500' : 'text-emerald-600')}>
                  <TrendingUp className={cn('size-3', delta.startsWith('-') && 'rotate-180')} />
                  {delta}
                </span>
              )}
            </div>
          </div>
        </div>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white/90 px-2 py-1 text-[10px] font-medium text-slate-700 shadow-sm transition hover:bg-white hover:text-[var(--agenthub-accent)] dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
          >
            {actionLabel}
            <ChevronRight className="size-3" />
          </button>
        )}
      </div>
      {children}
      <div className="mt-auto flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <span>{hint}</span>
        {delta && <span className="font-medium text-slate-600 dark:text-slate-300">{deltaLabel}</span>}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Automation card & row
// ────────────────────────────────────────────────────────────────────────────

function TaskMoreMenu({
  task,
  favorite,
  onEdit,
  onRun,
  onToggleFavorite,
  onDelete,
}: {
  task: AutomationTaskView
  favorite: boolean
  onEdit: (id: string) => void
  onRun: (id: string) => void
  onToggleFavorite: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        className="flex size-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
        aria-label="更多操作"
      >
        <MoreHorizontal className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        <DropdownMenuItem onClick={() => onEdit(task.id)}>编辑任务</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onRun(task.id)} disabled={task.statusTone === 'running'}>立即运行</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onToggleFavorite(task.id)}>{favorite ? '取消收藏' : '加入收藏'}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDelete(task.id)} className="text-rose-600 data-highlighted:text-rose-600">删除任务</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AutomationCard({
  task,
  selected,
  favorite,
  onSelect,
  onToggleFavorite,
  onRun,
  onEdit,
  onDelete,
}: {
  task: AutomationTaskView
  selected: boolean
  favorite: boolean
  onSelect: (id: string) => void
  onToggleFavorite: (id: string) => void
  onRun: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}) {
  const Icon = task.icon
  const trigger = TRIGGER_ICON[task.scheduleType] ?? TRIGGER_ICON.manual
  const TriggerIcon = trigger.Icon
  const tone = STATUS_TONE_CHIP[task.statusTone]

  return (
    <article
      onClick={() => onSelect(task.id)}
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white p-4 text-left transition-all duration-200 hover:-translate-y-[2px] hover:shadow-[0_10px_30px_-15px_rgba(15,23,42,0.2)] dark:bg-neutral-950/40',
        selected
          ? 'border-[var(--agenthub-accent-border)] shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)]'
          : 'border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/15',
      )}
    >
      {/* Header — icon, title, always-visible favorite star + status pill */}
      <div className="flex items-start gap-3">
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105', task.iconWrapClassName)}>
          <Icon className={cn('size-5', task.iconClassName)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <h3 className="line-clamp-1 text-sm font-semibold leading-tight text-slate-950 dark:text-slate-50">{task.title || '未命名任务'}</h3>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleFavorite(task.id)
                }}
                className={cn(
                  'flex size-6 items-center justify-center rounded-md transition',
                  favorite ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 hover:text-amber-400 dark:text-slate-600 dark:hover:text-amber-400',
                )}
                title={favorite ? '取消收藏' : '收藏'}
                aria-label={favorite ? '取消收藏' : '收藏'}
              >
                <Star className={cn('size-3.5', favorite && 'fill-amber-400')} />
              </button>
              <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', tone.ring, tone.text)}>
                <span className={cn('size-1.5 rounded-full', tone.dot, task.statusTone === 'running' && 'animate-pulse')} />
                {tone.label}
              </span>
            </div>
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{task.summary}</p>
        </div>
      </div>

      {/* Trigger + category tag */}
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-white/5">
        <TriggerIcon className={cn('size-3.5 shrink-0', trigger.tone)} />
        <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{task.cadence}</span>
        {task.category.trim() && (
          <span className={cn('ml-auto inline-flex max-w-[45%] shrink-0 items-center truncate rounded-full px-2 py-0.5 text-[10px] font-medium', categoryChipClass(task.category))}>
            {task.category}
          </span>
        )}
      </div>

      {/* Footer — last run + hover actions */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-white/5 dark:text-slate-400">
        <div className="flex min-w-0 items-center gap-1.5">
          {task.statusTone === 'failed' ? (
            <>
              <CircleAlert className="size-3 shrink-0 text-rose-500" />
              <span className="truncate text-rose-600 dark:text-rose-300">最近失败</span>
              <span aria-hidden>·</span>
              <span className="shrink-0">{task.latestRun}</span>
            </>
          ) : (
            <>
              <CheckCircle2 className={cn('size-3 shrink-0', task.rawStatus === 'running' ? 'text-emerald-500' : 'text-slate-400')} />
              <span className="truncate">最近运行</span>
              <span aria-hidden>·</span>
              <span className="shrink-0">{task.latestRun}</span>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRun(task.id)
            }}
            disabled={task.statusTone === 'running'}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-[var(--agenthub-accent)] px-2 text-[10px] font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
            title="立即运行"
          >
            <Play className="size-3" />
            运行
          </button>
          <TaskMoreMenu task={task} favorite={favorite} onEdit={onEdit} onRun={onRun} onToggleFavorite={onToggleFavorite} onDelete={onDelete} />
        </div>
      </div>
    </article>
  )
}

function AutomationRow({
  task,
  selected,
  favorite,
  onSelect,
  onToggleFavorite,
  onRun,
  onEdit,
  onDelete,
}: {
  task: AutomationTaskView
  selected: boolean
  favorite: boolean
  onSelect: (id: string) => void
  onToggleFavorite: (id: string) => void
  onRun: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}) {
  const Icon = task.icon
  const trigger = TRIGGER_ICON[task.scheduleType] ?? TRIGGER_ICON.manual
  const TriggerIcon = trigger.Icon
  const tone = STATUS_TONE_CHIP[task.statusTone]

  return (
    <article
      onClick={() => onSelect(task.id)}
      className={cn(
        'group flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-3 text-left transition-all duration-200 hover:shadow-[0_6px_20px_-12px_rgba(15,23,42,0.18)] dark:bg-neutral-950/40',
        selected
          ? 'border-[var(--agenthub-accent-border)]'
          : 'border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/15',
      )}
    >
      <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', task.iconWrapClassName)}>
        <Icon className={cn('size-4', task.iconClassName)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-medium leading-tight text-slate-950 dark:text-slate-50">{task.title || '未命名任务'}</h3>
          {task.category.trim() && (
            <span className={cn('hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline-flex', categoryChipClass(task.category))}>
              {task.category}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{task.summary}</p>
      </div>
      <div className="hidden shrink-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 md:flex">
        <TriggerIcon className={cn('size-3.5', trigger.tone)} />
        <span className="w-24 truncate">{task.cadence}</span>
      </div>
      <span className={cn('hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline-flex', tone.ring, tone.text)}>
        <span className={cn('size-1.5 rounded-full', tone.dot, task.statusTone === 'running' && 'animate-pulse')} />
        {tone.label}
      </span>
      <span className="hidden w-24 shrink-0 text-right text-[11px] text-slate-400 lg:block">{task.latestRun}</span>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite(task.id)
          }}
          className={cn(
            'flex size-7 items-center justify-center rounded-md transition',
            favorite ? 'text-amber-400 hover:text-amber-500' : 'text-slate-400 hover:text-amber-400',
          )}
          title={favorite ? '取消收藏' : '收藏'}
          aria-label={favorite ? '取消收藏' : '收藏'}
        >
          <Star className={cn('size-3.5', favorite && 'fill-amber-400')} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRun(task.id)
          }}
          disabled={task.statusTone === 'running'}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-[var(--agenthub-accent)] px-2 text-[10px] font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
          title="立即运行"
        >
          <Play className="size-3" />
          运行
        </button>
        <TaskMoreMenu task={task} favorite={favorite} onEdit={onEdit} onRun={onRun} onToggleFavorite={onToggleFavorite} onDelete={onDelete} />
      </div>
    </article>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Recent runs — compact single-column rows for the bottom panel
// ────────────────────────────────────────────────────────────────────────────

const RUN_ROW_LIMIT = 4

function ActivityRunList({ runs, nowMs }: { runs: ReturnType<typeof mapAutomationRun>[]; nowMs: number }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-6 text-center text-[11px] text-slate-400 dark:border-white/10 dark:bg-white/[0.02]">
        暂无运行记录
      </div>
    )
  }
  const visible = runs.slice(0, RUN_ROW_LIMIT)
  return (
    <ul className="space-y-1.5">
      {visible.map((run) => {
        const success = run.status === '成功'
        const running = run.status === '运行中'
        const dotBg = success
          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
          : running
            ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300'
            : 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300'
        const StatusIcon = success ? CheckCircle2 : running ? Play : CircleAlert
        const chip = success
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
          : running
            ? 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'
            : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
        return (
          <li
            key={run.id}
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-slate-50 dark:hover:bg-white/[0.04]"
          >
            <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', dotBg)}>
              <StatusIcon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">{run.title}</div>
              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                <Clock4 className="size-3 shrink-0" />
                <span>{formatRelativeRunTime(run.createdAt ? new Date(run.createdAt).getTime() : nowMs, nowMs)}</span>
                {run.duration && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">{run.duration}</span>
                  </>
                )}
              </div>
            </div>
            <span className={cn('inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium', chip)}>
              {run.status}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Selected task detail panel
// ────────────────────────────────────────────────────────────────────────────

function DetailPanel({
  task,
  onClose,
  onEdit,
  onRun,
  onTogglePause,
  onDelete,
  onCopy,
  onToggleFavorite,
  onOpenConversation,
  favorite,
  runHistory,
  runHistoryLoading,
  runsError,
  busyAction,
  nowMs,
}: {
  task: AutomationTaskView
  onClose: () => void
  onEdit: () => void
  onRun: () => void
  onTogglePause: () => void
  onDelete: () => void
  onCopy: () => void
  onToggleFavorite: () => void
  onOpenConversation?: (conversationId: string) => void
  favorite: boolean
  runHistory: AutomationRunDetailItem[]
  runHistoryLoading: boolean
  runsError: string | null
  busyAction: string | null
  nowMs: number
}) {
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const tone = STATUS_TONE_CHIP[task.statusTone]
  const latestRun = runHistory[0] ?? null
  const visibleRuns = historyExpanded ? runHistory : runHistory.slice(0, RUN_ROW_LIMIT)
  const promptLineCount = task.prompt.trim() ? task.prompt.trim().split('\n').length : 0
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex w-[880px] max-w-[calc(100%-2rem)] sm:max-w-none max-h-[min(993px,calc(100vh-2rem))] flex-col gap-0 overflow-hidden rounded-2xl border-2 border-sky-300 bg-white p-0 shadow-2xl dark:border-sky-500/40 dark:bg-neutral-950">
        {/* Header — selected tag + category chip + title + status + close */}
        <DialogHeader className="shrink-0 border-b border-slate-100 px-7 pt-6 pb-4 dark:border-white/5">
          <div className="flex min-w-0 flex-1 items-start gap-3 pr-10">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500 text-white shadow-sm">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                  选中任务 / Selected
                </span>
                <span className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                  {task.category.trim() || '未分类'}
                </span>
              </div>
              <DialogTitle className="mt-2 truncate text-[22px] font-bold leading-tight text-slate-900 dark:text-slate-50">
                {task.title}
              </DialogTitle>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-500 dark:text-slate-400">
                <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', tone.ring, tone.text)}>
                  <span className={cn('size-1.5 rounded-full', tone.dot, task.statusTone === 'running' && 'animate-pulse')} />
                  {tone.label}
                </span>
                <span>{automationStatusDescription(task.rawStatus)}</span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="space-y-5 px-7 pb-6 pt-4">
            {/* 4 个 Meta — 分类 / 触发节奏 / 下次运行 / 最近运行 */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Meta label="分类 / Category" value={task.category.trim() || '—'} sublabel="用户自定义标签" />
              <Meta
                label="触发节奏 / Cadence"
                value={task.cadence}
                sublabel={`${triggerTypeLabel(task.scheduleType)} · ${resolveTimeZoneLabel()}`}
              />
              <Meta
                label="下次运行 / Next Run"
                value={task.nextRunAt ? formatAbsoluteClock(task.nextRunAt, nowMs) : '—'}
                sublabel={task.nextRunAt ? formatNextRunCountdown(task.nextRunAt, nowMs) : '手动触发，无计划时间'}
                highlight
              />
              <Meta
                label="最近运行 / Latest Run"
                value={task.latestRun}
                sublabel={
                  latestRun ? (
                    <span className="flex items-center gap-1">
                      <span
                        className={cn(
                          latestRun.status === 'success'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : latestRun.status === 'running'
                              ? 'text-sky-600 dark:text-sky-400'
                              : 'text-rose-600 dark:text-rose-400',
                        )}
                      >
                        {latestRun.status === 'success' ? '成功' : latestRun.status === 'running' ? '运行中' : '失败'}
                      </span>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <span className="tabular-nums">{formatDurationMs(latestRun.durationMs)}</span>
                    </span>
                  ) : (
                    <span>{task.lastError ? '最近一次运行失败' : '尚未产生运行记录'}</span>
                  )
                }
              />
            </div>

            {/* 任务提示词预览 (只读 · line-clamp 3 + 展开) */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                  <Sparkles className="size-3.5 text-slate-500 dark:text-slate-400" />
                  任务提示词预览
                </h3>
                <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                  <Lock className="size-3" />只读 · line-clamp 3
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                <p
                  className={cn(
                    'whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-slate-700 dark:text-slate-300',
                    !promptExpanded && 'line-clamp-3',
                  )}
                >
                  {task.prompt || '暂无提示词'}
                </p>
                {task.prompt.trim() && (promptLineCount > 3 || task.prompt.length > 200) && (
                  <button
                    type="button"
                    onClick={() => setPromptExpanded((v) => !v)}
                    className="mt-2 text-[11.5px] font-medium text-sky-600 hover:underline dark:text-sky-400"
                  >
                    {promptExpanded
                      ? '收起'
                      : promptLineCount > 3
                        ? `+ ${promptLineCount - 3} 行内容已折叠`
                        : '展开全部内容'}
                  </button>
                )}
              </div>
            </section>

            {/* 最近一次错误 (高亮块) */}
            {task.lastError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-500/30 dark:bg-rose-500/10">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-300" />
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-rose-700 dark:text-rose-200">最近一次错误 · {formatDateTime(task.latestRunAt)}</div>
                  <div className="mt-0.5 text-[12px] leading-relaxed text-rose-700 dark:text-rose-300">{task.lastError}</div>
                </div>
              </div>
            )}

            {/* 操作按钮组 (4 按钮 + 复制 + ⋯) */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {task.conversationId && onOpenConversation && (
                  <Button
                    variant="outline"
                    onClick={() => onOpenConversation(task.conversationId as string)}
                    className="h-9 rounded-full border-slate-200 px-4 text-[12.5px] font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.04]"
                  >
                    <ExternalLink className="mr-1.5 size-3.5" />查看结果会话
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={onEdit}
                  className="h-9 rounded-full border-slate-200 px-4 text-[12.5px] font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.04]"
                >
                  <Settings2 className="mr-1.5 size-3.5" />编辑
                </Button>
                {task.rawStatus === 'enabled' || task.rawStatus === 'running' ? (
                  <Button
                    variant="outline"
                    onClick={onTogglePause}
                    disabled={busyAction !== null}
                    className="h-9 rounded-full border-amber-300 bg-amber-50 px-4 text-[12.5px] font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200"
                  >
                    <Pause className="mr-1.5 size-3.5" />暂停
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={onTogglePause}
                    disabled={busyAction !== null}
                    className="h-9 rounded-full border-emerald-300 bg-emerald-50 px-4 text-[12.5px] font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200"
                  >
                    <Play className="mr-1.5 size-3.5" />启用
                  </Button>
                )}
                <Button
                  onClick={onRun}
                  disabled={busyAction === 'run' || task.statusTone === 'running'}
                  className="h-9 rounded-full bg-sky-600 px-4 text-[12.5px] font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
                >
                  <Play className="mr-1.5 size-3.5 fill-white" />
                  {busyAction === 'run' ? '运行中…' : '立即运行'}
                </Button>
                <Button
                  variant="outline"
                  onClick={onDelete}
                  disabled={busyAction === 'delete'}
                  className="h-9 rounded-full border-rose-300 px-4 text-[12.5px] font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-500/40 dark:hover:bg-rose-500/10"
                >
                  <Trash2 className="mr-1.5 size-3.5" />删除
                </Button>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onCopy}
                  aria-label="复制任务提示词"
                  title="复制任务提示词"
                  className="flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:border-white/20 dark:hover:text-slate-200"
                >
                  <Copy className="size-3.5" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label="更多操作"
                    className="flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:border-white/20 dark:hover:text-slate-200"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[160px]">
                    <DropdownMenuItem onClick={onEdit}>编辑任务</DropdownMenuItem>
                    <DropdownMenuItem onClick={onRun} disabled={busyAction !== null || task.statusTone === 'running'}>
                      立即运行
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onToggleFavorite}>
                      <Star className={cn('size-3.5', favorite && 'fill-current')} />
                      {favorite ? '取消收藏' : '加入收藏'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={onDelete}
                      disabled={busyAction === 'delete'}
                      className="text-rose-600 data-highlighted:text-rose-600"
                    >
                      删除任务
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* 运行历史 — 5 行 (前 4 条 / 共 N 条) */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                  <History className="size-3.5 text-slate-500 dark:text-slate-400" />
                  运行历史
                </h3>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                    {runHistory.length === 0
                      ? '暂无记录'
                      : `显示 ${visibleRuns.length} 条 / 共 ${runHistory.length} 条`}
                  </span>
                  {runHistoryLoading && <span className="text-[11px] text-slate-400">加载中</span>}
                  {runHistory.length > RUN_ROW_LIMIT && (
                    <button
                      type="button"
                      onClick={() => setHistoryExpanded((v) => !v)}
                      className="inline-flex items-center gap-0.5 text-[11.5px] font-medium text-sky-600 hover:underline dark:text-sky-400"
                    >
                      {historyExpanded ? '收起' : '查看全部'}
                      <ChevronRight className={cn('size-3 transition-transform', historyExpanded && '-rotate-90')} />
                    </button>
                  )}
                </div>
              </div>
              {runsError && <p className="text-xs text-rose-600 dark:text-rose-300">{runsError}</p>}
              <div className="space-y-2">
                {visibleRuns.map((run, index) => {
                  const success = run.status === 'success'
                  const running = run.status === 'running'
                  const failed = !success && !running
                  const summary = runSummaryText(run)
                  return (
                    <div
                      key={run.id}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border px-3.5 py-2.5',
                        failed
                          ? 'border-rose-200 bg-rose-50/50 dark:border-rose-500/30 dark:bg-rose-500/[0.08]'
                          : 'border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]',
                      )}
                    >
                      <div
                        className={cn(
                          'flex size-7 shrink-0 items-center justify-center rounded-full',
                          success
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                            : running
                              ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
                        )}
                      >
                        {success ? <CheckCircle2 className="size-4" /> : running ? <Play className="size-4" /> : <CircleAlert className="size-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-slate-800 dark:text-slate-200">
                          {index === 0 && runHistory.length > 0 && (
                            <span className="inline-flex items-center rounded-md bg-sky-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                              最新
                            </span>
                          )}
                          <span>{run.trigger === 'manual' ? '手动触发' : '计划触发'} · {success ? '成功' : running ? '运行中' : '失败'}</span>
                        </div>
                        {summary && (
                          <div className="mt-0.5 truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                            {summary}
                          </div>
                        )}
                      </div>
                      {run.conversationId && onOpenConversation && (
                        <button
                          type="button"
                          onClick={() => onOpenConversation(run.conversationId as string)}
                          title="打开这次运行的产出会话"
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:border-[var(--agenthub-accent-border)] hover:bg-[var(--agenthub-accent-soft)]/40 hover:text-[var(--agenthub-accent)] dark:border-white/10 dark:text-slate-300"
                        >
                          <ExternalLink className="size-3" />
                          查看会话
                        </button>
                      )}
                      <div className="shrink-0 text-right text-[11.5px] tabular-nums text-slate-500 dark:text-slate-400">
                        {formatRelativeRunTime(run.startedAt, nowMs)}
                        <span aria-hidden> · </span>
                        {running ? '进行中' : formatDurationMs(run.durationMs)}
                      </div>
                    </div>
                  )
                })}
                {!runHistoryLoading && runHistory.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-6 text-center text-xs text-slate-400 dark:border-white/10 dark:bg-white/[0.02]">
                    暂无运行历史
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Create / Edit task dialog
// ────────────────────────────────────────────────────────────────────────────

const CATEGORY_PRESETS = ['资讯简报', '学习助手', '效率工具', '生活提醒', '自定义任务']

const TRIGGER_OPTIONS: { value: AutomationScheduleType; label: string; hint: string }[] = [
  { value: 'manual', label: '手动触发', hint: '需要时手动运行' },
  { value: 'interval', label: '间隔执行', hint: '按固定间隔循环' },
  { value: 'daily', label: '每天执行', hint: '固定时间每日运行' },
  { value: 'weekly', label: '每周执行', hint: '指定星期与时间' },
]

const FORM_STATUS_OPTIONS: {
  value: Exclude<AutomationStatus, 'running'>
  label: string
  hint: string
  dot: string
  chip: string
}[] = [
  { value: 'enabled', label: '启用', hint: '保存后按计划自动运行', dot: 'bg-sky-500', chip: 'bg-sky-50 dark:bg-sky-500/10' },
  { value: 'paused', label: '暂停', hint: '保留配置，暂不触发', dot: 'bg-slate-400', chip: 'bg-slate-100 dark:bg-white/5' },
  { value: 'draft', label: '草稿', hint: '先保存，稍后完善', dot: 'bg-amber-500', chip: 'bg-amber-50 dark:bg-amber-500/10' },
]

const WEEKDAY_FORM_OPTIONS: { value: string; label: string }[] = [
  { value: '1', label: '一' },
  { value: '2', label: '二' },
  { value: '3', label: '三' },
  { value: '4', label: '四' },
  { value: '5', label: '五' },
  { value: '6', label: '六' },
  { value: '0', label: '日' },
]

const SELECT_CLASS =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm transition focus:border-[var(--agenthub-accent-border)] focus:outline-none dark:border-white/10 dark:bg-neutral-900 dark:text-slate-200'

// Vertical upcoming list (used in the bottom-right panel)

function UpcomingList({
  tasks,
  nowMs,
  onSelect,
}: {
  tasks: AutomationTaskView[]
  nowMs: number
  onSelect: (id: string) => void
}) {
  const upcoming = useMemo(
    () =>
      tasks
        .filter((task) => task.nextRunAt !== null && task.nextRunAt >= nowMs && task.rawStatus !== 'paused' && task.rawStatus !== 'draft')
        .sort((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0))
        .slice(0, 4),
    [tasks, nowMs],
  )
  if (upcoming.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-6 text-center text-[11px] text-slate-400 dark:border-white/10 dark:bg-white/[0.02]">
        暂无即将执行的任务
      </div>
    )
  }
  return (
    <ul className="space-y-1.5">
      {upcoming.map((task) => {
        const Icon = task.icon
        return (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onSelect(task.id)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50 dark:hover:bg-white/[0.04]"
            >
              <span className="w-12 shrink-0 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                {formatAbsoluteClock(task.nextRunAt ?? nowMs, nowMs)}
              </span>
              <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md', task.iconWrapClassName)}>
                <Icon className={cn('size-3.5', task.iconClassName)} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">{task.title}</div>
              </div>
              <span className="shrink-0 truncate text-[11px] text-violet-500">{task.nextRunLabel}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// Bottom-panel area chart (filled line for last 7 days)

function TrendAreaChart({ values, weekdayLabels }: { values: number[]; weekdayLabels: string[] }) {
  const data = values.length >= 2 ? values : [0, 0, 0, 0, 0, 0, 0]
  const max = Math.max(...data, 1)
  const allZero = data.every((v) => v === 0)
  const w = 100
  const h = 56
  const padX = 3
  const padTop = 8
  const padBottom = 14
  const points = data.map((value, index) => {
    const x = padX + (index / (data.length - 1)) * (w - padX * 2)
    const y = h - padBottom - (allZero ? 0 : (value / max) * (h - padTop - padBottom))
    return [x, y] as const
  })
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const areaPath = `M${padX},${h - padBottom} L${line.replace(/ /g, ' L')} L${w - padX},${h - padBottom} Z`
  const lastIndex = points.length - 1
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-24 w-full" aria-hidden>
      {!allZero && <path d={areaPath} fill="var(--agenthub-accent)" fillOpacity="0.15" />}
      <polyline
        points={line}
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        strokeDasharray={allZero ? '2 2' : undefined}
        stroke="var(--agenthub-accent)"
        opacity={allZero ? 0.4 : 1}
      />
      {!allZero && points.map(([x, y], idx) => (
        <circle
          key={idx}
          cx={x}
          cy={y}
          r={idx === lastIndex ? 1.6 : 1}
          fill="var(--agenthub-accent)"
          fillOpacity={idx === lastIndex ? 1 : 0.6}
        />
      ))}
      {weekdayLabels.map((label, idx) => {
        const x = padX + (idx / (data.length - 1)) * (w - padX * 2)
        return (
          <text
            key={`${label}-${idx}`}
            x={x}
            y={h - 2}
            textAnchor="middle"
            className="fill-slate-400"
            style={{ fontSize: 6 }}
          >
            {label}
          </text>
        )
      })}
    </svg>
  )
}

function scheduleSummaryText(form: AutomationFormState): string {
  if (form.scheduleType === 'interval') return `每 ${form.intervalMinutes || '60'} 分钟自动执行一次`
  if (form.scheduleType === 'daily') return `每天 ${form.timeOfDay || '09:00'} 自动执行`
  if (form.scheduleType === 'weekly') {
    const day = WEEKDAY_FORM_OPTIONS.find((option) => option.value === (form.dayOfWeek || '1'))
    return `每周${day?.label ?? '一'} ${form.timeOfDay || '09:00'} 自动执行`
  }
  return '仅手动触发，不会自动运行'
}

function TaskFormDialog({
  open,
  mode,
  form,
  onFormChange,
  agents,
  conversations,
  submitting,
  promptFilling,
  dialogError,
  onDismissError,
  onEnhancePrompt,
  onSave,
  onClose,
}: {
  open: boolean
  mode: 'create' | 'edit'
  form: AutomationFormState
  onFormChange: (patch: Partial<AutomationFormState>) => void
  agents: { id: string; name: string }[]
  conversations: { id: string; title: string }[]
  submitting: boolean
  promptFilling: boolean
  dialogError: string | null
  onDismissError: () => void
  onEnhancePrompt: () => void
  onSave: () => void
  onClose: () => void
}) {
  const trigger = TRIGGER_ICON[form.scheduleType] ?? TRIGGER_ICON.manual
  const TriggerIcon = trigger.Icon
  const missingRequired = !form.title.trim() || !form.prompt.trim()
  const isEdit = mode === 'edit'
  const topTag = isEdit ? '编辑 / Edit' : '新建 / Create'
  const primaryLabel = isEdit ? '保存更新' : '保存草稿'

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex w-[720px] max-w-[calc(100%-2rem)] sm:max-w-none max-h-[min(993px,calc(100vh-2rem))] flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 bg-white p-0 shadow-2xl dark:border-white/10 dark:bg-neutral-950">
        {/* Header — tag + title + description (close button rendered by DialogContent) */}
        <DialogHeader className="shrink-0 px-7 pt-6 pb-4">
          <div className="min-w-0 pr-10">
            <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
              {topTag}
            </span>
            <DialogTitle className="mt-2.5 text-[22px] font-bold leading-tight text-slate-900 dark:text-slate-50">
              {isEdit ? '编辑自动化任务' : '创建自动化任务'}
            </DialogTitle>
            <DialogDescription className="mt-1.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
              {isEdit
                ? '表单与「新建」完全一致。初值取自选中的任务快照，保存后保留选中态，详情面板继续展开。'
                : '配置任务提示词、执行目标和基础触发计划。新建后可在卡片网格中查看。'}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="space-y-6 px-7 pb-6 pt-4">
            {/* 错误提示条 — 窗口内展示（AI 优化失败 / 校验失败 / 保存失败） */}
            {dialogError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 leading-relaxed">{dialogError}</span>
                <button
                  type="button"
                  onClick={onDismissError}
                  aria-label="关闭错误提示"
                  className="shrink-0 rounded-md p-0.5 text-rose-400 transition hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-500/20 dark:hover:text-rose-200"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
            )}

            {/* ① 基本信息 (单列：标题必填 / 分类 / 描述) */}
            <section className="space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                  <User className="size-3.5 text-slate-500 dark:text-slate-400" />
                  基本信息
                </h3>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">必填 · 1 项</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="flex items-center justify-between text-[12px] font-medium text-slate-700 dark:text-slate-300">
                    <span>标题 / Title</span>
                    <span className="text-rose-500">必填</span>
                  </span>
                  <Input
                    value={form.title}
                    onChange={(event) => onFormChange({ title: event.target.value })}
                    placeholder="例如：定时同步竞品文档"
                    className="h-9"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300">分类 / Category</span>
                  <select
                    value={form.category}
                    onChange={(event) => onFormChange({ category: event.target.value })}
                    className={cn(SELECT_CLASS, 'cursor-pointer')}
                  >
                    {CATEGORY_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>{preset}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block space-y-1.5">
                <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300">描述 / Description</span>
                <Input
                  value={form.description}
                  onChange={(event) => onFormChange({ description: event.target.value })}
                  placeholder="一句话说明，例如：每周一汇总上周产品调研，并整理成报告"
                  className="h-9"
                />
              </label>
            </section>

            {/* ② 任务提示词 — 编辑器 (header + textarea + footer 字数) */}
            <section className="space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                  <Sparkles className="size-3.5 text-slate-500 dark:text-slate-400" />
                  任务提示词
                </h3>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums text-[11px] text-slate-400 dark:text-slate-500">
                    {form.prompt.length} / 800
                  </span>
                  <button
                    type="button"
                    onClick={onEnhancePrompt}
                    disabled={promptFilling || submitting}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--agenthub-accent-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--agenthub-accent)] transition hover:opacity-80 disabled:cursor-wait disabled:opacity-60"
                  >
                    <Sparkles className={cn('size-3', promptFilling && 'animate-pulse')} />
                    {promptFilling ? 'AI 优化中…' : 'AI 优化'}
                  </button>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 focus-within:border-[var(--agenthub-accent-border)] dark:border-white/10 dark:focus-within:border-[var(--agenthub-accent-border)]">
                <Textarea
                  value={form.prompt}
                  onChange={(event) => onFormChange({ prompt: event.target.value.slice(0, 800) })}
                  placeholder={'逐条列出希望 Agent 完成的动作，例如：\n1. 拉取本周新增竞品发布；\n2. 与历史版本做对比，输出关键差异；'}
                  className="min-h-32 resize-none whitespace-pre-wrap break-words border-0 shadow-none focus-visible:ring-0"
                />
              </div>
            </section>

            {/* ③ 执行目标 — Agent + 会话 双列 */}
            <section className="space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                  <Zap className="size-3.5 text-slate-500 dark:text-slate-400" />
                  执行目标
                </h3>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">未指定则自动选择</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300">目标 Agent</span>
                  <select value={form.agentId} onChange={(event) => onFormChange({ agentId: event.target.value })} className={cn(SELECT_CLASS, 'cursor-pointer')}>
                    <option value="">Auto · 自动指派</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300">目标会话</span>
                  <select value={form.conversationId} onChange={(event) => onFormChange({ conversationId: event.target.value })} className={cn(SELECT_CLASS, 'cursor-pointer')}>
                    <option value="">未绑定会话</option>
                    {conversations.map((conversation) => (
                      <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            {/* ④ 触发计划 — 预览框 + 3 列 (类型 / 间隔 / 状态) + 条件字段说明 */}
            <section className="space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                  <Clock4 className="size-3.5 text-slate-500 dark:text-slate-400" />
                  触发计划
                </h3>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">类型 · 间隔 · 状态</span>
              </div>

              {/* 预览框 */}
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-white/[0.04]">
                <TriggerIcon className={cn('size-3.5 shrink-0', trigger.tone)} />
                <span className="text-[12.5px] font-medium text-slate-700 dark:text-slate-200">
                  预览：{scheduleSummaryText(form)}
                </span>
              </div>

              {/* 3 列：触发类型 / 间隔分钟 / 状态 */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block space-y-1.5">
                  <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300">触发类型</span>
                  <select value={form.scheduleType} onChange={(event) => onFormChange({ scheduleType: event.target.value as AutomationScheduleType })} className={cn(SELECT_CLASS, 'cursor-pointer')}>
                    {TRIGGER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label} · {opt.hint}</option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300">
                    {form.scheduleType === 'interval' ? '间隔分钟' : form.scheduleType === 'weekly' ? '时间' : form.scheduleType === 'daily' ? '时间' : '默认值'}
                  </span>
                  {form.scheduleType === 'interval' ? (
                    <div className="relative">
                      <Input
                        type="number"
                        min={1}
                        value={form.intervalMinutes}
                        onChange={(event) => onFormChange({ intervalMinutes: event.target.value })}
                        className="h-9 pr-12"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] text-slate-400">分钟</span>
                    </div>
                  ) : form.scheduleType === 'manual' ? (
                    <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-[12px] text-slate-400 dark:border-white/10 dark:bg-white/[0.02]">—</div>
                  ) : (
                    <div className="relative">
                      <Input type="time" value={form.timeOfDay} onChange={(event) => onFormChange({ timeOfDay: event.target.value })} className="h-9 pr-12" />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] text-slate-400">调起</span>
                    </div>
                  )}
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300">状态</span>
                  <select value={form.status} onChange={(event) => onFormChange({ status: event.target.value as Exclude<AutomationStatus, 'running'> })} className={cn(SELECT_CLASS, 'cursor-pointer')}>
                    {FORM_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label} · {opt.hint}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* weekly 额外选星期 */}
              {form.scheduleType === 'weekly' && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300">星期</span>
                  {WEEKDAY_FORM_OPTIONS.map((option) => {
                    const active = (form.dayOfWeek || '1') === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onFormChange({ dayOfWeek: option.value })}
                        className={cn(
                          'flex size-7 items-center justify-center rounded-md border text-[11px] font-medium transition',
                          active
                            ? 'border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent)] text-white shadow-sm'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-800 dark:border-white/10 dark:text-slate-400 dark:hover:text-slate-200',
                        )}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* 条件字段说明 */}
              <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2 text-[11.5px] text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
                <Info className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                <span className="leading-relaxed">
                  {form.scheduleType === 'interval'
                    ? '条件字段：类型 = 定时循环 → 间隔分钟；= 每日 → 时间；= 每周 → 时间 + 星期。其余类型仅展示基础字段。'
                    : form.scheduleType === 'daily'
                      ? '条件字段：类型 = 定时循环 → 间隔分钟；= 每日 → 时间；= 每周 → 时间 + 星期。其余类型仅展示基础字段。'
                      : form.scheduleType === 'weekly'
                        ? '当前为「每周 / Weekly」，因此展示 时间 + 星期；切换到「定时循环」则改为展示 间隔分钟。'
                        : '条件字段：类型 = 定时循环 → 间隔分钟；= 每日 → 时间；= 每周 → 时间 + 星期。其余类型仅展示基础字段。'}
                </span>
              </div>
            </section>

            {/* ⑤ 提示带 (橙色琥珀) */}
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span className="leading-relaxed">
                {isEdit
                  ? '提示：编辑后仍属于同一任务，详情面板会保留选中态并刷新元信息。'
                  : '保存后会留在「任务卡片网格」中，并以选中态展开详情面板。可随时通过 ⋯ 菜单编辑。'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer — 快捷键 + 取消 + 主按钮 */}
        <DialogFooter className="mx-0 mb-0 shrink-0 flex-row items-center justify-between gap-3 border-t border-slate-100 bg-white px-7 py-4 sm:justify-between dark:border-white/5 dark:bg-neutral-950">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            <Keyboard className="size-3" />
            按 ⌘/Ctrl + Enter 保存
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <Button variant="outline" onClick={onClose} disabled={submitting || promptFilling} className="h-10 rounded-full border-slate-200 px-5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/[0.04]">
              取消
            </Button>
            <Button
              onClick={onSave}
              disabled={submitting || promptFilling || missingRequired}
              className="h-10 rounded-full bg-sky-600 px-5 text-[13px] font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
            >
              <Save className="mr-1.5 size-3.5" />
              {submitting ? '保存中…' : primaryLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

type LoadDashboardOptions = { silent?: boolean }

export function AutomationWorkspace({
  onOpenConversation,
}: {
  /** 跳到「这次运行的产出会话」。会话由 app-workbench 切换视图。 */
  onOpenConversation?: (conversationId: string) => void
} = {}) {
  const [dashboard, setDashboard] = useState<AutomationDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [sortKey, setSortKey] = useState<SortKey>('next')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set<string>()
    try {
      const raw = window.localStorage.getItem('agenthub:automation-favorites')
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : [])
    } catch {
      return new Set<string>()
    }
  })
    const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [form, setForm] = useState<AutomationFormState>(() => automationFormFromTask())
  const [submitting, setSubmitting] = useState(false)
  const [promptFilling, setPromptFilling] = useState(false)
  const [promptEnhanceOpen, setPromptEnhanceOpen] = useState(false)
  const [promptEnhanceOriginal, setPromptEnhanceOriginal] = useState('')
  const [promptEnhanceResult, setPromptEnhanceResult] = useState('')
  const [promptEnhanceError, setPromptEnhanceError] = useState<string | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [runHistory, setRunHistory] = useState<AutomationRunDetailItem[]>([])
  const [runHistoryLoading, setRunHistoryLoading] = useState(false)
  const [runsError, setRunsError] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  const [trendRange, setTrendRange] = useState<AutomationTrendRange>(7)
  const trendRangeRef = useRef<AutomationTrendRange>(7)
  const requestSeqRef = useRef(0)
  const hasDashboardRef = useRef(false)

  // Keep nowMs fresh — drives all relative-time labels without breaking purity rules
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  // Persist favorites across sessions
  useEffect(() => {
    try {
      window.localStorage.setItem('agenthub:automation-favorites', JSON.stringify([...favorites]))
    } catch {
      /* ignore persistence errors (private mode / quota) */
    }
  }, [favorites])

  const loadDashboard = useCallback(
    async (options: LoadDashboardOptions = {}) => {
      const requestSeq = requestSeqRef.current + 1
      requestSeqRef.current = requestSeq
      const hasDashboard = hasDashboardRef.current
      if (!options.silent) {
        if (hasDashboard) setRefreshing(true)
        else setLoading(true)
        setError(null)
      }
      try {
        const nextDashboard = await fetchAutomationDashboard({ days: trendRangeRef.current })
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
    },
    [],
  )

  const changeTrendRange = useCallback(
    (nextRange: AutomationTrendRange) => {
      if (trendRangeRef.current === nextRange) return
      trendRangeRef.current = nextRange
      setTrendRange(nextRange)
      void loadDashboard({ silent: true })
    },
    [loadDashboard],
  )

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
    () => (dashboard?.automations ?? []).map((item) => mapAutomationTask(item, nowMs)),
    [dashboard?.automations, nowMs],
  )
  const recentRuns = useMemo(() => (dashboard?.recentRuns ?? []).map(mapAutomationRun), [dashboard?.recentRuns])
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null
  const trend = dashboard?.trend ?? []
  const trendTotal = trend.reduce((acc, point) => acc + point.value, 0)
  const hasRunData = trendTotal > 0 || (dashboard?.stats?.todayRunCount ?? 0) > 0
  const recentFailCount = dashboard?.stats.failCount ?? 0
  const initialLoading = loading && !dashboard
  // Trend-derived KPI inputs (today vs yesterday for the delta badge)
  const trendValues = trend.map((point) => point.value)
  const todayTrendRuns = trend.length > 0 ? trend[trend.length - 1].value : 0
  const yesterdayTrendRuns = trend.length > 1 ? trend[trend.length - 2].value : 0
  const todayDelta = todayTrendRuns - yesterdayTrendRuns
  const showTodayDelta = trend.length > 1 && (todayTrendRuns > 0 || yesterdayTrendRuns > 0)

  // 环比：本周运行次数 vs 上一周期
  const prevRunCount = dashboard?.stats.previousRunCount ?? 0
  const runCountDelta = trendTotal - prevRunCount
  const showRunCountDelta = prevRunCount > 0 || trendTotal > 0
  // 成功率环比（百分点差）
  const prevSuccessRate = dashboard?.stats.previousSuccessRate ?? 0
  const successRateDelta = Math.round(((dashboard?.stats.successRate ?? 0) - prevSuccessRate) * 10) / 10
  // 失败次数环比
  const prevFailCount = dashboard?.stats.previousFailCount ?? 0
  const failCountDelta = recentFailCount - prevFailCount
  const agents = useAgentList()
  const conversations = useConversationList()
  const addNotification = useAppStore((s) => s.addNotification)
  const setConversations = useAppStore((s) => s.setConversations)

  const refreshConversations = useCallback(async () => {
    setConversations(await fetchConversations())
  }, [setConversations])

  const notifyAutomation = useCallback(
    (notification: Omit<AppNotification, 'id' | 'createdAt' | 'source'>) => {
      addNotification({
        ...notification,
        id: `ntf_${nanoid()}`,
        source: 'ui',
        createdAt: Date.now(),
      })
    },
    [addNotification],
  )

  const copyTaskPrompt = useCallback(
    async (task: AutomationTaskView) => {
      const text = task.prompt.trim()
      if (!text) {
        notifyAutomation({ title: '复制失败', body: '该任务暂无提示词内容。', level: 'error', automationId: task.id })
        return
      }
      try {
        await navigator.clipboard.writeText(text)
        notifyAutomation({ title: '已复制提示词', body: `任务「${task.title}」的提示词已复制到剪贴板。`, level: 'success', automationId: task.id })
      } catch {
        notifyAutomation({ title: '复制失败', body: '剪贴板不可用，请检查浏览器权限。', level: 'error', automationId: task.id })
      }
    },
    [notifyAutomation],
  )

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = { all: tasks.length, enabled: 0, paused: 0, failed: 0, recent: 0, favorite: 0 }
    const dayMs = 24 * 60 * 60 * 1000
    for (const task of tasks) {
      if (task.rawStatus === 'enabled' || task.rawStatus === 'running') counts.enabled += 1
      if (task.rawStatus === 'paused') counts.paused += 1
      if (task.statusTone === 'failed' || task.lastError) counts.failed += 1
      if (task.latestRunAt && nowMs - task.latestRunAt <= dayMs) counts.recent += 1
      if (favorites.has(task.id)) counts.favorite += 1
    }
    return counts
  }, [tasks, favorites, nowMs])

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return tasks.filter((task) => {
      if (activeTab === 'enabled' && task.rawStatus !== 'enabled' && task.rawStatus !== 'running') return false
      if (activeTab === 'paused' && task.rawStatus !== 'paused') return false
      if (activeTab === 'failed' && task.statusTone !== 'failed' && !task.lastError) return false
      if (activeTab === 'recent' && !(task.latestRunAt && nowMs - task.latestRunAt <= 24 * 60 * 60 * 1000)) return false
      if (activeTab === 'favorite' && !favorites.has(task.id)) return false
      if (query) {
        const haystack = `${task.title} ${task.description} ${task.category}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [tasks, activeTab, searchQuery, favorites, nowMs])

  // Sorted tasks driven by the sort dropdown
  const displayTasks = useMemo(() => {
    const list = [...filteredTasks]
    if (sortKey === 'next') {
      list.sort((a, b) => (a.nextRunAt ?? Number.POSITIVE_INFINITY) - (b.nextRunAt ?? Number.POSITIVE_INFINITY))
    } else if (sortKey === 'recent') {
      list.sort((a, b) => (b.latestRunAt ?? 0) - (a.latestRunAt ?? 0))
    } else if (sortKey === 'name') {
      list.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    } else {
      const toneOrder: Record<AutomationTaskView['statusTone'], number> = { running: 0, failed: 1, enabled: 2, draft: 3, paused: 4 }
      list.sort((a, b) => toneOrder[a.statusTone] - toneOrder[b.statusTone] || (b.latestRunAt ?? 0) - (a.latestRunAt ?? 0))
    }
    return list
  }, [filteredTasks, sortKey])

  const openCreateDialog = () => {
    setForm(automationFormFromTask())
    setDialogMode('create')
    setEditingTaskId(null)
    setDialogError(null)
  }

  const openEditDialog = (id?: string) => {
    const task = id ? tasks.find((t) => t.id === id) ?? selectedTask : selectedTask
    if (!task) return
    setForm(automationFormFromTask(task))
    setDialogMode('edit')
    setEditingTaskId(task.id)
    setSelectedTaskId(null)
    setDialogError(null)
  }

  const handleSaveAutomation = async () => {
    if (!form.title.trim() || !form.prompt.trim()) {
      setDialogError('标题和任务提示词不能为空')
      return
    }
    setSubmitting(true)
    setDialogError(null)
    try {
      const body = buildAutomationSaveBody(form)
      const saved = dialogMode === 'edit' && editingTaskId ? await updateAutomation(editingTaskId, body) : await createAutomation(body)
      setDialogMode(null)
      setEditingTaskId(null)
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
      setDialogError(message)
      notifyAutomation({ title: '自动化任务保存失败', body: message, level: 'error', urgent: true })
    } finally {
      setSubmitting(false)
    }
  }

  const handleEnhanceAutomationPrompt = async () => {
    if (!form.title.trim() && !form.description.trim() && !form.prompt.trim()) {
      setDialogError('请先填写标题、描述或任务提示词，再使用 AI 优化提示词')
      return
    }
    const originalPrompt = form.prompt.trim()
    const originalText = originalPrompt || '未输入原始提示词，AI 将根据任务标题、描述、分类和触发计划生成。'
    setPromptFilling(true)
    setPromptEnhanceOriginal(originalText)
    setPromptEnhanceResult('')
    setPromptEnhanceError(null)
    setPromptEnhanceOpen(true)
    setDialogError(null)
    try {
      const result = await optimizePrompt(buildAutomationPromptEnhanceInput(form))
      setPromptEnhanceResult(result.enhancedText.trim())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI 优化提示词失败'
      setPromptEnhanceError(message)
      notifyAutomation({ title: 'AI 优化提示词失败', body: message, level: 'error' })
    } finally {
      setPromptFilling(false)
    }
  }

  const runAutomationAction = useCallback(
    async (action: 'enable' | 'disable' | 'run' | 'delete', taskId?: string) => {
      const task = taskId ? tasks.find((t) => t.id === taskId) : selectedTask
      if (!task) return
      setActionLoading(action)
      setError(null)
      try {
        if (action === 'enable') await enableAutomation(task.id)
        if (action === 'disable') await disableAutomation(task.id)
        if (action === 'run') await runAutomationNow(task.id)
        if (action === 'delete') {
          if (!window.confirm(`确认删除自动化任务「${task.title}」？`)) {
            setActionLoading(null)
            return
          }
          await deleteAutomation(task.id)
          if (selectedTaskId === task.id) setSelectedTaskId(null)
        }
        notifyAutomation({
          title: action === 'run' ? '已提交自动化运行' : action === 'delete' ? '自动化任务已删除' : '自动化任务状态已更新',
          body:
            action === 'run'
              ? `任务「${task.title}」已开始执行。`
              : `任务「${task.title}」操作已完成。`,
          level: 'success',
          automationId: task.id,
        })
        await loadDashboard()
        if (action === 'enable' || action === 'run') await refreshConversations()
      } catch (err) {
        const message = err instanceof Error ? err.message : '自动化操作失败'
        setError(message)
        notifyAutomation({ title: '自动化操作失败', body: message, level: 'error', automationId: task.id, urgent: true })
      } finally {
        setActionLoading(null)
      }
    },
    [tasks, selectedTask, selectedTaskId, notifyAutomation, loadDashboard, refreshConversations],
  )

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Build per-tab stats values
  const statValues = useMemo(() => {
    const stats = dashboard?.stats
    return {
      enabled: String(stats?.enabledCount ?? 0),
      today: String(stats?.todayRunCount ?? 0),
      success: `${stats?.successRate ?? 0}%`,
    }
  }, [dashboard?.stats])

  return (
    <div className="h-full p-4 xl:p-6">
      <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
        {/* Header */}
        <div className="shrink-0 border-b border-slate-100 p-4 xl:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">自动化</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">让 Agent 按计划自动执行任务，解放重复劳动，提升工作效率。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:bg-white/5 dark:text-slate-400">
                <span className={cn('size-1.5 rounded-full', hasRunningState ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400')} />
                {formatSyncTime(lastUpdatedAt, nowMs)}
              </span>
              <Button variant="outline" disabled={refreshing} onClick={() => void loadDashboard()} className="h-9 rounded-xl border-slate-200 px-3 text-xs text-slate-700 transition hover:border-[var(--agenthub-accent-border)] hover:bg-slate-100 hover:text-slate-900">
                <RefreshCw className={cn('mr-1.5 size-3.5', refreshing && 'animate-spin')} />
                {refreshing ? '同步中' : '刷新'}
              </Button>
              <Button onClick={openCreateDialog} className="h-9 rounded-xl px-3 text-xs">
                <Plus className="mr-1.5 size-3.5" />
                新建自动化
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

            {/* Stat tiles — real KPI visuals: ratio bar / sparkline / ring */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <DashboardTile
                stat={STAT_TILES[0]}
                value={initialLoading ? '—' : `${statValues.enabled} / ${tasks.length}`}
                delta={null}
                deltaLabel=""
                hint={`共 ${tasks.length} 个任务`}
              >
                <RatioBar ratio={tasks.length > 0 ? tabCounts.enabled / tasks.length : 0} className="bg-sky-500 dark:bg-sky-400" />
              </DashboardTile>
              <DashboardTile
                stat={STAT_TILES[1]}
                value={initialLoading ? '—' : statValues.today}
                delta={showTodayDelta ? `${todayDelta > 0 ? '+' : ''}${todayDelta}` : null}
                deltaLabel="较昨日"
                hint={`近 7 天合计 ${trendTotal} 次`}
                actionLabel="查看"
                onAction={() => setActiveTab('recent')}
              >
                <TrendSparkline values={trendValues} stroke="stroke-violet-500 dark:stroke-violet-300" fill="fill-violet-500/15 dark:fill-violet-400/10" />
              </DashboardTile>
              <DashboardTile
                stat={STAT_TILES[2]}
                value={initialLoading || !hasRunData ? '—' : statValues.success}
                delta={null}
                deltaLabel=""
                hint={hasRunData ? '全部任务运行统计' : '暂无运行数据'}
              >
                <RateRing rate={dashboard?.stats.successRate ?? 0} invalid={!hasRunData || initialLoading} />
              </DashboardTile>
              <DashboardTile
                stat={STAT_TILES[3]}
                value={initialLoading ? '—' : String(tabCounts.failed)}
                delta={null}
                deltaLabel=""
                hint={tabCounts.failed > 0 ? '失败或最近出错的任务' : '当前没有异常任务'}
                actionLabel={tabCounts.failed > 0 ? '立即处理' : undefined}
                onAction={() => setActiveTab('failed')}
              >
                <RatioBar ratio={tasks.length > 0 ? tabCounts.failed / tasks.length : 0} className="bg-rose-500 dark:bg-rose-400" />
              </DashboardTile>
            </div>

            {/* Filters — row 1: search + sort + view toggle; row 2: category tabs */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm transition focus-within:border-[var(--agenthub-accent-border)] dark:border-white/10 dark:bg-neutral-950/40 dark:focus-within:border-[var(--agenthub-accent-border)]">
                  <Search className="size-3.5 shrink-0 text-slate-400" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="搜索任务名称、分类或描述"
                    className="h-7 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-neutral-950/40 dark:text-slate-300 dark:hover:border-white/20 dark:hover:text-slate-100">
                    <ArrowUpDown className="size-3.5 text-slate-400" />
                    {SORT_OPTIONS.find((option) => option.value === sortKey)?.label}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[150px]">
                    {SORT_OPTIONS.map((option) => (
                      <DropdownMenuItem
                        key={option.value}
                        onClick={() => setSortKey(option.value)}
                        className={cn(sortKey === option.value && 'text-[var(--agenthub-accent)]')}
                      >
                        {option.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex h-9 shrink-0 items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm dark:border-white/10 dark:bg-neutral-950/40" role="group" aria-label="视图切换">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    aria-label="网格视图"
                    title="网格视图"
                    className={cn(
                      'flex size-7 items-center justify-center rounded-lg transition',
                      viewMode === 'grid'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
                    )}
                  >
                    <LayoutGrid className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    aria-label="列表视图"
                    title="列表视图"
                    className={cn(
                      'flex size-7 items-center justify-center rounded-lg transition',
                      viewMode === 'list'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
                    )}
                  >
                    <List className="size-3.5" />
                  </button>
                </div>
              </div>
              <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {TABS.map((tab) => {
                  const active = activeTab === tab.id
                  const count = tabCounts[tab.id]
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition',
                        active
                          ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5',
                      )}
                    >
                      {tab.label}
                      <span
                        className={cn(
                          'inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                          active ? 'bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900' : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400',
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Automation list — grid or compact rows */}
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {displayTasks.map((task) => (
                  <AutomationCard
                    key={task.id}
                    task={task}
                    selected={selectedTask?.id === task.id}
                    favorite={favorites.has(task.id)}
                    onSelect={(id) => setSelectedTaskId((current) => (current === id ? null : id))}
                    onToggleFavorite={toggleFavorite}
                    onRun={(id) => void runAutomationAction('run', id)}
                    onEdit={(id) => openEditDialog(id)}
                    onDelete={(id) => void runAutomationAction('delete', id)}
                  />
                ))}
                {initialLoading && Array.from({ length: 6 }, (_, index) => (
                  <div key={index} className="min-h-[156px] rounded-2xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.02]" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {displayTasks.map((task) => (
                  <AutomationRow
                    key={task.id}
                    task={task}
                    selected={selectedTask?.id === task.id}
                    favorite={favorites.has(task.id)}
                    onSelect={(id) => setSelectedTaskId((current) => (current === id ? null : id))}
                    onToggleFavorite={toggleFavorite}
                    onRun={(id) => void runAutomationAction('run', id)}
                    onEdit={(id) => openEditDialog(id)}
                    onDelete={(id) => void runAutomationAction('delete', id)}
                  />
                ))}
                {initialLoading && Array.from({ length: 6 }, (_, index) => (
                  <div key={index} className="h-16 rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.02]" />
                ))}
              </div>
            )}
            {!initialLoading && displayTasks.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                {tasks.length === 0
                  ? '暂无自动化任务，点击「新建自动化」创建第一个任务。'
                  : searchQuery.trim()
                    ? '没有匹配搜索条件的任务。'
                    : '当前分类下没有任务。'}
              </div>
            )}

            {/* Bottom: Activity feed + Run overview + Upcoming (3-column dashboard row) */}
            <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1.05fr)_minmax(0,1.05fr)]">
              {/* ① 最近运行记录 */}
              <section className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-950/40">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">最近运行记录</h2>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{recentRuns.length} 条运行</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('recent')
                      setSortKey('recent')
                    }}
                    className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--agenthub-accent)] hover:underline"
                  >
                    查看全部
                    <ChevronRight className="size-3" />
                  </button>
                </div>
                <div className="mt-3 flex-1">
                  <ActivityRunList runs={recentRuns} nowMs={nowMs} />
                </div>
              </section>

              {/* ② 运行概览 */}
              <section className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-950/40">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">运行概览</h2>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">最近 {trendRange} 天运行趋势</p>
                  </div>
                  <select
                    value={trendRange}
                    onChange={(event) => changeTrendRange(Number(event.target.value) as AutomationTrendRange)}
                    aria-label="趋势时间范围"
                    className="h-7 cursor-pointer rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-white/20"
                  >
                    {AUTOMATION_TREND_RANGES.map((range) => (
                      <option key={range} value={range}>最近 {range} 天</option>
                    ))}
                  </select>
                </div>
                <div className="mt-3">
                  <TrendAreaChart
                    values={trend.map((p) => p.value)}
                    weekdayLabels={trend.map((p) => p.label)}
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">周期运行次数</div>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-lg font-semibold tabular-nums text-slate-950 dark:text-slate-50">{trendTotal}</span>
                      {showRunCountDelta ? (
                        <span className={cn('text-[10px]', runCountDelta > 0 ? 'text-emerald-500' : runCountDelta < 0 ? 'text-rose-500' : 'text-slate-400')}>
                          {runCountDelta > 0 ? `↑ ${runCountDelta}` : runCountDelta < 0 ? `↓ ${Math.abs(runCountDelta)}` : '持平'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">暂无数据</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">成功率</div>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-lg font-semibold tabular-nums text-slate-950 dark:text-slate-50">
                        {hasRunData ? `${dashboard?.stats.successRate ?? 0}%` : '—'}
                      </span>
                      {hasRunData ? (
                        <span className={cn('text-[10px]', successRateDelta > 0 ? 'text-emerald-500' : successRateDelta < 0 ? 'text-rose-500' : 'text-slate-400')}>
                          {successRateDelta > 0 ? `↑ ${successRateDelta}%` : successRateDelta < 0 ? `↓ ${Math.abs(successRateDelta)}%` : '持平'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">暂无数据</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">失败次数</div>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-lg font-semibold tabular-nums text-rose-600 dark:text-rose-300">{recentFailCount}</span>
                      {recentFailCount === 0 ? (
                        <span className="text-[10px] text-slate-400">运行正常</span>
                      ) : (
                        <span className={cn('text-[10px]', failCountDelta > 0 ? 'text-rose-500' : 'text-slate-400')}>
                          {failCountDelta > 0 ? `↑ ${failCountDelta}` : failCountDelta < 0 ? `↓ ${Math.abs(failCountDelta)}` : '较上周期持平'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* ③ 即将执行 */}
              <section className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-950/40">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">即将执行</h2>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">接下来将触发的任务</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('enabled')
                      setSortKey('next')
                    }}
                    className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--agenthub-accent)] hover:underline"
                  >
                    查看全部
                    <ChevronRight className="size-3" />
                  </button>
                </div>
                <div className="mt-3 flex-1">
                  <UpcomingList tasks={tasks} nowMs={nowMs} onSelect={(id) => setSelectedTaskId(id)} />
                </div>
                <button
                  type="button"
                  onClick={openCreateDialog}
                  className="mt-3 flex w-full items-center gap-2.5 rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-left transition hover:border-[var(--agenthub-accent-border)] hover:bg-[var(--agenthub-accent-soft)]/30 dark:border-white/10"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]">
                    <Plus className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-slate-900 dark:text-slate-100">创建更多自动化</span>
                    <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">使用 Agent 智能助手自动训练任务，让工作更轻松</span>
                  </span>
                  <ChevronRight className="size-3.5 shrink-0 text-slate-400" />
                </button>
              </section>
            </div>

          </div>
        </ScrollArea>
      </section>

      {/* Task detail — opens as a centered dialog when a card is clicked */}
      {selectedTask && (
        <DetailPanel
          task={selectedTask}
          onClose={() => setSelectedTaskId(null)}
          onEdit={() => openEditDialog()}
          onRun={() => void runAutomationAction('run')}
          onTogglePause={() => void runAutomationAction(selectedTask.rawStatus === 'enabled' || selectedTask.rawStatus === 'running' ? 'disable' : 'enable')}
          onDelete={() => void runAutomationAction('delete')}
          onCopy={() => void copyTaskPrompt(selectedTask)}
          onToggleFavorite={() => toggleFavorite(selectedTask.id)}
          onOpenConversation={onOpenConversation}
          favorite={favorites.has(selectedTask.id)}
          runHistory={runHistory}
          runHistoryLoading={runHistoryLoading}
          runsError={runsError}
          busyAction={actionLoading}
          nowMs={nowMs}
        />
      )}

      <TaskFormDialog
        open={dialogMode !== null}
        mode={dialogMode === 'edit' ? 'edit' : 'create'}
        form={form}
        onFormChange={(patch) => setForm((draft) => ({ ...draft, ...patch }))}
        agents={agents}
        conversations={conversations}
        submitting={submitting}
        promptFilling={promptFilling}
        dialogError={dialogError}
        onDismissError={() => setDialogError(null)}
        onEnhancePrompt={() => void handleEnhanceAutomationPrompt()}
        onSave={() => void handleSaveAutomation()}
        onClose={() => {
          setDialogMode(null)
          setDialogError(null)
        }}
      />
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
