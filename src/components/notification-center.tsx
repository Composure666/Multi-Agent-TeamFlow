'use client'

import { useEffect, type ComponentType } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { clearNativeUrgentNotification, showNativeNotification } from '@/lib/notifications'
import type { AppNotification } from '@/shared/types'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'

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

  useEffect(() => {
    for (const notification of notifications) showNativeNotification(notification)
  }, [notifications])

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
  onClose,
}: {
  notification: AppNotification
  onClose: () => void
}) {
  const meta = LEVEL_META[notification.level]
  const Icon = meta.icon

  return (
    <div
      className={cn(
        'pointer-events-auto rounded-2xl border p-3 shadow-lg backdrop-blur transition duration-200',
        meta.className,
        notification.urgent && 'animate-pulse ring-2 ring-rose-200',
      )}
      role="status"
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('mt-0.5 size-4 shrink-0', meta.iconClassName)} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-5">{notification.title}</div>
          {notification.body && <div className="mt-1 whitespace-pre-wrap text-xs leading-5 opacity-80">{notification.body}</div>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="-mr-1 -mt-1 size-7 rounded-lg opacity-60 hover:bg-black/5 hover:opacity-100"
          aria-label="关闭通知"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
