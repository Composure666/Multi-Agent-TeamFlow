import { contextBridge, ipcRenderer } from 'electron'

type MenuPoint = {
  x: number
  y: number
}

function isMenuPoint(value: unknown): value is MenuPoint {
  if (!value || typeof value !== 'object') return false

  const point = value as { x?: unknown; y?: unknown }
  return typeof point.x === 'number' && typeof point.y === 'number' && Number.isFinite(point.x) && Number.isFinite(point.y)
}

type NativeNotificationTarget = {
  type: 'conversation' | 'automation' | 'artifact' | 'settings'
  conversationId?: string
  messageId?: string
  automationId?: string
  runId?: string
  artifactId?: string
  settingsSection?: string
}

type NativeNotificationPayload = {
  id?: string
  title: string
  body?: string
  level?: 'info' | 'success' | 'warning' | 'error'
  urgent?: boolean
  target?: NativeNotificationTarget
  conversationId?: string
  automationId?: string
  runId?: string
}

function isNativeNotificationPayload(value: unknown): value is NativeNotificationPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as {
    id?: unknown
    title?: unknown
    body?: unknown
    level?: unknown
    urgent?: unknown
    target?: unknown
    conversationId?: unknown
    automationId?: unknown
    runId?: unknown
  }
  if (payload.id !== undefined && typeof payload.id !== 'string') return false
  if (typeof payload.title !== 'string' || payload.title.trim().length === 0) return false
  if (payload.body !== undefined && typeof payload.body !== 'string') return false
  if (payload.level !== undefined && !['info', 'success', 'warning', 'error'].includes(String(payload.level))) return false
  if (payload.urgent !== undefined && typeof payload.urgent !== 'boolean') return false
  if (payload.target !== undefined && !isNativeNotificationTarget(payload.target)) return false
  if (payload.conversationId !== undefined && typeof payload.conversationId !== 'string') return false
  if (payload.automationId !== undefined && typeof payload.automationId !== 'string') return false
  if (payload.runId !== undefined && typeof payload.runId !== 'string') return false
  return true
}

function isNativeNotificationTarget(value: unknown): value is NativeNotificationTarget {
  if (!value || typeof value !== 'object') return false
  const target = value as Record<string, unknown>
  if (!['conversation', 'automation', 'artifact', 'settings'].includes(String(target.type))) return false
  for (const key of ['conversationId', 'messageId', 'automationId', 'runId', 'artifactId', 'settingsSection']) {
    if (target[key] !== undefined && typeof target[key] !== 'string') return false
  }
  return true
}

contextBridge.exposeInMainWorld('agenthubWindowControls', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  showWindowMenu: (point: unknown) => {
    if (!isMenuPoint(point)) return Promise.resolve()

    return ipcRenderer.invoke('window:show-menu', {
      x: Math.round(point.x),
      y: Math.round(point.y),
    })
  },
  platform: process.platform,
})

contextBridge.exposeInMainWorld('agenthubNotifications', {
  showNative: (payload: unknown) => {
    if (!isNativeNotificationPayload(payload)) return Promise.resolve()
    return ipcRenderer.invoke('notifications:show-native', payload)
  },
  flashFrame: () => ipcRenderer.invoke('notifications:flash-frame'),
  clearUrgent: () => ipcRenderer.invoke('notifications:clear-urgent'),
  onClick: (callback: (payload: NativeNotificationPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (isNativeNotificationPayload(payload)) callback(payload)
    }
    ipcRenderer.on('notifications:clicked', listener)
    return () => ipcRenderer.off('notifications:clicked', listener)
  },
})
