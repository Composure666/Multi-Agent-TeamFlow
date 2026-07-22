'use client'

import { useEffect, useCallback, type ComponentType } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { clearNativeUrgentNotification, showNativeNotification } from '@/lib/notifications'
import { markNotificationRead } from '@/lib/api'
import type { AppNotification, AppNotificationTarget } from '@/shared/types'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'

type NotificationClickPayload = {
  id?: string
  target?: AppNotificationTarget
  conversationId?: string
  messageId?: string
  urgent?: boolean
}

const AUTO_DISMISS_MS = 5200
const URGENT_DISMISS_MS = 9000

const LEVEL_META: Record<AppNotification['level'], {
  icon: ComponentType<{ className?: string }>
  className: string
  iconClassName: string
}> = {
  success: {
    icon: CheckCircle2,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-950 shadow-emerald-950/10',
    iconClassName: 'text-emerald-600',
  },
  error: {
    icon: XCircle,
    className: 'border-rose-200 bg-rose-50 text-rose-950 shadow-rose-950/10',
    iconClassName: 'text-rose-600',
  },
  warning: {
    icon: AlertTriangle,
    className: 'border-amber-200 bg-amber-50 text-amber-950 shadow-amber-950/10',
    iconClassName: 'text-amber-600',
  },
  info: {
    icon: Info,
    className: 'border-slate-200 bg-white text-slate-950 shadow-slate-950/10',
    iconClassName: 'text-[var(--agenthub-accent)]',
  },
}

export function NotificationCenter() {
  const notifications = useAppStore((state) => state.notifications)
  const dismissNotification = useAppStore((state) => state.dismissNotification)
  const openNotificationTarget = useAppStore((state) => state.openNotificationTarget)
  const markNotificationReadLocal = useAppStore((state) => state.markNotificationReadLocal)

  const markRead = useCallback((id: string) => {
    markNotificationReadLocal(id)
    void markNotificationRead(id).catch(console.error)
  }, [markNotificationReadLocal])

  const openNotificationPayload = useCallback((payload?: NotificationClickPayload | null) => {
    if (!payload) return
    const target = payload.target ?? (payload.conversationId ? {
      type: 'conversation' as const,
      conversationId: payload.conversationId,
      messageId: payload.messageId,
    } : undefined)
    if (target) openNotificationTarget(target)
    if (payload.id) {
      markRead(payload.id)
      dismissNotification(payload.id)
    }
    if (payload.urgent) clearNativeUrgentNotification()
  }, [dismissNotification, markRead, openNotificationTarget])

  const openNotification = useCallback((notification: AppNotification) => {
    openNotificationPayload({
      id: notification.id,
      target: notification.target,
      conversationId: notification.target?.conversationId ?? notification.conversationId,
      messageId: notification.target?.messageId,
      urgent: notification.urgent,
    })
  }, [openNotificationPayload])

  useEffect(() => {
    for (const notification of notifications) showNativeNotification(notification)
  }, [notifications])

  useEffect(() => {
    return window.agenthubNotifications?.onClick?.((payload) => {
      openNotificationPayload(payload)
    })
  }, [openNotificationPayload])

  useEffect(() => {
    const handleBrowserNotificationClick = (event: Event) => {
      const payload = (event as CustomEvent<NotificationClickPayload>).detail
      openNotificationPayload(payload)
    }
    window.addEventListener('agenthub:notification-clicked', handleBrowserNotificationClick)
    return () => window.removeEventListener('agenthub:notification-clicked', handleBrowserNotificationClick)
  }, [openNotificationPayload])

  useEffect(() => {
    const timers = notifications.map((notification) => {
      const timeout = notification.urgent ? URGENT_DISMISS_MS : AUTO_DISMISS_MS
      return window.setTimeout(() => {
        dismissNotification(notification.id)
        if (notification.urgent) clearNativeUrgentNotification()
      }, timeout)
    })

    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [dismissNotification, notifications])

  if (notifications.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2">
      {notifications.map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onOpen={() => openNotification(notification)}
          onMarkRead={() => {
            markRead(notification.id)
            dismissNotification(notification.id)
            if (notification.urgent) clearNativeUrgentNotification()
          }}
          onClose={() => {
            dismissNotification(notification.id)
            if (notification.urgent) clearNativeUrgentNotification()
          }}
        />
      ))}
    </div>
  )
}

function NotificationToast({
  notification,
  onOpen,
  onMarkRead,
  onClose,
}: {
  notification: AppNotification
  onOpen: () => void
  onMarkRead: () => void
  onClose: () => void
}) {
  const meta = LEVEL_META[notification.level]
  const Icon = meta.icon

  const canOpen = Boolean(notification.target?.conversationId ?? notification.conversationId)

  return (
    <div
      className={cn(
        'pointer-events-auto rounded-2xl border p-3 shadow-lg backdrop-blur transition duration-200',
        canOpen && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-xl',
        meta.className,
        notification.urgent && 'animate-pulse ring-2 ring-rose-200',
      )}
      role="status"
      tabIndex={canOpen ? 0 : undefined}
      title={canOpen ? '打开结果会话' : undefined}
      onClick={canOpen ? onOpen : undefined}
      onKeyDown={(event) => {
        if (!canOpen || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        onOpen()
      }}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('mt-0.5 size-4 shrink-0', meta.iconClassName)} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-5">{notification.title}</div>
          {notification.body && <div className="mt-1 whitespace-pre-wrap text-xs leading-5 opacity-80">{notification.body}</div>}
          <div className="mt-2 flex flex-wrap gap-2">
            {canOpen && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={(event) => {
                  event.stopPropagation()
                  onOpen()
                }}
                className="h-7 rounded-lg bg-white/60 px-2 text-xs"
              >
                查看结果
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation()
                onMarkRead()
              }}
              className="h-7 rounded-lg px-2 text-xs opacity-80"
            >
              标为已读
            </Button>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
          className="-mr-1 -mt-1 size-7 rounded-lg opacity-60 hover:bg-black/5 hover:opacity-100"
          aria-label="关闭通知"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
