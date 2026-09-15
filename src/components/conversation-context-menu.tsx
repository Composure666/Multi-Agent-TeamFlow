'use client'

import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * 轻量右键菜单 —— 跟随鼠标坐标弹出。
 *
 * 为什么自绘而不是用组件库的 DropdownMenu：右键菜单的锚点是「鼠标位置」而不是某个
 * 触发元素，而且要在任意列表项 / 卡片 / 消息气泡上复用。自绘只有不到百行，比为了一个
 * 坐标锚点去改组件库的受控 open 逻辑更可控。
 *
 * 交互细节（都是踩过的坑）：
 *  - 位置贴边时夹回视口内 —— 否则在右下角右键会弹到屏幕外，看起来像「点了没反应」；
 *  - mousedown 用捕获阶段监听，但点在菜单内部不关 —— 否则菜单会在 click 之前被卸载，
 *    菜单项永远点不动；
 *  - 滚动 / 缩放 / 失焦一律关闭 —— 菜单是 fixed 定位，页面一动它就会错位。
 */

export interface ContextMenuItem {
  key: string
  label: string
  icon?: ReactNode
  /** 危险操作（删除）用红色文字 */
  tone?: 'default' | 'danger'
  disabled?: boolean
  onSelect: () => void
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
  label = '操作菜单',
}: {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
  label?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const { width, height } = element.getBoundingClientRect()
    const margin = 8
    setPos({
      x: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
      y: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
    })
  }, [x, y, items.length])

  useEffect(() => {
    const insideMenu = (target: EventTarget | null) =>
      target instanceof Node && Boolean(ref.current?.contains(target))
    const onPointerDown = (event: Event) => {
      if (insideMenu(event.target)) return
      onClose()
    }
    const onContextMenu = (event: Event) => {
      if (insideMenu(event.target)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    const close = () => onClose()

    document.addEventListener('mousedown', onPointerDown, true)
    document.addEventListener('contextmenu', onContextMenu, true)
    document.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('contextmenu', onContextMenu, true)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-50 min-w-44 overflow-hidden rounded-md border bg-popover p-1 text-xs text-popover-foreground shadow-md"
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={(event) => {
            event.stopPropagation()
            onClose()
            item.onSelect()
          }}
          className={cn(
            'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40',
            item.tone === 'danger'
              ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40'
              : 'hover:bg-accent hover:text-accent-foreground',
          )}
        >
          {item.icon}
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  )
}
