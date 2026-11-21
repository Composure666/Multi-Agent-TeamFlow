import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { StreamEvent } from '@/shared/types'

let dataDir: string
let service: typeof import('./notification-service')
let dbClient: typeof import('@/db/client')
let eventBus: typeof import('./event-bus').eventBus
let events: StreamEvent[] = []
let unsubscribe: (() => void) | undefined

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-notification-service-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  const vitest = await import('vitest')
  vitest.vi.resetModules()
  service = await import('./notification-service')
  dbClient = await import('@/db/client')
  eventBus = (await import('./event-bus')).eventBus
})

afterAll(() => {
  unsubscribe?.()
  dbClient?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
})

beforeEach(async () => {
  unsubscribe?.()
  events = []
  unsubscribe = eventBus.subscribe((event) => events.push(event))
  await dbClient.db.delete(dbClient.schema.notifications)
  await dbClient.db.delete(dbClient.schema.appSettings)
})

describe('notification service', () => {
  it('publishes, lists, marks read, and deletes notifications', async () => {
    const first = await service.publishNotification({
      id: 'ntf_first',
      title: '第一条通知',
      level: 'info',
      source: 'system',
      category: 'system',
      createdAt: 1,
      toast: true,
    })
    await service.publishNotification({
      id: 'ntf_second',
      title: '第二条通知',
      level: 'error',
      source: 'agent_run',
      category: 'error',
      createdAt: 2,
    })

    expect(first).toMatchObject({
      id: 'ntf_first',
      category: 'system',
      priority: 'normal',
      readAt: null,
      deletedAt: null,
    })
    expect(events.filter((event) => event.type === 'notification.created')).toHaveLength(2)

    const listed = await service.listNotifications({ status: 'all', limit: 1 })
    expect(listed.notifications.map((item) => item.id)).toEqual(['ntf_second'])
    expect(listed.nextCursor).toBe('2:ntf_second')
    expect(listed.unreadCount).toBe(2)

    await service.markNotificationRead('ntf_first')
    expect((await service.listNotifications({ status: 'unread' })).notifications.map((item) => item.id)).toEqual(['ntf_second'])
    expect((await service.markNotificationsRead({ all: true })).updated).toBe(1)

    await service.deleteNotification('ntf_second')
    expect((await service.listNotifications()).notifications.map((item) => item.id)).toEqual(['ntf_first'])
  })

  it('pages past 80 notifications with a cursor and aggregates pill counts server-side', async () => {
    const categoryForIndex = (index: number): 'system' | 'task' | 'error' | 'configuration' => {
      if (index < 40) return 'system'
      if (index < 60) return 'task'
      if (index < 75) return 'error'
      return 'configuration'
    }
    for (let i = 0; i < 85; i++) {
      await service.publishNotification({
        id: `ntf_${i}`,
        title: `通知 ${i}`,
        level: 'info',
        source: 'system',
        category: categoryForIndex(i),
        createdAt: 1000 + i,
      })
    }
    await service.markNotificationRead('ntf_0')
    await service.markNotificationRead('ntf_40')
    await service.markNotificationRead('ntf_60')
    await service.deleteNotification('ntf_1')

    const firstPage = await service.listNotifications({ status: 'all', limit: 80 })
    expect(firstPage.notifications).toHaveLength(80)
    expect(firstPage.nextCursor).not.toBeNull()
    expect(firstPage.unreadCount).toBe(81)
    expect(firstPage.categoryCounts).toEqual({
      all: 84,
      unread: 81,
      error: 15,
      task: 20,
      system: 39,
      configuration: 10,
    })

    const secondPage = await service.listNotifications({ status: 'all', limit: 80, cursor: firstPage.nextCursor ?? undefined })
    expect(secondPage.notifications).toHaveLength(4)
    expect(secondPage.nextCursor).toBeNull()
    expect(secondPage.categoryCounts).toEqual(firstPage.categoryCounts)

    const allIds = [...firstPage.notifications, ...secondPage.notifications].map((item) => item.id)
    expect(new Set(allIds).size).toBe(84)
    expect(allIds).not.toContain('ntf_1')
  })

  it('pages same-millisecond notifications without loss or duplication (G2)', async () => {
    for (const id of ['ntf_same_a', 'ntf_same_b']) {
      await service.publishNotification({
        id,
        title: `通知 ${id}`,
        level: 'info',
        source: 'system',
        category: 'system',
        createdAt: 5000,
      })
    }

    const firstPage = await service.listNotifications({ status: 'all', limit: 1 })
    expect(firstPage.notifications.map((item) => item.id)).toEqual(['ntf_same_b'])
    expect(firstPage.nextCursor).toBe('5000:ntf_same_b')

    const secondPage = await service.listNotifications({ status: 'all', limit: 1, cursor: firstPage.nextCursor ?? undefined })
    expect(secondPage.notifications.map((item) => item.id)).toEqual(['ntf_same_a'])
    expect(secondPage.nextCursor).toBeNull()

    const allIds = [...firstPage.notifications, ...secondPage.notifications].map((item) => item.id)
    expect(new Set(allIds).size).toBe(2)
  })

  it('still pages with a legacy bare-millisecond cursor (G2)', async () => {
    for (let i = 0; i < 3; i++) {
      await service.publishNotification({
        id: `ntf_legacy_${i}`,
        title: `通知 ${i}`,
        level: 'info',
        source: 'system',
        category: 'system',
        createdAt: 1000 + i,
      })
    }

    const firstPage = await service.listNotifications({ status: 'all', limit: 1, cursor: '1002' })
    expect(firstPage.notifications.map((item) => item.id)).toEqual(['ntf_legacy_1'])
    const secondPage = await service.listNotifications({ status: 'all', limit: 1, cursor: firstPage.nextCursor ?? undefined })
    expect(secondPage.notifications.map((item) => item.id)).toEqual(['ntf_legacy_0'])
    expect(secondPage.nextCursor).toBeNull()
  })

  it('marks unread notifications on unloaded pages as read with all: true (G5)', async () => {
    for (const [id, createdAt] of [['ntf_page_a', 7000], ['ntf_page_b', 8000]] as const) {
      await service.publishNotification({
        id,
        title: `通知 ${id}`,
        level: 'info',
        source: 'system',
        category: 'system',
        createdAt,
      })
    }

    const firstPage = await service.listNotifications({ status: 'all', limit: 1 })
    expect(firstPage.notifications).toHaveLength(1)

    expect((await service.markNotificationsRead({ all: true })).updated).toBe(2)
    expect((await service.listNotifications({ status: 'unread' })).notifications).toHaveLength(0)
    expect((await service.listNotifications({ status: 'all' })).notifications.every((item) => item.readAt !== null)).toBe(true)
  })

  it('validates settings targets', async () => {
    await expect(service.publishNotification({
      title: '设置通知',
      level: 'warning',
      source: 'system',
      target: { type: 'settings', settingsSection: 'notifications' },
    })).resolves.toMatchObject({ target: { type: 'settings', settingsSection: 'notifications' } })

    await expect(service.publishNotification({
      title: '错误设置通知',
      level: 'warning',
      source: 'system',
      target: { type: 'settings', settingsSection: 'unknown' },
    })).rejects.toThrow('Notification settings target section is not supported')
  })

  it('applies notification preferences without dropping persistent records', async () => {
    await dbClient.db.insert(dbClient.schema.appSettings).values({
      id: 'singleton',
      anthropicApiKey: null,
      anthropicBaseUrl: null,
      openaiApiKey: null,
      deepseekApiKey: null,
      arkApiKey: null,
      companionMode: 'off',
      mobileDeviceToken: null,
      deploymentPublishEnabled: false,
      deploymentPublishDir: null,
      deploymentPublicBaseUrl: null,
      notificationTaskEnabled: true,
      notificationErrorEnabled: false,
      notificationSystemEnabled: true,
      notificationConfigurationEnabled: true,
      notificationToastEnabled: false,
      notificationNativeEnabled: false,
      notificationUrgentEnabled: false,
      updatedAt: 1,
    })

    const notification = await service.publishNotification({
      title: '错误通知',
      level: 'error',
      source: 'agent_run',
      category: 'error',
      priority: 'urgent',
      toast: true,
      native: true,
      urgent: true,
    })

    expect(notification).toMatchObject({
      category: 'error',
      priority: 'high',
      toast: false,
      native: false,
      urgent: false,
    })
    expect((await service.listNotifications()).notifications).toHaveLength(1)
  })
})
