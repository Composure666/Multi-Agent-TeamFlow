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
