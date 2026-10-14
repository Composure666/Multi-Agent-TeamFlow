"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Bell,
  Bot,
  CheckCircle2,
  ChevronDown,
  Info,
  MoreHorizontal,
  Package,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { InlineError, PageHeader, PageShell } from "@/components/workbench-primitives"
import {
  getNotificationGroup,
  getNotificationOpenLabel,
  getNotificationTargetLabel,
  NOTIFICATION_CATEGORY_LABEL,
  NOTIFICATION_SOURCE_LABEL,
} from "@/components/notification-meta"
import {
  deleteNotification,
  fetchNotifications,
  markNotificationRead,
  markNotificationsRead,
} from "@/lib/api"
import { cn } from "@/lib/utils"
import type {
  AppNotification,
  AppNotificationCategory,
  AppNotificationLevel,
  AppNotificationSource,
} from "@/shared/types"
import { useAppStore } from "@/stores/app-store"

type Filter = "all" | "unread" | AppNotificationCategory

const FILTERS: Array<{ id: Filter; label: string; accent: string }> = [
  { id: "all", label: "全部", accent: "bg-slate-500" },
  { id: "unread", label: "未读", accent: "bg-blue-500" },
  { id: "error", label: "异常", accent: "bg-rose-500" },
  { id: "task", label: "任务", accent: "bg-sky-500" },
  { id: "system", label: "系统", accent: "bg-slate-400" },
  { id: "configuration", label: "配置", accent: "bg-amber-500" },
]

type GroupId = "pending" | "error" | "normal"

const GROUP_DEFS: Array<{ id: GroupId; label: string; accent: string }> = [
  { id: "pending", label: "待处理", accent: "bg-rose-500" },
  { id: "error", label: "异常", accent: "bg-rose-500" },
  { id: "normal", label: "普通通知", accent: "bg-emerald-500" },
]

// Differentiated icons per source
const SOURCE_ICON: Record<AppNotificationSource, typeof Bot> = {
  ui: Settings,
  automation: Package,
  conversation: Info,
  agent_run: Bot,
  system: Bell,
}

const SOURCE_ICON_LABEL: Record<AppNotificationSource, string> = {
  ui: "界面",
  automation: "工作流",
  conversation: "对话",
  agent_run: "Agent",
  system: "系统",
}

// Left color bar by level — bold color so severity reads without text
const LEVEL_BAR: Record<AppNotificationLevel, string> = {
  error: "bg-rose-500",
  warning: "bg-amber-500",
  success: "bg-emerald-500",
  info: "bg-sky-500",
}

// Icon container tint per level
const LEVEL_TINT: Record<AppNotificationLevel, string> = {
  error: "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300",
  warning: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300",
  success: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300",
  info: "bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300",
}

// Default level for categories missing one
const CATEGORY_LEVEL: Record<AppNotificationCategory, AppNotificationLevel> = {
  error: "error",
  configuration: "warning",
  task: "info",
  system: "info",
}

function resolveLevel(notification: AppNotification): AppNotificationLevel {
  if (notification.level) return notification.level
  return CATEGORY_LEVEL[notification.category ?? "system"]
}

export function InformationCenterWorkspace() {
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<GroupId>>(() => new Set())

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
        status: filter === "unread" ? "unread" : "all",
        category: isCategory(filter) ? filter : undefined,
        limit: 80,
      })
      setPersistentNotifications(result.notifications, result.unreadCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载通知失败")
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
      if (filter === "unread" && item.readAt) return false
      if (isCategory(filter) && item.category !== filter) return false
      if (!normalizedQuery) return true
      return getSearchText(item).includes(normalizedQuery)
    })
  }, [filter, notifications, query])

  const openNotification = async (notification: AppNotification) => {
    const target = notification.target ?? (notification.conversationId ? { type: "conversation" as const, conversationId: notification.conversationId } : undefined)
    if (target) openNotificationTarget(target)
    if (!notification.readAt) {
      markNotificationReadLocal(notification.id)
      try {
        await markNotificationRead(notification.id)
      } catch (err) {
        setError(err instanceof Error ? err.message : "标记已读失败")
      }
    }
  }

  const markRead = async (notification: AppNotification) => {
    markNotificationReadLocal(notification.id)
    try {
      await markNotificationRead(notification.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "标记已读失败")
    }
  }

  const remove = async (notification: AppNotification) => {
    deleteNotificationLocal(notification.id)
    try {
      await deleteNotification(notification.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除通知失败")
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
      setError(err instanceof Error ? err.message : "批量已读失败")
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
      title: "删除已读通知",
      description: `将删除当前可见的 ${items.length} 条已读通知，此操作不可撤销。`,
      action: async () => removeNotifications(items, "删除已读失败"),
    })
  }

  const clearVisible = async () => {
    const label = filter === "all" && query.trim().length === 0 ? "全部通知" : "当前筛选结果"
    if (visibleNotifications.length === 0) return
    setDeleteConfirm({
      title: clearLabel,
      description: `将删除${label}中的 ${visibleNotifications.length} 条通知，此操作不可撤销。`,
      action: async () => removeNotifications(visibleNotifications, "清空通知失败"),
    })
  }

  const readVisibleCount = visibleNotifications.filter((item) => item.readAt).length
  const hasScopedFilter = filter !== "all" || query.trim().length > 0
  const markReadLabel = hasScopedFilter ? "当前结果已读" : "全部已读"
  const clearLabel = filter === "all" && query.trim().length === 0 ? "清空全部" : "清空当前结果"
  const emptyState = getEmptyState(filter, query, notifications.length)

  // Group notifications: pending > error > normal; every notification keeps its own row
  const groupedNotifications = useMemo(() => {
    const buckets: Record<GroupId, AppNotification[]> = { pending: [], error: [], normal: [] }
    for (const notification of visibleNotifications) {
      buckets[getNotificationGroup(notification)].push(notification)
    }
    return GROUP_DEFS.map((group) => ({
      ...group,
      rows: buckets[group.id].sort((a, b) => {
        const aUnread = a.readAt ? 0 : 1
        const bUnread = b.readAt ? 0 : 1
        if (aUnread !== bUnread) return bUnread - aUnread
        return b.createdAt - a.createdAt
      }),
    })).filter((group) => group.rows.length > 0)
  }, [visibleNotifications])

  const toggleGroup = (id: GroupId) => {
    setCollapsedGroups((current) => {
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
    <PageShell className="p-2 lg:p-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" contentClassName="w-full max-w-none gap-3 lg:gap-4">
      <PageHeader
        icon={Bell}
        title="信息中心"
        description={`集中处理任务结果、异常告警和系统消息。未读 ${unreadCount} 条。`}
        actions={(
          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => void markAllRead()} disabled={unreadCount === 0}>
              {markReadLabel}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon-sm" aria-label="更多通知操作">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => void deleteRead()} disabled={readVisibleCount === 0}>
                  删除已读 {readVisibleCount > 0 ? readVisibleCount : ""}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => void clearVisible()} disabled={visibleNotifications.length === 0}>
                  {clearLabel}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" variant="outline" size="sm" onClick={() => openSettingsTarget("notifications")}>
              <Settings className="size-3.5" />
              通知设置
            </Button>
          </div>
        )}
      />

      {/* Filter pills + search share one line, right below the header */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-center gap-1">
            {FILTERS.map((item) => {
              const count = countForFilter(visibleNotifications, item.id)
              const active = filter === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={cn(
                    "group inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition",
                    active
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5",
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", item.accent, !active && "opacity-70")} />
                  {item.label}
                  <span className={cn("rounded-full px-1.5 py-0.5 text-3xs tabular-nums", active ? "bg-white/15 dark:bg-black/15" : "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400")}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 lg:w-auto">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索通知..."
              className="h-8 w-full min-w-[220px] rounded-lg pl-7 pr-7 text-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="清除搜索"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <InlineError message={error} onRetry={() => void load()} />}

      <ScrollArea className="max-h-[calc(100vh-220px)] min-h-[260px] [scrollbar-width:none] [&_[data-slot=scroll-area-scrollbar]]:hidden [&_[data-slot=scroll-area-thumb]]:hidden [&_[data-slot=scroll-area-viewport]]:[scrollbar-width:none] [&_[data-slot=scroll-area-viewport]::-webkit-scrollbar]:hidden">
        {loading && visibleNotifications.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">正在加载通知...</div>
        )}
        {!loading && visibleNotifications.length === 0 && (
          <EmptyStateLite
            title={emptyState.title}
            description={emptyState.description}
            action={emptyState.action
              ? {
                  label: emptyState.action,
                  onClick: () => {
                    setQuery("")
                    setFilter("all")
                  },
                }
              : undefined}
          />
        )}
        {groupedNotifications.map((group) => {
          const isCollapsed = collapsedGroups.has(group.id)
          return (
            <section key={group.id} className="mb-4">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={!isCollapsed}
                className="group flex w-full items-center gap-2.5 rounded-md px-1 py-1.5 text-left transition hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <span className={cn("size-2 rounded-full", group.accent)} aria-hidden />
                <span className="text-base font-semibold text-slate-900 dark:text-slate-100">{group.label}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-500 dark:bg-white/5 dark:text-slate-400">
                  {group.rows.length}
                </span>
                <ChevronDown
                  className={cn(
                    "ml-auto size-4 text-slate-400 transition-transform",
                    isCollapsed && "-rotate-90",
                  )}
                />
              </button>
              {!isCollapsed && (
                <div className="mt-2 space-y-1.5">
                  {group.rows.map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      onOpen={(item) => void openNotification(item)}
                      onMarkRead={(item) => void markRead(item)}
                      onDelete={(item) => void remove(item)}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
        {!loading && groupedNotifications.length > 0 && <ListEndMarker hasUnread={unreadCount > 0} />}
      </ScrollArea>

      <Dialog open={deleteConfirm !== null} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deleteConfirm?.title ?? "删除通知"}</DialogTitle>
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
  onOpen,
  onMarkRead,
  onDelete,
}: {
  notification: AppNotification
  onOpen: (notification: AppNotification) => void
  onMarkRead: (notification: AppNotification) => void
  onDelete: (notification: AppNotification) => void
}) {
  const level = resolveLevel(notification)
  const SourceIcon = SOURCE_ICON[notification.source]
  const category = notification.category ?? "system"
  const urgent = notification.priority === "urgent" || notification.urgent
  const unread = !notification.readAt
  // Primary (solid) button only for items that truly need action
  const needsAction = Boolean(notification.target) && (urgent || (level === "error" && unread))
  const openLabel = getNotificationOpenLabel(notification)

  return (
    <div
      className={cn(
        "group/row relative flex items-start gap-3 rounded-lg border px-3.5 py-2.5 pr-2.5 transition-all duration-150",
        "border-[var(--agenthub-border)] bg-[var(--agenthub-surface)]",
        "hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50/70 hover:shadow-md",
        "dark:hover:border-white/20 dark:hover:bg-white/[0.04] dark:hover:shadow-black/30",
        unread && "bg-blue-50/40 dark:bg-blue-950/20",
      )}
    >
      {/* Left color bar — widens on hover */}
      <span
        className={cn(
          "absolute bottom-2 left-0 top-2 w-1 rounded-full transition-all duration-150",
          LEVEL_BAR[level],
          "group-hover/row:w-1.5",
        )}
        aria-hidden
      />

      {/* Icon */}
      <div className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", LEVEL_TINT[level])}>
        <SourceIcon className="size-4" />
      </div>

      {/* Main content — takes the full remaining width */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpen(notification)}
            className={cn(
              "min-w-0 text-left text-sm transition",
              unread ? "font-semibold text-slate-900 dark:text-slate-50" : "font-medium text-slate-700 dark:text-slate-200",
              "hover:text-[var(--agenthub-accent)]",
            )}
          >
            {notification.title}
          </button>
          {unread && <span className="size-1.5 shrink-0 rounded-full bg-blue-500" aria-label="未读" />}
          {urgent && (
            <span className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-3xs font-medium text-rose-600 ring-1 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30">
              紧急
            </span>
          )}
          <CategoryTag category={category} level={level} />
        </div>

        {notification.body && (
          <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {notification.body}
          </div>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-400">
          <span>{NOTIFICATION_SOURCE_LABEL[notification.source]}</span>
          <span aria-hidden>·</span>
          <span>{formatRelativeTime(notification.createdAt)}</span>
          {notification.target && (
            <>
              <span aria-hidden>·</span>
              <span className="max-w-[220px] truncate">{getNotificationTargetLabel(notification)}</span>
            </>
          )}
        </div>
      </div>

      {/* Right actions: primary solid button > text link > hover-only extras */}
      <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
        {notification.target && needsAction ? (
          <Button
            type="button"
            size="sm"
            className="h-7 shrink-0 px-3 text-xs"
            onClick={() => onOpen(notification)}
          >
            {openLabel}
          </Button>
        ) : notification.target ? (
          <button
            type="button"
            onClick={() => onOpen(notification)}
            className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-[var(--agenthub-accent)] transition hover:underline"
          >
            {openLabel}
            <span aria-hidden>›</span>
          </button>
        ) : null}
        {unread && (
          <button
            type="button"
            onClick={() => onMarkRead(notification)}
            className="hidden shrink-0 text-xs text-slate-400 transition hover:text-slate-700 group-hover/row:inline dark:hover:text-slate-200"
            title="标为已读"
          >
            标已读
          </button>
        )}
        <RowMenu onMarkRead={unread ? () => onMarkRead(notification) : undefined} onDelete={() => onDelete(notification)} />
      </div>
    </div>
  )
}

function RowMenu({ onMarkRead, onDelete }: { onMarkRead?: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="更多操作"
          className="text-slate-400 opacity-0 transition group-hover/row:opacity-100"
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {onMarkRead && (
          <DropdownMenuItem onClick={onMarkRead}>
            <CheckCircle2 className="size-3.5" />
            标为已读
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="size-3.5" />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function CategoryTag({ category, level }: { category: AppNotificationCategory; level: AppNotificationLevel }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-3xs font-medium",
        level === "error" && "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
        level === "warning" && "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
        level === "success" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
        level === "info" && "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
      )}
    >
      {NOTIFICATION_CATEGORY_LABEL[category]}
    </span>
  )
}

function ListEndMarker({ hasUnread }: { hasUnread: boolean }) {
  return (
    <div className="flex items-center justify-center gap-3 py-5 text-xs text-slate-400 dark:text-slate-500">
      <span className="h-px w-20 bg-slate-200 dark:bg-white/10" aria-hidden />
      <span>{hasUnread ? "没有更多通知" : "今日通知已全部处理 ✓"}</span>
      <span className="h-px w-20 bg-slate-200 dark:bg-white/10" aria-hidden />
    </div>
  )
}

function EmptyStateLite({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--agenthub-border)] py-10 text-center">
      <div className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-white/5">
        <Bell className="size-4" />
      </div>
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
      {description && <p className="max-w-md text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</p>}
      {action && (
        <Button type="button" variant="outline" size="sm" className="mt-1" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

function isCategory(value: Filter): value is AppNotificationCategory {
  return value === "task" || value === "error" || value === "system" || value === "configuration"
}

function countForFilter(items: AppNotification[], filter: Filter): number {
  if (filter === "all") return items.length
  if (filter === "unread") return items.filter((item) => !item.readAt).length
  if (isCategory(filter)) return items.filter((item) => item.category === filter).length
  return 0
}

function getEmptyState(filter: Filter, query: string, totalCount: number): { title: string; description: string; action?: string } {
  if (query.trim()) {
    return { title: "未找到相关通知", description: "换个关键词，或清除搜索与筛选条件后再查看。", action: "查看全部" }
  }
  if (filter === "unread") {
    return { title: "没有未读通知", description: "需要处理的新消息会显示在这里。", action: totalCount > 0 ? "查看全部" : undefined }
  }
  if (isCategory(filter)) {
    return { title: `暂无${NOTIFICATION_CATEGORY_LABEL[filter]}通知`, description: "该分类下暂时没有需要处理的消息。", action: totalCount > 0 ? "查看全部" : undefined }
  }
  return { title: "暂无通知", description: "任务完成、异常告警和系统消息会出现在这里。" }
}

function getSearchText(notification: AppNotification): string {
  return [
    notification.title,
    notification.body,
    notification.source,
    NOTIFICATION_SOURCE_LABEL[notification.source],
    SOURCE_ICON_LABEL[notification.source],
    notification.category ? NOTIFICATION_CATEGORY_LABEL[notification.category] : undefined,
    notification.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

function formatRelativeTime(value: number): string {
  const diff = Math.max(0, Date.now() - value)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days === 1) return "昨天"
  if (days < 7) return `${days} 天前`
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks} 周前`
  const months = Math.floor(days / 30)
  return `${months} 个月前`
}
