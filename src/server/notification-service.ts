import { and, count, desc, eq, inArray, isNotNull, isNull, lt, type SQL } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type { AppSettingsRow, NotificationRow } from '@/db/schema'
import type {
  AppNotification,
  AppNotificationCategory,
  AppNotificationPriority,
  AppNotificationTarget,
} from '@/shared/types'

import { eventBus } from './event-bus'
import { newNotificationId } from './ids'
import { getAppSettings } from './settings-service'

export type PublishNotificationInput = Omit<AppNotification, 'id' | 'createdAt'> & {
  id?: string
  createdAt?: number
}

export interface ListNotificationsOptions {
  status?: 'all' | 'unread' | 'read'
  category?: AppNotificationCategory
  limit?: number
  cursor?: number
}

export interface ListNotificationsResult {
  notifications: AppNotification[]
  nextCursor: number | null
  unreadCount: number
}

export interface MarkNotificationsReadInput {
  ids?: string[]
  all?: boolean
  category?: AppNotificationCategory
}

export async function publishNotification(input: PublishNotificationInput): Promise<AppNotification> {
  const createdAt = input.createdAt ?? Date.now()
  const target = normalizeTarget(input.target, input)
  await validateTarget(target)

  const category = input.category ?? defaultCategory(input.level)
  const preference = await getNotificationPreference(category)
  const urgent = preference.allowUrgent ? input.urgent ?? false : false
  const priority = preference.allowUrgent
    ? input.priority ?? defaultPriority(input.level, input.urgent)
    : downgradeUrgentPriority(input.priority ?? defaultPriority(input.level, input.urgent))

  const notification: AppNotification = {
    ...input,
    id: input.id ?? newNotificationId(),
    category,
    priority,
    target,
    toast: preference.allowToast ? input.toast ?? true : false,
    native: preference.allowNative ? input.native ?? false : false,
    urgent,
    readAt: input.readAt ?? null,
    deletedAt: input.deletedAt ?? null,
    createdAt,
    updatedAt: input.updatedAt ?? createdAt,
  }

  await db.insert(schema.notifications).values({
    id: notification.id,
    title: notification.title,
    body: notification.body ?? null,
    level: notification.level,
    source: notification.source,
    category: notification.category!,
    priority: notification.priority!,
    targetType: target?.type ?? null,
    targetPayload: target ?? null,
    toast: notification.toast ?? true,
    native: notification.native ?? false,
    urgent: notification.urgent ?? false,
    readAt: notification.readAt ?? null,
    deletedAt: notification.deletedAt ?? null,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt ?? notification.createdAt,
  })

  eventBus.publish({
    type: 'notification.created',
    conversationId: notification.conversationId ?? target?.conversationId ?? '',
    timestamp: notification.createdAt,
    notification,
  })

  return notification
}

export async function listNotifications(options: ListNotificationsOptions = {}): Promise<ListNotificationsResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const filters: SQL[] = [isNull(schema.notifications.deletedAt)]
  if (options.status === 'unread') filters.push(isNull(schema.notifications.readAt))
  if (options.status === 'read') filters.push(isNotNull(schema.notifications.readAt))
  if (options.category) filters.push(eq(schema.notifications.category, options.category))
  if (typeof options.cursor === 'number') filters.push(lt(schema.notifications.createdAt, options.cursor))

  const rows = await db
    .select()
    .from(schema.notifications)
    .where(and(...filters))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows
  return {
    notifications: pageRows.map(mapNotificationRow),
    nextCursor: hasMore ? pageRows[pageRows.length - 1]?.createdAt ?? null : null,
    unreadCount: await getUnreadNotificationCount(),
  }
}

export async function getUnreadNotificationCount(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(schema.notifications)
    .where(and(isNull(schema.notifications.deletedAt), isNull(schema.notifications.readAt)))
  return row?.value ?? 0
}

export async function markNotificationRead(id: string): Promise<AppNotification> {
  const now = Date.now()
  const [row] = await db
    .update(schema.notifications)
    .set({ readAt: now, updatedAt: now })
    .where(eq(schema.notifications.id, id))
    .returning()
  if (!row) throw new Error(`Notification not found: ${id}`)
  return mapNotificationRow(row)
}

export async function markNotificationsRead(input: MarkNotificationsReadInput): Promise<{ updated: number }> {
  const filters: SQL[] = [isNull(schema.notifications.deletedAt), isNull(schema.notifications.readAt)]
  if (input.category) filters.push(eq(schema.notifications.category, input.category))
  if (!input.all) {
    const ids = input.ids?.filter((id) => id.trim().length > 0) ?? []
    if (ids.length === 0) return { updated: 0 }
    filters.push(inArray(schema.notifications.id, ids))
  }

  const now = Date.now()
  const rows = await db
    .update(schema.notifications)
    .set({ readAt: now, updatedAt: now })
    .where(and(...filters))
    .returning({ id: schema.notifications.id })
  return { updated: rows.length }
}

export async function deleteNotification(id: string): Promise<void> {
  const now = Date.now()
  const rows = await db
    .update(schema.notifications)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(schema.notifications.id, id))
    .returning({ id: schema.notifications.id })
  if (rows.length === 0) throw new Error(`Notification not found: ${id}`)
}

function mapNotificationRow(row: NotificationRow): AppNotification {
  const target = row.targetPayload ?? undefined
  return {
    id: row.id,
    title: row.title,
    body: row.body ?? undefined,
    level: row.level,
    source: row.source,
    category: row.category,
    priority: row.priority,
    target,
    conversationId: target?.conversationId,
    automationId: target?.automationId,
    runId: target?.runId,
    toast: row.toast,
    native: row.native,
    urgent: row.urgent,
    readAt: row.readAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function normalizeTarget(
  target: AppNotificationTarget | undefined,
  input: Omit<AppNotification, 'id' | 'createdAt'>,
): AppNotificationTarget | undefined {
  if (target) return target
  if (input.conversationId) {
    return {
      type: 'conversation',
      conversationId: input.conversationId,
      messageId: undefined,
      automationId: input.automationId,
      runId: input.runId,
    }
  }
  if (input.automationId) {
    return {
      type: 'automation',
      automationId: input.automationId,
      runId: input.runId,
    }
  }
  return undefined
}

async function validateTarget(target: AppNotificationTarget | undefined): Promise<void> {
  if (!target) return
  if (target.type === 'conversation') {
    await validateConversationTarget(target)
    return
  }
  if (target.type === 'settings') {
    if (target.settingsSection && !isSettingsSection(target.settingsSection)) {
      throw new Error(`Notification settings target section is not supported: ${target.settingsSection}`)
    }
    return
  }
  if (target.type === 'automation') {
    if (!target.automationId) throw new Error('Notification automation target requires automationId')
    const automation = await db.query.automations.findFirst({ where: eq(schema.automations.id, target.automationId) })
    if (!automation) throw new Error(`Notification target automation not found: ${target.automationId}`)
    if (target.runId) {
      const run = await db.query.automationRuns.findFirst({
        where: and(eq(schema.automationRuns.id, target.runId), eq(schema.automationRuns.automationId, target.automationId)),
      })
      if (!run) throw new Error(`Notification target automation run not found: ${target.runId}`)
    }
    return
  }
  if (target.type === 'artifact') {
    if (!target.artifactId) throw new Error('Notification artifact target requires artifactId')
    const artifact = await db.query.artifacts.findFirst({ where: eq(schema.artifacts.id, target.artifactId) })
    if (!artifact) throw new Error(`Notification target artifact not found: ${target.artifactId}`)
    return
  }
}

async function validateConversationTarget(target: AppNotificationTarget): Promise<void> {
  if (!target.conversationId) throw new Error('Notification conversation target requires conversationId')

  const conversation = await db.query.conversations.findFirst({
    where: eq(schema.conversations.id, target.conversationId),
  })
  if (!conversation) throw new Error(`Notification target conversation not found: ${target.conversationId}`)

  if (!target.messageId) return
  const message = await db.query.messages.findFirst({
    where: and(
      eq(schema.messages.id, target.messageId),
      eq(schema.messages.conversationId, target.conversationId),
    ),
  })
  if (!message) throw new Error(`Notification target message not found: ${target.messageId}`)
}

function isSettingsSection(section: string): boolean {
  return section === 'api-keys' || section === 'providers' || section === 'workspaces' || section === 'notifications'
}

function defaultCategory(level: AppNotification['level']): AppNotificationCategory {
  return level === 'error' ? 'error' : level === 'warning' ? 'configuration' : 'system'
}

function defaultPriority(level: AppNotification['level'], urgent: boolean | undefined): AppNotificationPriority {
  if (urgent) return 'urgent'
  if (level === 'error') return 'high'
  return 'normal'
}

async function getNotificationPreference(category: AppNotificationCategory): Promise<{
  allowToast: boolean
  allowNative: boolean
  allowUrgent: boolean
}> {
  try {
    const settings = await getAppSettings()
    const categoryEnabled = isCategoryEnabled(settings, category)
    return {
      allowToast: categoryEnabled && settings.notificationToastEnabled,
      allowNative: categoryEnabled && settings.notificationNativeEnabled,
      allowUrgent: categoryEnabled && settings.notificationUrgentEnabled,
    }
  } catch {
    return { allowToast: true, allowNative: true, allowUrgent: true }
  }
}

function isCategoryEnabled(settings: AppSettingsRow, category: AppNotificationCategory): boolean {
  if (category === 'task') return settings.notificationTaskEnabled
  if (category === 'error') return settings.notificationErrorEnabled
  if (category === 'configuration') return settings.notificationConfigurationEnabled
  return settings.notificationSystemEnabled
}

function downgradeUrgentPriority(priority: AppNotificationPriority): AppNotificationPriority {
  return priority === 'urgent' ? 'high' : priority
}
