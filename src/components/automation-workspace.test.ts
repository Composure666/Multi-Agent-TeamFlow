import { describe, expect, it } from 'vitest'

import { computeTodayRunDelta, formatSyncTime } from './automation-workspace'

describe('automation workspace same-time delta', () => {
  it('compares today against yesterday at the same time of day, not the full day', () => {
    // 白天：今天至今 3 次，昨日同时段 8 次（昨日全天 20 次）；旧口径拿今天减完整昨天会算出 -17
    expect(computeTodayRunDelta(3, 8)).toEqual({ delta: -5, show: true })
  })

  it('shows a positive delta when today is ahead of yesterday at the same time', () => {
    expect(computeTodayRunDelta(12, 8)).toEqual({ delta: 4, show: true })
  })

  it('hides the delta when neither today nor yesterday-same-time has runs', () => {
    expect(computeTodayRunDelta(0, 0)).toEqual({ delta: 0, show: false })
  })

  it('shows the delta when only yesterday-same-time has runs', () => {
    expect(computeTodayRunDelta(0, 5)).toEqual({ delta: -5, show: true })
  })
})

describe('automation workspace sync time', () => {
  it('shows month-day and clock once synced more than 24 hours ago', () => {
    const syncedAt = new Date(2026, 10, 19, 14, 32).getTime()
    const nowMs = syncedAt + 26 * 60 * 60 * 1000
    expect(formatSyncTime(syncedAt, nowMs)).toBe('11-19 14:32 同步')
  })

  it('still shows relative hours within 24 hours', () => {
    const syncedAt = new Date(2026, 10, 20, 10, 0).getTime()
    const nowMs = syncedAt + 5 * 60 * 60 * 1000
    expect(formatSyncTime(syncedAt, nowMs)).toBe('5 小时前同步')
  })

  it('reports never-synced state', () => {
    expect(formatSyncTime(null, Date.now())).toBe('尚未同步')
  })
})
