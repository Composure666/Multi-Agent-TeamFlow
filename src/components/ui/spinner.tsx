'use client'

import { cn } from '@/lib/utils'

/**
 * 统一 Loading Spinner —— 全站唯一加载动画样式。
 *
 * 为什么不用 lucide 的 Loader2:它的缺口只有约 30°,绕自身中心旋转时
 * 视觉上几乎无变化,用户看到的就是一个"静态圆环图标"。
 * 这里用 SVG 圆环 + 270° 可见弧(90° 明显缺口),旋转时缺口扫过一圈,
 * 一眼能看出"正在处理中"。
 *
 * 动画走 `.agenthub-spinner`(globals.css):0.8s/圈 顺时针匀速,
 * 只动 transform,不触发重排;prefers-reduced-motion 时停转但保持可见。
 *
 * 颜色默认取主题蓝 `text-primary`,可用 className 覆盖(如运行状态条内)。
 */

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg'

const SPINNER_SIZE: Record<SpinnerSize, string> = {
  xs: 'size-3',
  sm: 'size-3.5',
  md: 'size-5',
  lg: 'size-8',
}

// viewBox 24,r=10,周长≈62.8;270° 弧 + 90° 缺口,线帽圆头补一点弧长避免缺口显尖
const STROKE_WIDTH: Record<SpinnerSize, number> = {
  xs: 3,
  sm: 3,
  md: 2.5,
  lg: 2,
}

interface SpinnerProps {
  size?: SpinnerSize
  /** 用当前文字颜色着色(按钮内、彩色状态条内常用);默认主题蓝 */
  inheritColor?: boolean
  className?: string
}

export function Spinner({ size = 'md', inheritColor = false, className }: SpinnerProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="加载中"
      className={cn(
        'agenthub-spinner shrink-0',
        SPINNER_SIZE[size],
        !inheritColor && 'text-primary',
        className,
      )}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH[size]}
        strokeLinecap="round"
        strokeDasharray="47.1 15.7"
      />
    </svg>
  )
}
