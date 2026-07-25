'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, MoreHorizontal, Settings, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState, InlineError, PageCard, PageHeader, PageShell } from '@/components/workbench-primitives'
import {
  getNotificationGroup,
  getNotificationOpenLabel,
  getNotificationTargetLabel,
  NOTIFICATION_CATEGORY_LABEL,
  NOTIFICATION_CATEGORY_META,
  NOTIFICATION_LEVEL_ICON,
  NOTIFICATION_SOURCE_LABEL,
} from '@/components/notification-meta'
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

const NOTIFICATION_GROUPS: Array<{ id: 'pending' | 'error' | 'normal'; label: string; description: string }> = [
  { id: 'pending', label: '待处理', description: '未读、紧急或需要用户关注的通知' },
  { id: 'error', label: '异常', description: '错误与失败告警' },
  { id: 'normal', label: '普通通知', description: '已读系统消息和一般状态更新' },
]

export function InformationCenterWorkspace() {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const notifications = useAppStore((s) => s.persistentNotifications)
  const unreadCount = useAppStore((s) => s.unreadNotificationCount)
  const setPersistentNotifications = useAppStore((s) => s.setPersistentNotifications)
  const markNotificationReadLocal = useAppStore((s) => s.markNotificationReadLocal)
  const deleteNotificationLocal = useAppStore((s) => s.deleteNotificationLocal)
  const openNotificationTarget = useAppStore((s) => s.openNotificationTarget)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)

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
    const items = visibleNotifications.filter((item) => item.readAt)
    if (items.length === 0) return
    setDeleteConfirm({
      title: '删除已读通知',
      description: `将删除当前可见的 ${items.length} 条已读通知，此操作不可撤销。`,
      action: async () => removeNotifications(items, '删除已读失败'),
    })
  }

  const clearVisible = async () => {
    const label = filter === 'all' && query.trim().length === 0 ? '全部通知' : '当前筛选结果'
    if (visibleNotifications.length === 0) return
    setDeleteConfirm({
      title: clearLabel,
      description: `将删除${label}中的 ${visibleNotifications.length} 条通知，此操作不可撤销。`,
      action: async () => removeNotifications(visibleNotifications, '清空通知失败'),
    })
  }

  const readVisibleCount = visibleNotifications.filter((item) => item.readAt).length
  const hasScopedFilter = filter !== 'all' || query.trim().length > 0
  const markReadLabel = hasScopedFilter ? '当前结果已读' : '全部已读'
  const activeFilter = FILTERS.find((item) => item.id === filter)
  const clearLabel = filter === 'all' && query.trim().length === 0 ? '清空全部' : '清空当前结果'
  const emptyState = getEmptyState(filter, query, notifications.length)
  const groupedNotifications = NOTIFICATION_GROUPS.map((group) => ({
    ...group,
    notifications: visibleNotifications.filter((notification) => getNotificationGroup(notification) === group.id),
  })).filter((group) => group.notifications.length > 0)

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const confirmDelete = async () => {
    if (!deleteConfirm) return
    const action = deleteConfirm.action
    setDeleteConfirm(null)
    await action()
  }

  return (
    <PageShell className="p-2 lg:p-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" contentClassName="w-full max-w-none gap-2.5 lg:gap-3">
      <PageHeader
        icon={Bell}
        title="信息中心"
        description={`集中处理任务结果、异常告警和系统消息。未读 ${unreadCount} 条。`}
        actions={(
          <Button type="button" variant="outline" size="sm" onClick={() => openSettingsTarget('notifications')}>
            <Settings className="size-3.5" />
            通知设置
          </Button>
        )}
      />

      <PageCard className="p-2 sm:p-2.5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">分类筛选</span>
              {hasScopedFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setFilter('all')
                    setQuery('')
                  }}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-neutral-800 dark:hover:text-slate-100"
                >
                  <X className="size-3" />
                  清除条件
                </button>
              )}
            </div>
            <div className="-mx-1 overflow-x-auto px-1">
              <div className="flex min-w-max gap-1.5">
                {FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilter(item.id)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs font-medium transition',
                      filter === item.id
                        ? 'border-[var(--agenthub-accent)] bg-[var(--agenthub-accent)] text-white dark:text-neutral-950'
                        : 'border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] text-slate-600 hover:border-slate-300 dark:bg-neutral-900 dark:text-slate-300 dark:hover:border-white/20',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:items-center">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索通知标题、正文或来源"
              className="h-8 rounded-lg text-sm sm:min-w-[240px]"
            />
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" variant="outline" size="sm" onClick={() => void markAllRead()} disabled={unreadCount === 0}>
                {markReadLabel}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button type="button" variant="outline" size="sm" disabled={visibleNotifications.length === 0}>
                    <MoreHorizontal className="size-3.5" />
                    更多
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => void deleteRead()} disabled={readVisibleCount === 0}>
                    删除已读 {readVisibleCount > 0 ? readVisibleCount : ''}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => void clearVisible()} disabled={visibleNotifications.length === 0}>
                    {clearLabel}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </PageCard>

      {error && <InlineError message={error} onRetry={() => void load()} />}

      <PageCard className="overflow-hidden p-0">
        <div className="border-b border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] px-3.5 py-2 text-xs text-slate-500 dark:bg-neutral-950/30 dark:text-slate-400">
          按处理状态分组展示当前筛选结果{activeFilter ? ` · ${activeFilter.label}` : ''}{query.trim() ? ` · “${query.trim()}”` : ''}
        </div>
        <ScrollArea className="max-h-[calc(100vh-230px)] min-h-[260px] [scrollbar-width:none] [&_[data-slot=scroll-area-scrollbar]]:hidden [&_[data-slot=scroll-area-thumb]]:hidden [&_[data-slot=scroll-area-viewport]]:[scrollbar-width:none] [&_[data-slot=scroll-area-viewport]::-webkit-scrollbar]:hidden">
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {loading && visibleNotifications.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">正在加载通知...</div>
            )}
            {!loading && visibleNotifications.length === 0 && (
              <EmptyState
                icon={Bell}
                title={emptyState.title}
                description={emptyState.description}
                action={emptyState.action
                  ? {
                      label: emptyState.action,
                      onClick: () => {
                        setQuery('')
                        setFilter('all')
                      },
                    }
                  : undefined}
              />
            )}
            {groupedNotifications.map((group) => (
              <section key={group.id} className="divide-y divide-slate-100 dark:divide-white/10">
                <div className="bg-[var(--agenthub-surface-muted)] px-3.5 py-2.5 dark:bg-neutral-950/40">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{group.label}</h2>
                      <p className="mt-0.5 hidden text-xs text-slate-500 dark:text-slate-400 sm:block">{group.description}</p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500 ring-1 ring-[var(--agenthub-border)] dark:bg-neutral-900 dark:text-slate-400">
                      {group.notifications.length} 条
                    </span>
                  </div>
                </div>
                {group.notifications.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    isExpanded={expandedIds.has(notification.id)}
                    onToggleExpanded={() => toggleExpanded(notification.id)}
                    onOpen={() => void openNotification(notification)}
                    onMarkRead={() => void markRead(notification)}
                    onDelete={() => void remove(notification)}
                  />
                ))}
              </section>
            ))}
          </div>
        </ScrollArea>
      </PageCard>

      <Dialog open={deleteConfirm !== null} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deleteConfirm?.title ?? '删除通知'}</DialogTitle>
            <DialogDescription>{deleteConfirm?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteConfirm(null)}>取消</Button>
            <Button type="button" variant="destructive" onClick={() => void confirmDelete()}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

function NotificationRow({
  notification,
  isExpanded,
  onToggleExpanded,
  onOpen,
  onMarkRead,
  onDelete,
}: {
  notification: AppNotification
  isExpanded: boolean
  onToggleExpanded: () => void
  onOpen: () => void
  onMarkRead: () => void
  onDelete: () => void
}) {
  const Icon = NOTIFICATION_LEVEL_ICON[notification.level]
  const canOpen = Boolean(notification.target ?? notification.conversationId)
  const openLabel = getNotificationOpenLabel(notification)
  const category = notification.category ?? 'system'
  const meta = NOTIFICATION_CATEGORY_META[category]
  const urgent = notification.priority === 'urgent' || notification.urgent
  const canExpand = Boolean(notification.body && notification.body.length > 80)
  return (
    <div className={cn('relative flex flex-col gap-2.5 px-3.5 py-3 transition hover:bg-slate-50 dark:hover:bg-white/5 sm:flex-row sm:items-start', !notification.readAt && 'bg-blue-50/25 dark:bg-blue-950/10')}>
      <span className={cn('absolute bottom-3 left-0 top-3 w-1 rounded-r-full', urgent ? 'bg-rose-500' : meta.bar, notification.readAt && 'opacity-30')} />
      <div className={cn('relative mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', meta.icon)}>
        <Icon className="size-4" />
        {!notification.readAt && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[var(--agenthub-accent)]" />}
      </div>
      <div className="min-w-0 flex-1 pl-1 sm:pl-0">
        <button type="button" onClick={canExpand ? onToggleExpanded : undefined} className="block w-full text-left" disabled={!canExpand}>
          <div className="flex flex-wrap items-center gap-2">
            <div className={cn('min-w-0 text-slate-900 dark:text-slate-50', notification.readAt ? 'font-medium' : 'font-semibold')}>
              {notification.title}
            </div>
            {urgent && (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
                紧急
              </span>
            )}
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', meta.chip)}>
              {NOTIFICATION_CATEGORY_LABEL[category]}
            </span>
          </div>
          {notification.body && <div className={cn('mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-600 dark:text-slate-300', !isExpanded && 'line-clamp-2')}>{notification.body}</div>}
        </button>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
          <span>{NOTIFICATION_SOURCE_LABEL[notification.source]}</span>
          <span>·</span>
          <span>{formatRelativeTime(notification.createdAt)}</span>
          <span>·</span>
          <span>{getNotificationTargetLabel(notification)}</span>
          {canExpand && (
            <button type="button" onClick={onToggleExpanded} className="text-[var(--agenthub-accent)] hover:underline">
              {isExpanded ? '收起' : '展开'}
            </button>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 pl-1 sm:pl-0">
        {canOpen && <Button type="button" size="sm" onClick={onOpen}>{openLabel}</Button>}
        {!notification.readAt && <Button type="button" variant="outline" size="sm" onClick={onMarkRead}>标为已读</Button>}
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="更多通知操作">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="size-3.5" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function isCategory(value: Filter): value is AppNotificationCategory {
  return value === 'task' || value === 'error' || value === 'system' || value === 'configuration'
}

function getEmptyState(filter: Filter, query: string, totalCount: number): { title: string; description: string; action?: string } {
  if (query.trim()) {
    return { title: '未找到相关通知', description: '换个关键词，或清除搜索与筛选条件后再查看。', action: '查看全部' }
  }
  if (filter === 'unread') {
    return { title: '没有未读通知', description: '需要处理的新消息会显示在这里。', action: totalCount > 0 ? '查看全部' : undefined }
  }
  if (isCategory(filter)) {
    return { title: `暂无${NOTIFICATION_CATEGORY_LABEL[filter]}通知`, description: '该分类下暂时没有需要处理的消息。', action: totalCount > 0 ? '查看全部' : undefined }
  }
  return { title: '暂无通知', description: '任务完成、异常告警和系统消息会出现在这里。' }
}

function getSearchText(notification: AppNotification): string {
  return [
    notification.title,
    notification.body,
    notification.source,
    NOTIFICATION_SOURCE_LABEL[notification.source],
    notification.category ? NOTIFICATION_CATEGORY_LABEL[notification.category] : undefined,
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
