'use client'

import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * 统一加载指示器。
 *
 * 为什么要有这个组件：项目里散落着大量 `Loader2 + animate-spin` 和
 * 「宽度固定 50% + animate-pulse」的进度条。后者只做透明度呼吸，宽度永远不变，
 * 用户看到的是「进度条卡在一半」—— 观感上就是「加载动画不动」。
 *
 * 三种形态：
 *  - spinner：自转弧线，适合按钮内、行内、卡片角标
 *  - bar：不确定性进度条（滑块来回跑），适合"不知道要多久"的等待态
 *  - both：弧线 + 进度条 + 文案，适合整块区域的加载占位
 */

export type LoadingIndicatorVariant = 'spinner' | 'bar' | 'both'
export type LoadingIndicatorSize = 'xs' | 'sm' | 'md' | 'lg'

const SPINNER_SIZE: Record<LoadingIndicatorSize, string> = {
  xs: 'size-3',
  sm: 'size-3.5',
  md: 'size-5',
  lg: 'size-8',
}

const STROKE_WIDTH: Record<LoadingIndicatorSize, number> = {
  xs: 2.5,
  sm: 2.5,
  md: 2.5,
  lg: 2,
}

const BAR_WIDTH: Record<LoadingIndicatorSize, string> = {
  xs: 'w-16',
  sm: 'w-24',
  md: 'w-40',
  lg: 'w-48',
}

const BAR_HEIGHT: Record<LoadingIndicatorSize, string> = {
  xs: 'h-1',
  sm: 'h-1',
  md: 'h-1.5',
  lg: 'h-1.5',
}

interface LoadingIndicatorProps {
  variant?: LoadingIndicatorVariant
  size?: LoadingIndicatorSize
  /** 主文案，如「AI 正在设计团队结构…」 */
  label?: string
  /** 次要说明，如「分析目标、匹配角色、生成提示词」 */
  hint?: string
  /** 用当前文字颜色给弧线着色（按钮内常用） */
  inheritColor?: boolean
  className?: string
  barClassName?: string
}

export function LoadingIndicator({
  variant = 'both',
  size = 'md',
  label,
  hint,
  inheritColor = false,
  className,
  barClassName,
}: LoadingIndicatorProps) {
  const showSpinner = variant === 'spinner' || variant === 'both'
  const showBar = variant === 'bar' || variant === 'both'

  const spinner = showSpinner ? (
    <Loader2
      className={cn('agenthub-orbit shrink-0', SPINNER_SIZE[size], !inheritColor && 'text-primary/70')}
      strokeWidth={STROKE_WIDTH[size]}
      aria-hidden
    />
  ) : null

  const bar = showBar ? (
    <div
      role="progressbar"
      aria-label={label ?? '加载中'}
      aria-valuetext={label}
      className={cn(
        'relative overflow-hidden rounded-full bg-muted',
        BAR_WIDTH[size],
        BAR_HEIGHT[size],
        barClassName,
      )}
    >
      <div className="agenthub-indeterminate-bar absolute inset-y-0 rounded-full bg-primary" />
    </div>
  ) : null

  // 只有 spinner / 只有 bar 时保持行内紧凑；
  // both 且带文案时按块级居中排布。
  if (variant === 'spinner') {
    return <span className={cn('inline-flex items-center', className)}>{spinner}</span>
  }

  if (variant === 'bar') {
    return <div className={cn('w-full', className)}>{bar}</div>
  }

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      {spinner}
      {label && <div className="text-sm font-medium">{label}</div>}
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      {bar}
    </div>
  )
}
