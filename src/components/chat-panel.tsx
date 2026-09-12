'use client'

import { AlertTriangle, FilePenLine, Layers, Menu, MessagesSquare, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { AddAgentDialog } from '@/components/add-agent-dialog'
import { AgentInfoPopover } from '@/components/agent-info-popover'
import { AskUserQuestionDialog } from '@/components/ask-user-question-dialog'
import { ArtifactLibrary } from '@/components/artifact-library'
import { ChatToolbar } from '@/components/chat-toolbar'
import { FileLibraryDialog } from '@/components/file-library-dialog'
import { FileTab } from '@/components/file-tab'
import { PendingWriteDiffTab } from '@/components/pending-write-diff-tab'
import { PendingBashCommandsPanel } from '@/components/pending-bash-commands-panel'
import { PendingMcpToolApprovalsPanel } from '@/components/pending-mcp-tool-approvals-panel'
import { PendingWritesPanel } from '@/components/pending-writes-panel'
import { diffTabPendingId, isDiffTabId } from '@/components/pending-writes-panel'
import { PinnedMessagesBar } from '@/components/pinned-messages-bar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MessageInput } from '@/components/message-input'
import { MessageList } from '@/components/message-list'
import { RunStatusSummary } from '@/components/run-status-summary'
import type { AgentRow } from '@/db/schema'
import { fetchPendingDispatchPlans } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  useActiveConversation,
  useActiveTab,
  useAppStore,
  useOpenFiles,
  usePendingWrites,
} from '@/stores/app-store'

export function ChatPanel() {
  const conv = useActiveConversation()
  const agents = useAppStore((s) => s.agents)
  const fileExplorerOpen = useAppStore((s) => s.fileExplorerOpen)
  const previewArtifactId = useAppStore((s) => s.previewArtifactId)
  const setFileExplorerOpen = useAppStore((s) => s.setFileExplorerOpen)
  const closeFile = useAppStore((s) => s.closeFile)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const setMobileSidebarOpen = useAppStore((s) => s.setMobileSidebarOpen)
  const setPendingDispatchPlansForConversation = useAppStore(
    (s) => s.setPendingDispatchPlansForConversation,
  )
  const [addOpen, setAddOpen] = useState(false)
  const [filesOpen, setFilesOpen] = useState(false)
  const [artifactsOpen, setArtifactsOpen] = useState(false)

  const openFiles = useOpenFiles(conv?.id ?? '')
  const activeTab = useActiveTab(conv?.id ?? '')
  const pendingWrites = usePendingWrites(conv?.id ?? null)
  const pendingById = useMemo(
    () => new Map(pendingWrites.map((p) => [p.id, p])),
    [pendingWrites],
  )

  // Pending 被 resolve（其他客户端 / SSE 移除）后，关闭对应的 diff tab —— 即使该 tab 当前在后台
  useEffect(() => {
    if (!conv) return
    for (const tabId of openFiles) {
      if (isDiffTabId(tabId) && !pendingById.has(diffTabPendingId(tabId))) {
        closeFile(conv.id, tabId)
      }
    }
  }, [conv, openFiles, pendingById, closeFile])

  useEffect(() => {
    if (!conv) return
    let cancelled = false
    fetchPendingDispatchPlans(conv.id)
      .then((list) => {
        if (!cancelled) setPendingDispatchPlansForConversation(conv.id, list)
      })
      .catch((err) => {
        console.warn('[ChatPanel] fetch pending dispatch plans failed', err)
      })
    return () => {
      cancelled = true
    }
  }, [conv, setPendingDispatchPlansForConversation])

  if (!conv) {
    return (
      <main className="flex min-w-0 flex-1 items-center justify-center bg-transparent">
        <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <MessagesSquare className="size-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold text-slate-900">开始你的智能协作</h2>
            <p className="text-sm leading-6 text-slate-500">
              从左侧选择一个会话继续聊天，或点击「+ 新建任务」选择一个或多个 Agent 开始
            </p>
          </div>
        </div>
      </main>
    )
  }

  const participantAgents = conv.agentIds.map((id) => agents[id]).filter(Boolean)

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent">
      <header className="flex shrink-0 items-center gap-3 overflow-hidden border-b border-slate-100 px-5 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          {/* 移动端汉堡按钮：打开 sidebar 抽屉 */}
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setMobileSidebarOpen(true)}
            title="打开会话列表"
            className="md:hidden"
          >
            <Menu className="size-4" />
          </Button>
          <ParticipantStack agents={participantAgents} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 truncate text-[15px] font-semibold text-slate-900">{conv.title}</span>
              {conv.workspaceMode === 'local' && conv.workspaceBoundPath && (
                <span
                  title={`本地工作目录：${conv.workspaceBoundPath}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                >
                  <AlertTriangle className="size-2.5" />
                  本地
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-xs text-slate-500">
              {conv.mode === 'single' ? '单聊' : '群聊'} · {participantAgents.length} 位 Agent
            </div>
          </div>
        </div>
        <ChatToolbar
          conversationId={conv.id}
          fileExplorerOpen={fileExplorerOpen}
          artifactsOpen={artifactsOpen}
          previewArtifactId={previewArtifactId}
          onToggleFileExplorer={() => setFileExplorerOpen(!fileExplorerOpen)}
          onOpenArtifacts={() => setArtifactsOpen(true)}
          onOpenFiles={() => setFilesOpen(true)}
          onAddAgent={() => setAddOpen(true)}
        />
      </header>

      <RunStatusSummary conversationId={conv.id} />

      {/* Tab bar：仅在有打开的文件 / diff 时显示（避免单 chat tab 时浪费空间） */}
      {openFiles.length > 0 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50/50 px-3 py-1.5 text-xs">
          <TabButton
            label="对话"
            active={activeTab === 'chat'}
            onClick={() => setActiveTab(conv.id, 'chat')}
          />
          {openFiles.map((tabId) => {
            if (isDiffTabId(tabId)) {
              const pw = pendingById.get(diffTabPendingId(tabId))
              const name = pw ? pw.path.split('/').pop() ?? pw.path : '已处理'
              return (
                <TabButton
                  key={tabId}
                  label={`diff: ${name}`}
                  tooltip={pw?.path}
                  icon={<FilePenLine className="size-3 text-[#3370FF]" />}
                  active={activeTab === tabId}
                  onClick={() => setActiveTab(conv.id, tabId)}
                  onClose={() => closeFile(conv.id, tabId)}
                  highlight
                />
              )
            }
            return (
              <TabButton
                key={tabId}
                label={tabId.split('/').pop() ?? tabId}
                tooltip={tabId}
                active={activeTab === tabId}
                onClick={() => setActiveTab(conv.id, tabId)}
                onClose={() => closeFile(conv.id, tabId)}
              />
            )
          })}
        </div>
      )}

      {/* 主体：chat / file tab / pending diff tab */}
      {activeTab === 'chat' || !openFiles.includes(activeTab) ? (
        <>
          <PinnedMessagesBar conversationId={conv.id} />
          <MessageList conversationId={conv.id} />
          <PendingMcpToolApprovalsPanel conversationId={conv.id} />
          <PendingBashCommandsPanel conversationId={conv.id} />
          <PendingWritesPanel conversationId={conv.id} />
          <MessageInput conversationId={conv.id} />
        </>
      ) : isDiffTabId(activeTab) ? (
        <PendingWriteDiffTab conversationId={conv.id} pendingId={diffTabPendingId(activeTab)} />
      ) : (
        <FileTab conversationId={conv.id} relPath={activeTab} />
      )}

      <AddAgentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        conversationId={conv.id}
        existingAgentIds={conv.agentIds}
      />

      <FileLibraryDialog
        open={filesOpen}
        onOpenChange={setFilesOpen}
        conversationId={conv.id}
      />

      <Dialog open={artifactsOpen} onOpenChange={setArtifactsOpen}>
        <DialogContent className="grid max-h-[min(680px,calc(100vh-2rem))] max-w-md grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Layers className="size-4 text-muted-foreground" />
              会话产物
            </DialogTitle>
            <DialogDescription className="truncate text-xs" title={conv.title}>
              {conv.title}
            </DialogDescription>
          </DialogHeader>
          <ArtifactLibrary conversationId={conv.id} showConversationTitle={false} onPreview={() => setArtifactsOpen(false)} />
        </DialogContent>
      </Dialog>

      <AskUserQuestionDialog conversationId={conv.id} />
    </main>
  )
}

function ParticipantStack({ agents }: { agents: AgentRow[] }) {
  const visibleAgents = agents.slice(0, 3)
  const hiddenAgents = agents.slice(3)
  const title = agents.map((agent) => agent.name).join(' / ')

  return (
    <div className="flex shrink-0 -space-x-2 overflow-hidden pr-1" title={title}>
      {visibleAgents.map((agent) => (
        <AgentInfoPopover
          key={agent.id}
          agent={agent}
          size="sm"
          avatarClassName="border-2 border-background"
        />
      ))}
      {hiddenAgents.length > 0 && (
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted text-[11px] font-semibold text-muted-foreground"
          title={hiddenAgents.map((agent) => agent.name).join(' / ')}
        >
          +{hiddenAgents.length}
        </div>
      )}
    </div>
  )
}

function TabButton({
  label,
  tooltip,
  icon,
  active,
  highlight,
  onClick,
  onClose,
}: {
  label: string
  tooltip?: string
  icon?: React.ReactNode
  active: boolean
  highlight?: boolean
  onClick: () => void
  onClose?: () => void
}) {
  return (
    <div
      title={tooltip}
      className={cn(
        'group flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 transition',
        active
          ? highlight
            ? 'border-[#3370FF]/30 bg-[#3370FF]/5 text-slate-900 shadow-sm'
            : 'border-slate-200 bg-white text-slate-900 shadow-sm'
          : 'border-transparent text-slate-500 hover:bg-white hover:text-slate-900',
      )}
    >
      {icon}
      <button type="button" onClick={onClick} className="max-w-[180px] truncate">
        {label}
      </button>
      {onClose && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="rounded p-0.5 opacity-50 transition hover:bg-slate-100 hover:opacity-100"
          title="关闭"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}
