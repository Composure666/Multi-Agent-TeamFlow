'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef, type ReactNode, type WheelEvent } from 'react'

import { cn } from '@/lib/utils'

export function HorizontalScrollControls({ children, className, contentClassName, scrollAmount = 280 }: { children: ReactNode; className?: string; contentClassName?: string; scrollAmount?: number }) {
  const scrollRef = useRef<HTMLDivElement>(null)

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

  const buttonClassName = 'absolute top-1/2 z-10 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 shadow-sm backdrop-blur transition hover:border-slate-300 hover:bg-white hover:text-slate-900 group-hover:flex dark:border-white/10 dark:bg-neutral-900/90 dark:text-slate-400 dark:hover:bg-neutral-900 dark:hover:text-slate-100'

  return (
    <div className={cn('group relative', className)}>
      <button type="button" aria-label="向左滚动" onClick={() => scrollByAmount(-scrollAmount)} className={cn(buttonClassName, 'left-0')}><ChevronLeft className="size-4" /></button>
      <div ref={scrollRef} onWheel={handleWheel} className={cn('agenthub-hide-scrollbar flex overflow-x-auto overscroll-x-contain scroll-smooth px-10 touch-pan-x', contentClassName)}>{children}</div>
      <button type="button" aria-label="向右滚动" onClick={() => scrollByAmount(scrollAmount)} className={cn(buttonClassName, 'right-0')}><ChevronRight className="size-4" /></button>
    </div>
  )
}
