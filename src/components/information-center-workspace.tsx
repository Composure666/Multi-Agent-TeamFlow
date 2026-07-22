'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bell, CheckCircle2, Info, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  deleteNotification,
  fetchNotifications,
  markNotificationRead,
  markNotificationsRead,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import type { AppNotification, AppNotificationCategory } from '@/shared/types'
import { useAppStore } from '@/stores/app-store'

type Filter = 'all' | 'unread' | AppNotificationCategory

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'unread', label: '未读' },
  { id: 'task', label: '任务' },
  { id: 'error', label: '异常' },
  { id: 'system', label: '系统' },
  { id: 'configuration', label: '配置' },
]

const CATEGORY_LABEL: Record<AppNotificationCategory, string> = {
  task: '任务',
  error: '异常',
  system: '系统',
  configuration: '配置',
}

const LEVEL_ICON = {
  success: CheckCircle2,
  error: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
} satisfies Record<AppNotification['level'], typeof Info>

export function InformationCenterWorkspace() {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const notifications = useAppStore((s) => s.persistentNotifications)
  const unreadCount = useAppStore((s) => s.unreadNotificationCount)
  const setPersistentNotifications = useAppStore((s) => s.setPersistentNotifications)
  const markNotificationReadLocal = useAppStore((s) => s.markNotificationReadLocal)
  const deleteNotificationLocal = useAppStore((s) => s.deleteNotificationLocal)
  const openNotificationTarget = useAppStore((s) => s.openNotificationTarget)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchNotifications({
        status: filter === 'unread' ? 'unread' : 'all',
        category: isCategory(filter) ? filter : undefined,
        limit: 80,
      })
      setPersistentNotifications(result.notifications, result.unreadCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载通知失败')
    } finally {
      setLoading(false)
    }
  }, [filter, setPersistentNotifications])

  useEffect(() => {
    void load()
  }, [load])

  const visibleNotifications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return notifications.filter((item) => {
      if (item.deletedAt) return false
      if (filter === 'unread' && item.readAt) return false
      if (isCategory(filter) && item.category !== filter) return false
      if (!normalizedQuery) return true
      return getSearchText(item).includes(normalizedQuery)
    })
  }, [filter, notifications, query])

  const openNotification = async (notification: AppNotification) => {
    const target = notification.target ?? (notification.conversationId ? { type: 'conversation' as const, conversationId: notification.conversationId } : undefined)
    if (target) openNotificationTarget(target)
    if (!notification.readAt) {
      markNotificationReadLocal(notification.id)
      try {
        await markNotificationRead(notification.id)
      } catch (err) {
        setError(err instanceof Error ? err.message : '标记已读失败')
      }
    }
  }

  const markRead = async (notification: AppNotification) => {
    markNotificationReadLocal(notification.id)
    try {
      await markNotificationRead(notification.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '标记已读失败')
    }
  }

  const remove = async (notification: AppNotification) => {
    deleteNotificationLocal(notification.id)
    try {
      await deleteNotification(notification.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除通知失败')
      await load()
    }
  }

  const markAllRead = async () => {
    const unreadIds = visibleNotifications.filter((item) => !item.readAt).map((item) => item.id)
    if (unreadIds.length === 0) return
    for (const id of unreadIds) markNotificationReadLocal(id)
    try {
      await markNotificationsRead({ ids: unreadIds })
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量已读失败')
      await load()
    }
  }

  const removeNotifications = async (items: AppNotification[], fallbackMessage: string) => {
    if (items.length === 0) return
    for (const item of items) deleteNotificationLocal(item.id)
    try {
      await Promise.all(items.map((item) => deleteNotification(item.id)))
    } catch (err) {
      setError(err instanceof Error ? err.message : fallbackMessage)
      await load()
    }
  }

  const deleteRead = async () => {
    await removeNotifications(visibleNotifications.filter((item) => item.readAt), '删除已读失败')
  }

  const clearVisible = async () => {
    await removeNotifications(visibleNotifications, '清空通知失败')
  }

  const readVisibleCount = visibleNotifications.filter((item) => item.readAt).length

  return (
    <div className="min-h-screen bg-[var(--agenthub-surface-muted)] p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900">
          <div>
            <div className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <Bell className="size-5 text-[var(--agenthub-accent)]" />
              信息中心
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              查看任务结果、异常告警和系统消息。当前未读 {unreadCount} 条。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void markAllRead()} disabled={unreadCount === 0}>
              全部已读
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void deleteRead()} disabled={readVisibleCount === 0}>
              删除已读
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void clearVisible()} disabled={visibleNotifications.length === 0}>
              清空当前筛选
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition',
                filter === item.id
                  ? 'border-[var(--agenthub-accent)] bg-[var(--agenthub-accent)] text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索标题、正文、分类或来源"
          className="rounded-2xl border-slate-200 bg-white dark:border-white/10 dark:bg-neutral-900"
        />

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <ScrollArea className="h-[calc(100vh-230px)] rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-900">
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {loading && visibleNotifications.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-500">正在加载通知...</div>
            )}
            {!loading && visibleNotifications.length === 0 && (
              <div className="p-10 text-center text-sm text-slate-500">暂无通知</div>
            )}
            {visibleNotifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onOpen={() => void openNotification(notification)}
                onMarkRead={() => void markRead(notification)}
                onDelete={() => void remove(notification)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

function NotificationRow({
  notification,
  onOpen,
  onMarkRead,
  onDelete,
}: {
  notification: AppNotification
  onOpen: () => void
  onMarkRead: () => void
  onDelete: () => void
}) {
  const Icon = LEVEL_ICON[notification.level]
  const canOpen = Boolean(notification.target ?? notification.conversationId)
  const openLabel = getOpenLabel(notification)
  return (
    <div className={cn('flex gap-3 p-4 transition hover:bg-slate-50 dark:hover:bg-white/5', !notification.readAt && 'bg-blue-50/40 dark:bg-blue-950/10')}>
      <div className="relative mt-1 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-slate-300">
        <Icon className="size-4" />
        {!notification.readAt && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-[var(--agenthub-accent)]" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-medium text-slate-900 dark:text-slate-50">{notification.title}</div>
          {notification.category && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-neutral-800 dark:text-slate-400">
              {CATEGORY_LABEL[notification.category]}
            </span>
          )}
        </div>
        {notification.body && <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{notification.body}</div>}
        <div className="mt-2 text-xs text-slate-400">{formatRelativeTime(notification.createdAt)}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canOpen && <Button type="button" size="sm" onClick={onOpen}>{openLabel}</Button>}
        {!notification.readAt && <Button type="button" variant="outline" size="sm" onClick={onMarkRead}>标为已读</Button>}
        <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete} aria-label="删除通知">
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function isCategory(value: Filter): value is AppNotificationCategory {
  return value === 'task' || value === 'error' || value === 'system' || value === 'configuration'
}

function getOpenLabel(notification: AppNotification): string {
  const type = notification.target?.type ?? (notification.conversationId ? 'conversation' : undefined)
  if (type === 'settings') return '去设置'
  if (type === 'automation') return '查看任务'
  if (type === 'artifact') return '查看产物'
  return '查看对话'
}

function getSearchText(notification: AppNotification): string {
  return [
    notification.title,
    notification.body,
    notification.source,
    notification.category ? CATEGORY_LABEL[notification.category] : undefined,
    notification.category,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function formatRelativeTime(value: number): string {
  const diff = Math.max(0, Date.now() - value)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}
