'use client'

import { Copy, Minus, Square, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'

export function ElectronTitleBar() {
  const [controls, setControls] = useState<Window['agenthubWindowControls']>()
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const windowControls = window.agenthubWindowControls
    setControls(windowControls)

    if (!windowControls) return

    windowControls.isMaximized().then(setIsMaximized).catch(() => setIsMaximized(false))
  }, [])

  if (!controls) return null

  const isMac = controls.platform === 'darwin'

  const refreshMaximized = () => {
    controls.isMaximized().then(setIsMaximized).catch(() => setIsMaximized(false))
  }

  const toggleMaximize = () => {
    controls.toggleMaximize().then(refreshMaximized).catch(() => {})
  }

  const showWindowMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    controls.showWindowMenu({ x: event.clientX, y: event.clientY }).catch(() => {})
  }

  return (
    <header className="electron-titlebar">
      <div
        className="electron-titlebar-drag-region electron-drag"
        onContextMenu={showWindowMenu}
        onDoubleClick={toggleMaximize}
      >
        {isMac && <div className="electron-titlebar-mac-spacer" />}
        <div className="electron-titlebar-title">
          <span className="electron-titlebar-logo" aria-hidden="true">
            <Sparkles className="size-3.5" />
          </span>
          <span className="truncate">AgentHub</span>
        </div>
      </div>

      {!isMac && (
        <div className="electron-titlebar-actions electron-no-drag">
          <button
            type="button"
            className="electron-window-control"
            aria-label="最小化窗口"
            onClick={() => controls.minimize().catch(() => {})}
          >
            <Minus className="size-4" />
          </button>
          <button
            type="button"
            className="electron-window-control"
            aria-label={isMaximized ? '还原窗口' : '最大化窗口'}
            onClick={toggleMaximize}
          >
            {isMaximized ? <Copy className="size-3.5" /> : <Square className="size-3.5" />}
          </button>
          <button
            type="button"
            className="electron-window-control electron-window-control-close"
            aria-label="关闭窗口"
            onClick={() => controls.close().catch(() => {})}
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </header>
  )
}
