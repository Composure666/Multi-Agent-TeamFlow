import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react'

import type { AppNotification, AppNotificationCategory, AppNotificationSource } from '@/shared/types'

export const NOTIFICATION_CATEGORY_LABEL: Record<AppNotificationCategory, string> = {
  task: '任务',
  error: '异常',
  system: '系统',
  configuration: '配置',
}

export const NOTIFICATION_SOURCE_LABEL: Record<AppNotificationSource, string> = {
  ui: '界面',
  automation: '自动化',
  conversation: '对话',
  agent_run: 'Agent 运行',
  system: '系统',
}

export const NOTIFICATION_CATEGORY_META: Record<AppNotificationCategory, { icon: string; chip: string; bar: string }> = {
  task: {
    icon: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
    chip: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
    bar: 'bg-blue-400',
  },
  error: {
    icon: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
    chip: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
    bar: 'bg-rose-500',
  },
  system: {
    icon: 'bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-slate-300',
    chip: 'bg-slate-100 text-slate-500 dark:bg-neutral-800 dark:text-slate-400',
    bar: 'bg-slate-300',
  },
  configuration: {
    icon: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
    chip: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    bar: 'bg-amber-400',
  },
}

export const NOTIFICATION_LEVEL_META: Record<AppNotification['level'], {
  icon: LucideIcon
  className: string
  iconClassName: string
}> = {
  success: {
    icon: CheckCircle2,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-950 shadow-emerald-950/10 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100',
    iconClassName: 'text-emerald-600 dark:text-emerald-300',
  },
  error: {
    icon: XCircle,
    className: 'border-rose-200 bg-rose-50 text-rose-950 shadow-rose-950/10 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100',
    iconClassName: 'text-rose-600 dark:text-rose-300',
  },
  warning: {
    icon: AlertTriangle,
    className: 'border-amber-200 bg-amber-50 text-amber-950 shadow-amber-950/10 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
    iconClassName: 'text-amber-600 dark:text-amber-300',
  },
  info: {
    icon: Info,
    className: 'border-slate-200 bg-white text-slate-950 shadow-slate-950/10 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-100',
    iconClassName: 'text-[var(--agenthub-accent)]',
  },
}

export const NOTIFICATION_LEVEL_ICON: Record<AppNotification['level'], LucideIcon> = {
  success: CheckCircle2,
  error: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
}

export function getNotificationOpenLabel(notification: AppNotification): string {
  const type = notification.target?.type ?? (notification.conversationId ? 'conversation' : undefined)
  if (type === 'settings') return '去设置'
  if (type === 'automation') return '查看任务'
  if (type === 'artifact') return '查看产物'
  return '查看结果'
}

export function getNotificationOpenTitle(notification: AppNotification): string {
  const type = notification.target?.type ?? (notification.conversationId ? 'conversation' : undefined)
  if (type === 'settings') return '打开相关设置'
  if (type === 'automation') return '打开自动化任务'
  if (type === 'artifact') return '打开相关产物'
  return '打开结果会话'
}

export function getNotificationTargetLabel(notification: AppNotification): string {
  const type = notification.target?.type ?? (notification.conversationId ? 'conversation' : undefined)
  if (type === 'settings') return '设置'
  if (type === 'automation') return '自动化'
  if (type === 'artifact') return '产物'
  if (type === 'conversation') return notification.target?.messageId ? '对话消息' : '对话'
  return '无跳转目标'
}

export function getNotificationGroup(notification: AppNotification): 'pending' | 'error' | 'normal' {
  if (!notification.readAt || notification.priority === 'urgent' || notification.urgent) return 'pending'
  if (notification.level === 'error' || notification.category === 'error') return 'error'
  return 'normal'
}
