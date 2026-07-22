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
    expect(listed.nextCursor).toBe(2)
    expect(listed.unreadCount).toBe(2)

    await service.markNotificationRead('ntf_first')
    expect((await service.listNotifications({ status: 'unread' })).notifications.map((item) => item.id)).toEqual(['ntf_second'])
    expect((await service.markNotificationsRead({ all: true })).updated).toBe(1)

    await service.deleteNotification('ntf_second')
    expect((await service.listNotifications()).notifications.map((item) => item.id)).toEqual(['ntf_first'])
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
