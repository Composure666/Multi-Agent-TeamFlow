'use client'

import { animate, motion, MotionConfig, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * 首页分区滚动入场：轻微上移 + 淡入，只播一次，0.4s（不超过 500ms 上限）。
 * MotionConfig reducedMotion="user" 让系统开减少动效时直接显示终态。
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-64px' }}
        transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  )
}

/** 数字滚动：进入视口时从 0 数到目标值（0.9s，868 滚动不显仓促）；reduced-motion 时直接显示终值。 */
export function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const reduceMotion = useReducedMotion()
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!inView) return
    if (reduceMotion) {
      setDisplay(value)
      return
    }
    const controls = animate(0, value, {
      duration: 0.9,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [inView, reduceMotion, value])

  return <span ref={ref}>{display}</span>
}
