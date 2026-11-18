'use client'

import { PanelRight } from 'lucide-react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { useCallback, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { ArtifactPreviewPanel } from '@/components/artifact-preview-panel'
import { ChatPanel } from '@/components/chat-panel'
import { FileExplorerPanel } from '@/components/file-explorer-panel'
import { useAppStore } from '@/stores/app-store'

const MIN_RIGHT_PANEL_WIDTH = 320
const MAX_RIGHT_PANEL_WIDTH = 760

// 右侧面板宽度只留一档预设 480px，与 /demo 右栏 w-[480px] 一致。
// 旧的两档是：无产物预览时默认 440px，有预览时下限 480px——预览要看文档/代码，
// 440px 偏窄，所以收敛时取 480px 而不是 440px（文件浏览器独占时面板宽 40px，
// 聊天区相应窄 40px，可接受）。拖拽改尺寸的范围 320–760px 不变。
const DEFAULT_RIGHT_PANEL_WIDTH = 480

export function resizeConversationPanelWidth(currentWidth: number, pointerDeltaX: number) {
  return Math.min(Math.max(currentWidth - pointerDeltaX, MIN_RIGHT_PANEL_WIDTH), MAX_RIGHT_PANEL_WIDTH)
}

export function ConversationWorkspace() {
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH)
  const workspaceOpen = useAppStore((state) => state.fileExplorerOpen || Boolean(state.previewArtifactId))

  const resizeRight = useCallback((deltaX: number) => {
    setRightWidth((width) => resizeConversationPanelWidth(width, deltaX))
  }, [])

  return (
    // MotionConfig reducedMotion="user"：message-list.tsx 的同名配置只覆盖消息列表子树，
    // 覆盖不到这里的右侧面板；本文件自己包一层，让面板退出动画也遵循系统减弱动效设置
    //（与 artifact-preview-panel.tsx / artifact-workspace.tsx 内各自的配置一致）。
    <MotionConfig reducedMotion="user">
      {/* 高度用 h-full 而不是 calc(100vh - var(--agenthub-titlebar-height))：
      // page.tsx 里 ElectronTitleBar 在浏览器端返回 null，标题栏并不占位，
      // 减掉 36px 会让整块对话区比视口矮一截，底部露出背景色（输入框下方留白过大）。
      // h-full 在 Electron 与浏览器两端都等于「标题栏以下的全部可用高度」。*/}
      <div className="flex h-full min-w-0 gap-3 p-3 xl:p-4">
        <section className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] shadow-[var(--agenthub-shadow-card)] sm:min-w-[360px]">
          <ChatPanel />
          <AnimatePresence>
            {workspaceOpen && <ResizableRightPanel key="right-panel" width={rightWidth} />}
          </AnimatePresence>
        </section>
        <AnimatePresence>
          {workspaceOpen && <ResizeHandle key="resize-handle" onDrag={resizeRight} />}
        </AnimatePresence>
      </div>
    </MotionConfig>
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

  // 拖拽把手：入场无动画（保持原样）；退出时淡出，与右侧面板同步卸载，
  // 避免面板退出动画进行中把手先消失、聊天区瞬间宽 24px 造成布局闪烁。
  return (
    <motion.button
      type="button"
      onPointerDown={startDrag}
      className="group hidden w-3 shrink-0 cursor-col-resize items-stretch justify-center rounded-full lg:flex"
      aria-label="调整右侧工作区宽度"
      title="调整右侧工作区宽度"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <span className="my-3 w-1 rounded-full bg-transparent transition-colors group-hover:bg-[var(--agenthub-accent-border)] group-active:bg-[var(--agenthub-accent)]" />
    </motion.button>
  )
}

function ResizableRightPanel({ width }: { width: number }) {
  // 退出动画与产物面板入场一致（opacity + x 16，0.3s，见 artifact-preview-panel.tsx）。
  // 这里只给 exit，不给 initial/animate：入场保持原样（面板瞬间出现、内层产物面板
  // 自己滑入），避免内外两层各滑 16px 叠成 32px；退出时外层整体滑出淡出，
  // AnimatePresence 会在动画播完后再卸载，退出期间面板仍占位、聊天区不跳变。
  return (
    <motion.aside
      className="hidden h-full min-w-0 shrink-0 overflow-hidden border-l border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] lg:block"
      style={{ width }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="flex h-9 items-center gap-2 border-b border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] px-3 text-xs text-muted-foreground/30">
        <PanelRight className="size-3.5" />
        <span className="font-medium">工作区</span>
      </div>
      <div className="h-[calc(100%-2.25rem)] [&>aside]:h-full [&>aside]:w-full [&>aside]:min-w-0 [&>aside]:border-l-0">
        <FileExplorerPanel />
        <ArtifactPreviewPanel />
      </div>
    </motion.aside>
  )
}
