import { FolderOpen, FolderTree, Layers, MoreHorizontal, UserPlus } from 'lucide-react'
import { useState } from 'react'

import { AgentRunDebugButton } from '@/components/agent-run-debug-button'
import { ConversationOutline } from '@/components/conversation-outline'
import { WorkspaceMemoryButton } from '@/components/workspace-memory-button'
import { Button } from '@/components/ui/button'
import { UsageBadge } from '@/components/usage-badge'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'

export function ChatToolbar({
  conversationId,
  fileExplorerOpen,
  artifactsOpen,
  previewArtifactId,
  onToggleFileExplorer,
  onOpenArtifacts,
  onOpenFiles,
  onAddAgent,
}: {
  conversationId: string
  fileExplorerOpen: boolean
  artifactsOpen: boolean
  previewArtifactId: string | null
  onToggleFileExplorer: () => void
  onOpenArtifacts: () => void
  onOpenFiles: () => void
  onAddAgent: () => void
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const streamConnected = useAppStore((s) => s.streamConnected)

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1.5">
      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white/80 p-0.5 dark:border-white/10 dark:bg-neutral-900/70">
        <ToolbarButton active={fileExplorerOpen} label={fileExplorerOpen ? '关闭工作区' : '打开工作区'} onClick={onToggleFileExplorer}>
          <FolderTree className="size-4" />
        </ToolbarButton>
        <ToolbarButton active={artifactsOpen || Boolean(previewArtifactId)} label="本会话产物库" onClick={onOpenArtifacts}>
          <Layers className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="会话文件库" onClick={onOpenFiles}>
          <FolderOpen className="size-4" />
        </ToolbarButton>
      </div>

      <div className="hidden items-center gap-1 sm:flex">
        <ConversationOutline conversationId={conversationId} />
        <ToolbarButton label="添加 Agent" onClick={onAddAgent}>
          <UserPlus className="size-4" />
        </ToolbarButton>
      </div>

      <div className="sm:hidden">
        <ConversationOutline conversationId={conversationId} />
      </div>

      <div className="relative sm:hidden">
        <ToolbarButton label="更多会话工具" active={moreOpen} onClick={() => setMoreOpen((open) => !open)}>
          <MoreHorizontal className="size-4" />
        </ToolbarButton>
        {moreOpen && (
          <div className="absolute right-0 top-full z-20 mt-2 grid min-w-44 gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg dark:border-white/10 dark:bg-neutral-900">
            <MobileAction label="添加 Agent" onClick={() => { setMoreOpen(false); onAddAgent() }}>
              <UserPlus className="size-4" />
            </MobileAction>
          </div>
        )}
      </div>

      <div className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-white/10" />
      <WorkspaceMemoryButton conversationId={conversationId} />
      <AgentRunDebugButton conversationId={conversationId} />
      <UsageBadge conversationId={conversationId} />
      <span className={cn('hidden items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors lg:inline-flex', streamConnected ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-50 text-slate-500 dark:bg-white/5 dark:text-slate-400')}>
        <span className={cn('size-1.5 rounded-full', streamConnected ? 'bg-emerald-500' : 'bg-slate-300')} />
        {streamConnected ? '已连接' : '断开'}
      </span>
    </div>
  )
}

function ToolbarButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn('rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-neutral-800 dark:hover:text-slate-100', active && 'bg-blue-50 text-[#3370ff] hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/15')}
    >
      {children}
    </Button>
  )
}

function MobileAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-neutral-800">
      {children}
      {label}
    </button>
  )
}
