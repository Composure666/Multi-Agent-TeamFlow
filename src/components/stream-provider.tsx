'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

import { StreamEventBuffer } from '@/components/stream-event-buffer'
import type { StreamEvent } from '@/shared/types'
import { useAppStore } from '@/stores/app-store'

let activeSource: EventSource | null = null
let activeBuffer: StreamEventBuffer | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null
let refCount = 0

const STREAM_FLUSH_MS = 60

/**
 * 需要实时流的路由 —— 目前只有工作台首页 `/`。
 *
 * 为什么必须显式列白名单：`/home` 是**免鉴权**的公开落地页，而 `/api/stream` 在 Basic
 * 鉴权后面。访客浏览器一旦去连它，就会拿到 401 + `WWW-Authenticate`，Chrome 随即弹出
 * **原生 Basic 登录框**；那是个模态窗口，会把整页的鼠标 / 键盘 / 滚轮事件全部吞掉 ——
 * 落地页的表现就是「点什么都没反应」，而控制台与网络面板都干干净净（鉴权挑战在网络层
 * 就被拦下，连 response 事件都不会产生），极难往这个方向想。
 *
 * 用白名单而不是「排除公开页」的黑名单：将来新增任何公开路由时，默认行为就是「不连流」，
 * 不会静默踩同一个坑。
 */
const STREAM_ROUTES = new Set(['/'])

export function StreamProvider({ children }: { children: React.ReactNode }) {
  const applyEvent = useAppStore((s) => s.applyEvent)
  const setStreamConnected = useAppStore((s) => s.setStreamConnected)
  const pathname = usePathname()
  const enabled = STREAM_ROUTES.has(pathname)

  useEffect(() => {
    // 非工作台路由（公开访客面）既不建连、也不参与引用计数
    if (!enabled) return

    refCount++

    if (!activeSource) {
      activeBuffer = new StreamEventBuffer(applyEvent)
      activeSource = new EventSource('/api/stream')

      activeSource.onopen = () => {
        setStreamConnected(true)
      }

      activeSource.onerror = () => {
        flushBufferedEvents()
        setStreamConnected(false)
      }

      activeSource.onmessage = (e) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(e.data)
        } catch {
          return
        }
        if (!parsed || typeof parsed !== 'object') return

        const obj = parsed as { type?: string }
        if (obj.type === 'connected') {
          setStreamConnected(true)
          return
        }

        activeBuffer?.push(parsed as StreamEvent)
        scheduleBufferedFlush()
      }
    }

    return () => {
      refCount--
      if (refCount <= 0) {
        activeSource?.close()
        flushBufferedEvents()
        activeSource = null
        activeBuffer = null
        refCount = 0
        setStreamConnected(false)
      }
    }
  }, [enabled, applyEvent, setStreamConnected])

  return <>{children}</>
}

function scheduleBufferedFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    activeBuffer?.flush()
  }, STREAM_FLUSH_MS)
}

function flushBufferedEvents(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  activeBuffer?.flush()
}
