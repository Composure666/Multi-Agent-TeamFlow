'use client'

import { useEffect } from 'react'

import { StreamEventBuffer } from '@/components/stream-event-buffer'
import type { StreamEvent } from '@/shared/types'
import { useAppStore } from '@/stores/app-store'

let activeSource: EventSource | null = null
let activeBuffer: StreamEventBuffer | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null
let refCount = 0

const STREAM_FLUSH_MS = 60

export function StreamProvider({ children }: { children: React.ReactNode }) {
  const applyEvent = useAppStore((s) => s.applyEvent)
  const setStreamConnected = useAppStore((s) => s.setStreamConnected)

  useEffect(() => {
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
  }, [applyEvent, setStreamConnected])

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
