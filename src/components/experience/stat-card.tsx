'use client'

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: number | string
  trend?: number // 正数=上升(绿), 负数=下降(红), undefined=无
  iconBg?: string
  iconColor?: string
  sparkline?: number[] // 迷你折线图数据
  className?: string
}

export function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  iconBg = 'bg-[var(--agenthub-accent-soft)]',
  iconColor = 'text-[var(--agenthub-accent)]',
  sparkline,
  className,
}: StatCardProps) {
  const trendColor = trend === undefined
    ? 'text-muted-foreground'
    : trend > 0
      ? 'text-emerald-500'
      : trend < 0
        ? 'text-red-500'
        : 'text-muted-foreground'
  const trendArrow = trend === undefined ? '—' : trend > 0 ? `↑ ${Math.abs(trend)}%` : trend < 0 ? `↓ ${Math.abs(trend)}%` : '—'

  // W1（batch4-leftovers §5）：卡片改两行式——首行图标+标签、次行值+趋势/迷你图。
  // 根因是旧横排里文字列在 1366 下仅 42px（图标 40 + 间距 + 内边距吃掉卡宽），
  // 「累计使用」标签与「25 次」值必然折行，60px 迷你图更顶出卡片 34px、主列溢出 9px。
  // 两行式让值行独占卡内宽（1366 下 109px），值 nowrap + 行可折行兜底大数值，迷你图缩到 44px。
  return (
    <div className={cn('agenthub-card flex flex-col gap-2 px-3 py-3', className)}>
      <div className="flex min-w-0 items-center gap-2">
        <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', iconBg)}>
          <Icon className={cn('size-4', iconColor)} />
        </div>
        <div className="min-w-0 whitespace-nowrap text-sm text-muted-foreground">{label}</div>
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className="whitespace-nowrap text-xl font-semibold tabular-nums">{value}</span>
        {sparkline ? (
          <Sparkline data={sparkline} />
        ) : (
          <span className={cn('whitespace-nowrap text-xs tabular-nums', trendColor)}>{trendArrow}</span>
        )}
      </div>
    </div>
  )
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null
  const w = 44
  const h = 20
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-[var(--agenthub-accent)]"
      />
    </svg>
  )
}
