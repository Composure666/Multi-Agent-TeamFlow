'use client'

import { useEffect, useCallback } from 'react'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getNotificationOpenLabel, getNotificationOpenTitle, NOTIFICATION_LEVEL_META } from '@/components/notification-meta'
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
  const meta = NOTIFICATION_LEVEL_META[notification.level]
  const Icon = meta.icon

  const canOpen = Boolean(notification.target ?? notification.conversationId)
  const openLabel = getNotificationOpenLabel(notification)
  const openTitle = getNotificationOpenTitle(notification)

  return (
    <div
      className={cn(
        'pointer-events-auto rounded-xl border p-3 shadow-lg backdrop-blur transition',
        canOpen && 'cursor-pointer hover:border-[var(--agenthub-accent-border)]',
        meta.className,
        notification.urgent && 'animate-pulse ring-2 ring-rose-200 dark:ring-rose-500/40',
      )}
      role="status"
      tabIndex={canOpen ? 0 : undefined}
      title={canOpen ? openTitle : undefined}
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
                className="h-7 rounded-lg bg-white/60 px-2 text-xs dark:bg-white/10"
              >
                {openLabel}
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
          className="-mr-1 -mt-1 size-7 rounded-lg opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
          aria-label="关闭通知"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
