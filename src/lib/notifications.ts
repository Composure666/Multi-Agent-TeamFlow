import type { AppNotification } from '@/shared/types'

const deliveredNativeNotifications = new Set<string>()

async function invokeNativeSafely(action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch {
    // Electron dev may serve a renderer bundle newer than the running main process.
  }
}

export function showNativeNotification(notification: AppNotification): void {
  if (notification.native === false || deliveredNativeNotifications.has(notification.id)) return
  deliveredNativeNotifications.add(notification.id)

  if (typeof window === 'undefined') return

  const nativePayload = {
    title: notification.title,
    body: notification.body,
    level: notification.level,
    urgent: notification.urgent,
    conversationId: notification.conversationId,
    automationId: notification.automationId,
    runId: notification.runId,
  }

  if (window.agenthubNotifications) {
    void invokeNativeSafely(() => window.agenthubNotifications!.showNative(nativePayload))
    if (notification.urgent) void invokeNativeSafely(() => window.agenthubNotifications!.flashFrame())
    return
  }

  if ('Notification' in window && window.Notification.permission === 'granted') {
    new window.Notification(notification.title, { body: notification.body })
  }
}

export function clearNativeUrgentNotification(): void {
  if (typeof window === 'undefined') return
  if (window.agenthubNotifications) void invokeNativeSafely(() => window.agenthubNotifications!.clearUrgent())
}
