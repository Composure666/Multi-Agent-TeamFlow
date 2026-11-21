import { describe, expect, it } from 'vitest'

import type { NotificationCategoryCounts } from '@/server/notification-service'
import type { AppNotification, AppNotificationCategory } from '@/shared/types'

import {
  appendNotificationPage,
  countForFilterWithCounts,
  formatRelativeTime,
  resolveLevel,
  resolveNotificationCategoryLabel,
  resolveNotificationSourceIcon,
  resolveNotificationSourceIconLabel,
  resolveNotificationSourceLabel,
} from './information-center-workspace'

const DAY_MS = 24 * 60 * 60 * 1000

function notification(id: string, overrides: Partial<AppNotification> = {}): AppNotification {
  return { id, title: id, level: 'info', source: 'system', createdAt: 1, ...overrides }
}

describe('formatRelativeTime', () => {
  it('shows 28 and 29 days ago as 4 weeks ago, never 0 months ago', () => {
    expect(formatRelativeTime(Date.now() - 28 * DAY_MS)).toBe('4 周前')
    expect(formatRelativeTime(Date.now() - 29 * DAY_MS)).toBe('4 周前')
  })

  it('shows 35 days ago as 1 month ago', () => {
    expect(formatRelativeTime(Date.now() - 35 * DAY_MS)).toBe('1 个月前')
  })

  it('shows 6 days ago as 6 days ago', () => {
    expect(formatRelativeTime(Date.now() - 6 * DAY_MS)).toBe('6 天前')
  })
})

describe('countForFilterWithCounts', () => {
  const counts: NotificationCategoryCounts = { all: 84, unread: 81, error: 15, task: 20, system: 39, configuration: 10 }

  it('reads pill counts from the server aggregate, not from the loaded page', () => {
    const page = [notification('a', { category: 'system' }), notification('b', { category: 'system', readAt: 1 })]
    expect(countForFilterWithCounts(counts, page, 'all')).toBe(84)
    expect(countForFilterWithCounts(counts, page, 'unread')).toBe(81)
    expect(countForFilterWithCounts(counts, page, 'system')).toBe(39)
    expect(countForFilterWithCounts(counts, page, 'task')).toBe(20)
  })

  it('falls back to the loaded list until the server aggregate arrives', () => {
    const page = [notification('a', { category: 'system' }), notification('b', { category: 'system', readAt: 1 })]
    expect(countForFilterWithCounts(null, page, 'all')).toBe(2)
    expect(countForFilterWithCounts(null, page, 'unread')).toBe(1)
    expect(countForFilterWithCounts(null, page, 'system')).toBe(2)
  })
})

describe('unknown source / category degrades one row, never the page (R1)', () => {
  it('未知 source 的图标兜底为 system 的 Bell（与已知 system 相同），文案为「其他」', () => {
    const unknown = 'verify' as AppNotification['source']
    expect(resolveNotificationSourceIcon(unknown)).toBe(resolveNotificationSourceIcon('system'))
    expect(resolveNotificationSourceIcon(unknown)).not.toBe(resolveNotificationSourceIcon('ui'))
    expect(resolveNotificationSourceLabel(unknown)).toBe('其他')
    expect(resolveNotificationSourceIconLabel(unknown)).toBe('其他')
  })

  it('已知 source 仍走原映射', () => {
    expect(resolveNotificationSourceLabel('system')).toBe('系统')
    expect(resolveNotificationSourceLabel('automation')).toBe('自动化')
    expect(resolveNotificationSourceIconLabel('ui')).toBe('界面')
  })

  it('未知分类的级别兜底为 info，标签为「其他」', () => {
    const unknownCategory = 'mystery' as AppNotificationCategory
    expect(resolveLevel(notification('x', { category: unknownCategory, level: undefined }))).toBe('info')
    expect(resolveNotificationCategoryLabel(unknownCategory)).toBe('其他')
    expect(resolveNotificationCategoryLabel('system')).toBe('系统')
  })
})

describe('appendNotificationPage', () => {
  it('appends a cursor page and drops rows that arrived twice', () => {
    const existing = [notification('a'), notification('b')]
    const page = [notification('b'), notification('c')]
    expect(appendNotificationPage(existing, page).map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns the same list when the page adds nothing new', () => {
    const existing = [notification('a')]
    expect(appendNotificationPage(existing, [notification('a')])).toBe(existing)
  })
})
