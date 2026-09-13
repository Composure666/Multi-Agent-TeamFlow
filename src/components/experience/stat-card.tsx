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
  iconBg = 'bg-blue-500/10',
  iconColor = 'text-blue-500',
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

  return (
    <div className={cn('flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm', className)}>
      <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', iconBg)}>
        <Icon className={cn('size-5', iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-semibold tabular-nums">{value}</span>
          {sparkline ? (
            <Sparkline data={sparkline} />
          ) : (
            <span className={cn('text-[11px] tabular-nums', trendColor)}>{trendArrow}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null
  const w = 60
  const h = 24
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
        className="text-blue-400"
      />
    </svg>
  )
}
