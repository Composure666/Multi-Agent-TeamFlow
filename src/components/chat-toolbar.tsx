import { Activity, FolderOpen, FolderTree, Layers, MoreHorizontal, UserPlus } from 'lucide-react'
import { useState } from 'react'

import { AgentRunDebugBoardButton } from '@/components/agent-run-debug-board'
import { ConversationOutline } from '@/components/conversation-outline'
import { WorkspaceMemoryButton } from '@/components/workspace-memory-button'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
  const openRunBoardTarget = useAppStore((s) => s.openRunBoardTarget)

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1.5">
      <div className="flex items-center gap-1 rounded-lg border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)]/80 p-0.5 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface)]/70">
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

      {/*
        移动端「更多」：记忆 / 展板 / 用量收进这里，工具栏只留 3 键组 + 大纲 + 更多。
        菜单用 Popover（内容挂 body），不挂在带 overflow-hidden 的 header 内 ——
        旧的 absolute 下拉出框即被裁，全视口都点不开（B0 附带 bug）。
        记忆与用量行直接渲染各自组件的触发器（整行形态），点行即开各自的 Popover。
      */}
      <div className="sm:hidden">
        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                title="更多会话工具"
                aria-label="更多会话工具"
                className={cn(
                  'rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100',
                  moreOpen && 'bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]',
                )}
              />
            }
          >
            <MoreHorizontal className="size-4" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-1.5">
            <MobileAction label="添加 Agent" onClick={() => { setMoreOpen(false); onAddAgent() }}>
              <UserPlus className="size-4" />
            </MobileAction>
            <MobileAction label="运行展板" onClick={() => { setMoreOpen(false); openRunBoardTarget({ conversationId }) }}>
              <Activity className="size-4" />
            </MobileAction>
            <WorkspaceMemoryButton
              conversationId={conversationId}
              triggerClassName="h-auto w-full justify-start gap-2 px-2.5 py-2 font-sans text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
              triggerLabel="Workspace Memory"
            />
            <UsageBadge
              conversationId={conversationId}
              triggerClassName="h-auto w-full justify-start gap-2 border-transparent bg-transparent px-2.5 py-2 font-sans text-xs text-slate-600 hover:border-transparent hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
              triggerLabel="用量"
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* 记忆 / 展板 / 用量只在 sm+ 直接露在工具栏；sm 下收进「更多」菜单。
          用量徽章只在跑过任务（runCount > 0）时渲染，是它把移动端汉堡挤出可视区的
          最后一块（B0）—— 瘦身后工具栏约 180px，汉堡不再被挤压。 */}
      <div className="hidden items-center gap-1.5 sm:flex">
        <div className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-white/10" />
        <WorkspaceMemoryButton conversationId={conversationId} />
        <AgentRunDebugBoardButton conversationId={conversationId} />
        <UsageBadge conversationId={conversationId} />
      </div>
      <span className={cn('hidden items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors lg:inline-flex', streamConnected ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-50 text-slate-500 dark:bg-white/5 dark:text-slate-400')}>
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
      className={cn('rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100', active && 'bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)] hover:bg-[var(--agenthub-accent-soft)] dark:bg-[var(--agenthub-accent-soft)] dark:text-[var(--agenthub-accent)] dark:hover:bg-[var(--agenthub-accent-soft)]')}
    >
      {children}
    </Button>
  )
}

function MobileAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5">
      {children}
      {label}
    </button>
  )
}
