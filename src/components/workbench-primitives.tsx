import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronRight, Inbox, Loader2, TrendingUp, type LucideIcon } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'

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
  /** 仅运行调试板用：收紧卡片 padding 与行间距（P0 间距收紧），其他调用处保持默认 */
  compact = false,
}: {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  actions?: ReactNode
  /** 标题行上方：面包屑等导航行（运行调试板页头用） */
  breadcrumb?: ReactNode
  /** 标题行下方：元信息行（运行调试板页头用） */
  meta?: ReactNode
  compact?: boolean
}) {
  return (
    <PageCard className={compact ? 'p-3 sm:px-4 sm:py-3' : 'p-3 sm:p-5'}>
      {/* 移动端标题行与 actions 同行、超宽时 actions 自动换行（B4）：
          标题块 basis 180px 是可读底线——actions 再宽也不把标题压成 "A…"；
          actions 小时同行紧凑（卡片约 87px），超宽时换到第二行、标题独占整行，
          桌面端（sm+）与原来完全一致。 */}
      <div className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 grow basis-[180px] items-start gap-3">
          {Icon != null && (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] sm:size-10">
              <Icon className="size-4 text-[var(--agenthub-accent)] sm:size-5" />
            </div>
          )}
          <div className="min-w-0">
            {breadcrumb != null && <div className={compact ? 'mb-0.5' : 'mb-1'}>{breadcrumb}</div>}
            <div className="font-heading truncate text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
              {title}
            </div>
            {description != null && (
              <p className={cn(compact ? 'mt-0.5' : 'mt-0.5 sm:mt-1', 'line-clamp-2 text-sm leading-6 text-slate-500 dark:text-slate-400 sm:line-clamp-none')}>{description}</p>
            )}
            {meta != null && <div className={compact ? 'mt-0.5' : 'mt-1'}>{meta}</div>}
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
  compact = false,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  /** 紧凑变体：无卡片外框、纵向内边距更小，供卡片内嵌的空态（原 PanelEmpty/MiniEmpty/EmptyHint）使用 */
  compact?: boolean
}) {
  if (compact) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <div className="flex size-8 items-center justify-center rounded-full bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]">
          <Icon className="size-4" />
        </div>
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
        {description && <p className="max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>}
        {action && (
          <Button type="button" variant="outline" size="sm" className="mt-1" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    )
  }
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

export type KpiTone = 'sky' | 'blue' | 'violet' | 'purple' | 'emerald' | 'amber' | 'rose'

/** 三页的趋势语义各不相同，调用方按原语义传，组件只负责渲染：
 * row 是数据概览的真实环比（value 为 null 时只渲染 caption，不伪装成 +0%）；
 * badge 是能力中心的静态徽章（value 为 0 渲染 "—"，不代表时间变化）；
 * delta 是自动化的今日增量（text 为 null 时不渲染，label 出现在底部右侧）。 */
export type KpiTrend =
  | { kind: 'row'; value: number | null; text?: string; caption: string }
  | { kind: 'badge'; value: number }
  | { kind: 'delta'; text: string | null; label: string }

export type KpiCardProps = {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
  tone: KpiTone
  /** 值字号档：'28' = text-[28px]（数据概览/能力中心），'xl' = text-xl（自动化） */
  valueSize?: '28' | 'xl'
  /** 值字重：数据概览/自动化 semibold，能力中心 bold */
  valueWeight?: 'semibold' | 'bold'
  /** 图标块尺寸：sm = size-7（能力中心）、md = size-8（自动化）、lg = size-9（数据概览） */
  iconSize?: 'sm' | 'md' | 'lg'
  /** 图标块配色：tint = tone-50 底（数据概览/能力中心）、white = 白底（自动化） */
  chip?: 'tint' | 'white'
  /** 标签行类名：三页的标签颜色各不相同（数据概览无 dark 变体），调用方按原样传 */
  labelClassName: string
  /** 值类名：三页的值颜色各不相同（数据概览无 dark 变体），调用方按原样传 */
  valueClassName: string
  trend?: KpiTrend
  /** 右侧火花线（数据概览）：窄屏隐藏；color 由调用方按 tone 换算 */
  sparkline?: { data: number[]; color: string }
  /** 中部可视化（自动化：RatioBar / TrendSparkline / RateRing） */
  visual?: ReactNode
  /** 值下方的小字说明（能力中心 caption） */
  caption?: string
  /** 底部提示行（数据概览 subCaption / 自动化 hint） */
  hint?: string
  /** 右上角操作按钮（自动化）：每卡最多一个 */
  action?: { label: string; onClick: () => void }
  /** 卡片级附加类：能力中心传 h-[140px] 固定高 */
  className?: string
  /** 值与标签同块并排在图标右侧（自动化）；默认标签在顶行、值在下一行 */
  valueBesideIcon?: boolean
  /** 卡片底色跟 tone 走（自动化）；默认无底色 */
  tintBackground?: boolean
}

// 图标块 tone-50 底 + tone 文字（紫/玫红沿用原文件缺 dark 变体的写法，不顺手补）
const KPI_TONE_TINT: Record<KpiTone, string> = {
  sky: 'bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400',
  blue: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400',
  violet: 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400',
  purple: 'bg-purple-50 text-purple-600',
  emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400',
  rose: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600',
}

// 自动化图标块：白底 + tone-700 文字，图标本身再用 tone-600（原 TONE_CLASS.chip/text）
const KPI_TONE_WHITE: Record<KpiTone, { chip: string; icon: string }> = {
  sky: { chip: 'bg-white/80 text-sky-700 dark:text-sky-300', icon: 'text-sky-600 dark:text-sky-300' },
  blue: { chip: 'bg-white/80 text-blue-700 dark:text-blue-300', icon: 'text-blue-600 dark:text-blue-300' },
  violet: { chip: 'bg-white/80 text-violet-700 dark:text-violet-300', icon: 'text-violet-600 dark:text-violet-300' },
  purple: { chip: 'bg-white/80 text-purple-700 dark:text-purple-300', icon: 'text-purple-600 dark:text-purple-300' },
  emerald: { chip: 'bg-white/80 text-emerald-700 dark:text-emerald-300', icon: 'text-emerald-600 dark:text-emerald-300' },
  amber: { chip: 'bg-white/80 text-amber-700 dark:text-amber-300', icon: 'text-amber-600 dark:text-amber-300' },
  rose: { chip: 'bg-white/80 text-rose-700 dark:text-rose-300', icon: 'text-rose-600 dark:text-rose-300' },
}

// 卡片 tone 底色（自动化原 TONE_CLASS.wrap）
const KPI_TONE_BG: Record<KpiTone, string> = {
  sky: 'bg-sky-50 dark:bg-sky-500/10',
  blue: 'bg-blue-50 dark:bg-blue-500/10',
  violet: 'bg-violet-50 dark:bg-violet-500/10',
  purple: 'bg-purple-50 dark:bg-purple-500/10',
  emerald: 'bg-emerald-50 dark:bg-emerald-500/10',
  amber: 'bg-amber-50 dark:bg-amber-500/10',
  rose: 'bg-rose-50 dark:bg-rose-500/10',
}

const KPI_ICON_SIZE = {
  sm: { chip: 'size-7 rounded-lg', icon: 'size-3.5', gap: 'gap-2' },
  md: { chip: 'size-8 rounded-xl', icon: 'size-4', gap: 'gap-2' },
  lg: { chip: 'size-9 rounded-lg', icon: 'size-4', gap: 'gap-2.5' },
} as const

function KpiTrendBadge({ value }: { value: number }) {
  const trendUp = value > 0
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
        —
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold',
        trendUp ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400',
      )}
    >
      {trendUp ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {trendUp ? `+${value}` : value}
      {Math.abs(value) > 0 ? '%' : ''}
    </span>
  )
}

function KpiDelta({ text }: { text: string }) {
  const negative = text.startsWith('-')
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', negative ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
      <TrendingUp className={cn('size-3', negative && 'rotate-180')} />
      {text}
    </span>
  )
}

// 数据概览原 Sparkline：80×32 面积线，颜色由调用方按 tone 换算后传入
function KpiSparkline({ data, color }: { data: number[]; color: string }) {
  const w = 80, h = 32
  const max = Math.max(...data, 1), min = Math.min(...data, 0), range = max - min || 1
  const pts = data.map((v, i) => `${data.length > 1 ? (i / (data.length - 1)) * w : 0},${h - ((v - min) / range) * (h - 4) - 2}`)
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`).join(' ')
  const areaD = `${pathD} L${w},${h} L0,${h} Z`
  const gid = `sp-${color.replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style={{ stopColor: color }} stopOpacity="0.2" /><stop offset="100%" style={{ stopColor: color }} stopOpacity="0" /></linearGradient></defs>
      <path d={areaD} fill={`url(#${gid})`} />
      <path d={pathD} fill="none" style={{ stroke: color }} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// 共享 KPI 卡（U-P1-4）：三页原来各写一套，这里只收敛结构，视觉档位仍由 props 指定，迁移前后外观不变
export function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
  valueSize = '28',
  valueWeight = 'semibold',
  iconSize = 'lg',
  chip = 'tint',
  labelClassName,
  valueClassName,
  trend,
  sparkline,
  visual,
  caption,
  hint,
  action,
  className,
  valueBesideIcon = false,
  tintBackground = false,
}: KpiCardProps) {
  const size = KPI_ICON_SIZE[iconSize]
  const chipClass = chip === 'white' ? KPI_TONE_WHITE[tone].chip : KPI_TONE_TINT[tone]
  const chipIconClass = chip === 'white' ? KPI_TONE_WHITE[tone].icon : undefined
  const valueClasses = cn(
    valueSize === '28' ? 'truncate text-[28px] leading-none tracking-tight' : 'text-xl tracking-tight tabular-nums',
    valueWeight === 'bold' ? 'font-bold' : 'font-semibold',
    valueClassName,
  )
  // 行内趋势（徽章 / 增量）：跟在值后面；环比行在值下方单独渲染
  const inlineTrend =
    trend?.kind === 'badge' ? <KpiTrendBadge value={trend.value} />
    : trend?.kind === 'delta' && trend.text != null ? <KpiDelta text={trend.text} />
    : null
  const actionButton = action != null && (
    <button
      type="button"
      onClick={action.onClick}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-[var(--agenthub-surface)] hover:text-[var(--agenthub-accent)] dark:text-slate-200 dark:hover:bg-white/10"
    >
      {action.label}
      <ChevronRight className="size-3" />
    </button>
  )

  if (valueBesideIcon) {
    return (
      <article className={cn('agenthub-card group relative flex min-h-[128px] flex-col gap-3 p-4', tintBackground && KPI_TONE_BG[tone], className)}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className={cn('flex shrink-0 items-center justify-center', size.chip, chipClass)}>
              <Icon className={cn(size.icon, chipIconClass)} />
            </div>
            <div className="min-w-0">
              <div className={labelClassName}>{label}</div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className={valueClasses}>{value}</span>
                {inlineTrend}
              </div>
            </div>
          </div>
          {actionButton}
        </div>
        {visual}
        <div className="mt-auto flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>{hint}</span>
          {trend?.kind === 'delta' && trend.text != null && (
            <span className="font-medium text-slate-600 dark:text-slate-300">{trend.label}</span>
          )}
        </div>
      </article>
    )
  }

  return (
    <article className={cn('agenthub-card p-5', className)}>
      {/* 能力中心固定高卡片靠这层 flex-1 + justify-between 把值块推到底部；高度自适应的卡片里它不占额外空间 */}
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="flex items-center justify-between">
          <div className={cn('flex items-center', size.gap)}>
            <div className={cn('flex items-center justify-center', size.chip, chipClass)}>
              <Icon className={cn(size.icon, chipIconClass)} />
            </div>
            <span className={labelClassName}>{label}</span>
          </div>
          {actionButton}
        </div>
        <div className="mt-3.5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            {inlineTrend != null ? (
              <div className="flex items-baseline gap-2">
                <span className={cn(valueClasses, 'min-w-0')}>{value}</span>
                {inlineTrend}
              </div>
            ) : (
              <div className={valueClasses}>{value}</div>
            )}
            {trend?.kind === 'row' ? (
              trend.value === null ? (
                <div className="mt-2 text-sm text-slate-400">{trend.caption}</div>
              ) : (
                <div className={cn('mt-2 flex items-center gap-1 text-sm font-medium', trend.value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400')}>
                  <TrendingUp className={cn('size-3.5', trend.value < 0 && 'rotate-180')} />
                  <span>{trend.text}</span>
                  <span className="ml-1 font-normal text-slate-400">{trend.caption}</span>
                </div>
              )
            ) : caption != null ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{caption}</p>
            ) : null}
          </div>
          {sparkline != null && (
            <div className="hidden shrink-0 sm:block">
              <KpiSparkline data={sparkline.data} color={sparkline.color} />
            </div>
          )}
        </div>
      </div>
      {hint != null && <div className="mt-3 text-xs text-slate-400">{hint}</div>}
    </article>
  )
}
