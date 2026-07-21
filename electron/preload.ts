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

type NativeNotificationPayload = {
  title: string
  body?: string
  level?: 'info' | 'success' | 'warning' | 'error'
  urgent?: boolean
  conversationId?: string
  automationId?: string
  runId?: string
}

function isNativeNotificationPayload(value: unknown): value is NativeNotificationPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as { title?: unknown; body?: unknown; level?: unknown; urgent?: unknown }
  if (typeof payload.title !== 'string' || payload.title.trim().length === 0) return false
  if (payload.body !== undefined && typeof payload.body !== 'string') return false
  if (payload.level !== undefined && !['info', 'success', 'warning', 'error'].includes(String(payload.level))) return false
  if (payload.urgent !== undefined && typeof payload.urgent !== 'boolean') return false
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
})
