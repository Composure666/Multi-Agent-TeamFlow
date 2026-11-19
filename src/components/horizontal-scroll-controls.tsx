'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode, type WheelEvent } from 'react'

import { cn } from '@/lib/utils'

export function HorizontalScrollControls({ children, className, contentClassName, scrollAmount = 280 }: { children: ReactNode; className?: string; contentClassName?: string; scrollAmount?: number }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLeft, setShowLeft] = useState(false)
  const [showRight, setShowRight] = useState(false)

  const updateOverflowState = () => {
    const el = scrollRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    if (max <= 1) { setShowLeft(false); setShowRight(false); return }
    setShowLeft(el.scrollLeft > 2)
    setShowRight(el.scrollLeft < max - 2)
  }

  useEffect(() => {
    updateOverflowState()
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(updateOverflowState)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children])

  const scrollByAmount = (left: number) => {
    scrollRef.current?.scrollBy({ left, behavior: 'smooth' })
  }

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    const element = scrollRef.current
    if (!element || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return

    const maxScrollLeft = element.scrollWidth - element.clientWidth
    if (maxScrollLeft <= 0) return

    const atStart = element.scrollLeft <= 0
    const atEnd = element.scrollLeft >= maxScrollLeft - 1
    const canScroll = (event.deltaY < 0 && !atStart) || (event.deltaY > 0 && !atEnd)
    if (!canScroll) return

    event.stopPropagation()
    element.scrollBy({ left: event.deltaY, behavior: 'smooth' })
  }

  // F4：箭头显隐只由该方向是否有可滚内容决定（showLeft/showRight），不依赖 hover——
  // 触屏与桌面行为一致：有内容可滚就常显、可点，无内容就隐藏。旧写法 `hidden … group-hover:flex`
  // 配 `showLeft && 'flex'` 经 tailwind-merge 后 `hidden` 已被 `flex` 顶掉，实际早就是常显，
  // 这里只是把行为写明，不再靠合并副作用。
  const buttonClassName = 'absolute top-1/2 z-10 size-8 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)]/90 text-slate-500 shadow-sm backdrop-blur transition hover:border-slate-300 hover:bg-[var(--agenthub-surface)] hover:text-slate-900 dark:border-[var(--agenthub-border)] dark:bg-white/[0.06] dark:text-slate-400 dark:hover:bg-white/[0.12] dark:hover:text-slate-100 dark:hover:border-white/20'

  return (
    <div className={cn('group relative', className)}>
      <button type="button" aria-label="向左滚动" onClick={() => scrollByAmount(-scrollAmount)} className={cn(buttonClassName, 'left-0', showLeft ? 'flex' : 'hidden')}><ChevronLeft className="size-4" /></button>
      {/* 边缘渐变蒙版：让"还有内容可滚"更明确；dark 下跟随 surface 变量，避免与深色卡片背景脱节 */}
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 left-8 z-[5] w-10 bg-gradient-to-r from-[var(--agenthub-surface)] to-transparent transition-opacity duration-200 dark:from-[var(--agenthub-surface,#1C1F26)] dark:to-transparent',
          showLeft ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 right-8 z-[5] w-10 bg-gradient-to-l from-[var(--agenthub-surface)] to-transparent transition-opacity duration-200 dark:from-[var(--agenthub-surface,#1C1F26)] dark:to-transparent',
          showRight ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div ref={scrollRef} onWheel={handleWheel} onScroll={updateOverflowState} className={cn('agenthub-hide-scrollbar flex overflow-x-auto overscroll-x-contain scroll-smooth px-10 touch-pan-x', contentClassName)}>{children}</div>
      <button type="button" aria-label="向右滚动" onClick={() => scrollByAmount(scrollAmount)} className={cn(buttonClassName, 'right-0', showRight ? 'flex' : 'hidden')}><ChevronRight className="size-4" /></button>
    </div>
  )
}
