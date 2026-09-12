'use client'

import { PanelRight } from 'lucide-react'
import { useCallback, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { ArtifactPreviewPanel } from '@/components/artifact-preview-panel'
import { ChatPanel } from '@/components/chat-panel'
import { FileExplorerPanel } from '@/components/file-explorer-panel'
import { useAppStore } from '@/stores/app-store'

const MIN_RIGHT_PANEL_WIDTH = 320
const MAX_RIGHT_PANEL_WIDTH = 760

export function resizeConversationPanelWidth(currentWidth: number, pointerDeltaX: number) {
  return Math.min(Math.max(currentWidth - pointerDeltaX, MIN_RIGHT_PANEL_WIDTH), MAX_RIGHT_PANEL_WIDTH)
}

export function ConversationWorkspace() {
  const [rightWidth, setRightWidth] = useState(440)
  const previewArtifactId = useAppStore((state) => state.previewArtifactId)
  const workspaceOpen = useAppStore((state) => state.fileExplorerOpen || Boolean(state.previewArtifactId))
  // 预览打开时自动加宽面板，方便查看文档/代码
  const effectiveWidth = previewArtifactId ? Math.max(rightWidth, 480) : rightWidth

  const resizeRight = useCallback((deltaX: number) => {
    setRightWidth((width) => resizeConversationPanelWidth(width, deltaX))
  }, [])

  return (
    <div className="flex h-[calc(100vh-var(--agenthub-titlebar-height,0px))] min-w-0 gap-3 p-3 xl:p-4">
      <section className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] shadow-[var(--agenthub-shadow-card)] sm:min-w-[360px] dark:bg-neutral-900">
        <ChatPanel />
        {workspaceOpen && <ResizableRightPanel width={effectiveWidth} />}
      </section>
      {workspaceOpen && <ResizeHandle onDrag={resizeRight} />}
    </div>
  )
}

function ResizeHandle({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const startDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const startX = event.clientX

    const handlePointerMove = (moveEvent: PointerEvent) => {
      onDrag(moveEvent.clientX - startX)
    }

    const stopDrag = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopDrag)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopDrag)
  }, [onDrag])

  return (
    <button
      type="button"
      onPointerDown={startDrag}
      className="group hidden w-3 shrink-0 cursor-col-resize items-stretch justify-center rounded-full lg:flex"
      aria-label="调整右侧工作区宽度"
      title="调整右侧工作区宽度"
    >
      <span className="my-3 w-1 rounded-full bg-transparent transition-colors group-hover:bg-[var(--agenthub-accent-border)] group-active:bg-[var(--agenthub-accent)]" />
    </button>
  )
}

function ResizableRightPanel({ width }: { width: number }) {
  return (
    <aside
      className="hidden h-full min-w-0 shrink-0 overflow-hidden border-l border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] lg:block dark:bg-neutral-900"
      style={{ width }}
    >
      <div className="flex h-9 items-center gap-2 border-b border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] px-3 text-xs text-muted-foreground dark:bg-neutral-950/30">
        <PanelRight className="size-3.5" />
        <span className="font-medium">工作区</span>
      </div>
      <div className="h-[calc(100%-2.25rem)] [&>aside]:h-full [&>aside]:w-full [&>aside]:min-w-0 [&>aside]:border-l-0">
        <FileExplorerPanel />
        <ArtifactPreviewPanel />
      </div>
    </aside>
  )
}
