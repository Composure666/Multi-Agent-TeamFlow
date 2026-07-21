import type { AppNotification } from '@/shared/types'

import { eventBus } from './event-bus'
import { newNotificationId } from './ids'

export type PublishNotificationInput = Omit<AppNotification, 'id' | 'createdAt'> & {
  id?: string
  createdAt?: number
}

export function publishNotification(input: PublishNotificationInput): AppNotification {
  const notification: AppNotification = {
    ...input,
    id: input.id ?? newNotificationId(),
    createdAt: input.createdAt ?? Date.now(),
  }

  eventBus.publish({
    type: 'notification.created',
    conversationId: notification.conversationId ?? '',
    timestamp: notification.createdAt,
    notification,
  })

  return notification
}
