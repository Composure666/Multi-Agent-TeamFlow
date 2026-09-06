'use client'

import {
  Activity,
  AlertTriangle,
  Bot,
  Clock3,
  Copy,
  FileCode2,
  GitBranch,
  Loader2,
  Maximize2,
  Minimize2,
  PackageOpen,
  RefreshCw,
  Share2,
  TerminalSquare,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'

import { Button } from '@/components/ui/button'
import { fetchAgentRunDebugDetail, fetchAgentRuns } from '@/lib/api'
import {
  projectAgentRunArtifacts,
  projectAgentRunOperations,
  projectAgentRunToolTrace,
  summarizeAgentRunToolTraceArgs,
  summarizeAgentRunToolTraceResult,
} from '@/lib/agent-run-debug-projection'
import {
  buildAgentRunBoardGraph,
  getBoardPanelTabForStage,
  projectAgentRunBoardStages,
  type AgentRunBoardNodeData,
  type AgentRunBoardNode,
  type AgentRunBoardPanelTab,
  type AgentRunBoardStage,
  type AgentRunBoardStageStatus,
  type AgentRunBoardTone,
} from '@/lib/agent-run-debug-board'
import { cn } from '@/lib/utils'
import type { AgentRunRow } from '@/db/schema'
import {
  useAgentRunDebugDetail,
  useAgentRunDebugList,
  useAppStore,
  useConversationList,
} from '@/stores/app-store'
import type { AgentRunDebugDetail, AgentRunDebugListItem } from '@/shared/types'

const nodeTypes: NodeTypes = {
  runBoardStage: StageNode,
}

type BoardPanelTab = AgentRunBoardPanelTab

export function AgentRunDebugBoard({ onFocusChange }: { onFocusChange?: (focused: boolean) => void }) {
  const conversations = useConversationList().filter((conversation) => !conversation.archived)
  const activeConversationId = useAppStore((state) => state.activeConversationId)
  const targetConversationId = useAppStore((state) => state.activeRunBoardConversationId)
  const targetRunId = useAppStore((state) => state.activeRunBoardRunId)
  const clearRunBoardTarget = useAppStore((state) => state.clearRunBoardTarget)
  const setActiveConversation = useAppStore((state) => state.setActiveConversation)
  const agents = useAppStore((state) => state.agents)
  const [conversationId, setConversationId] = useState<string | null>(targetConversationId ?? activeConversationId ?? conversations[0]?.id ?? null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedStageId, setSelectedStageId] = useState<AgentRunBoardStage['id'] | null>(null)
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [panelTab, setPanelTab] = useState<BoardPanelTab>('output')
  const [focusMode, setFocusMode] = useState(false)

  const selectedConversation = conversations.find((conversation) => conversation.id === conversationId) ?? null
  const cachedRuns = useAgentRunDebugList(conversationId)
  const selectedDetail = useAgentRunDebugDetail(selectedRunId)
  const liveRuns = useAppStore((state) => (conversationId ? state.runsByConv[conversationId] : undefined))
  const setAgentRunDebugList = useAppStore((state) => state.setAgentRunDebugList)
  const setAgentRunDebugDetail = useAppStore((state) => state.setAgentRunDebugDetail)

  const runs = useMemo(
    () => mergeLiveRuns(cachedRuns, liveRuns, agents),
    [agents, cachedRuns, liveRuns],
  )
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null
  const currentDetail = selectedDetail?.agentRun.id === selectedRun?.id ? selectedDetail : null
  const stages = useMemo(
    () => (currentDetail ? projectAgentRunBoardStages(currentDetail) : []),
    [currentDetail],
  )
  const graph = useMemo(() => buildAgentRunBoardGraph(stages), [stages])
  const activeStage = selectedStageId ? stages.find((stage) => stage.id === selectedStageId) ?? null : null
  const panelStage = activeStage ?? stages[0] ?? null
  const totalTokens = selectedRun?.usage
    ? selectedRun.usage.inputTokens + selectedRun.usage.outputTokens + selectedRun.usage.cacheCreationTokens + selectedRun.usage.cacheReadTokens
    : null

  const loadRuns = useCallback(async (targetConversationId: string, preferredRunId?: string | null) => {
    setLoadingRuns(true)
    setError(null)
    try {
      const nextRuns = await fetchAgentRuns(targetConversationId)
      setAgentRunDebugList(targetConversationId, nextRuns)
      setSelectedRunId((current) => {
        const targetId = preferredRunId ?? targetRunId
        return nextRuns.find((run) => run.id === targetId)?.id
          ?? nextRuns.find((run) => run.id === current)?.id
          ?? nextRuns[0]?.id
          ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingRuns(false)
    }
  }, [setAgentRunDebugList, setError, setLoadingRuns, setSelectedRunId, targetRunId])

  const loadDetail = useCallback(async (targetConversationId: string, runId: string) => {
    setLoadingDetail(true)
    setError(null)
    try {
      const detail = await fetchAgentRunDebugDetail(targetConversationId, runId)
      setAgentRunDebugDetail(runId, detail)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingDetail(false)
    }
  }, [setAgentRunDebugDetail, setError, setLoadingDetail])

  useEffect(() => {
    if (targetConversationId) setConversationId(targetConversationId)
  }, [targetConversationId])

  useEffect(() => {
    if (!targetConversationId && !targetRunId) return
    clearRunBoardTarget()
  }, [clearRunBoardTarget, targetConversationId, targetRunId])

  useEffect(() => {
    if (!conversationId && conversations[0]) setConversationId(conversations[0].id)
  }, [conversationId, conversations])

  useEffect(() => {
    if (!conversationId) return
    setSelectedRunId(null)
    setSelectedStageId(null)
    void loadRuns(conversationId, targetRunId)
  }, [conversationId, loadRuns, targetRunId])

  useEffect(() => {
    if (!targetRunId) return
    setSelectedRunId(targetRunId)
    setSelectedStageId(null)
  }, [targetRunId])

  useEffect(() => {
    if (!conversationId || !selectedRun?.id) return
    if (currentDetail?.agentRun.id === selectedRun.id) return
    void loadDetail(conversationId, selectedRun.id)
  }, [conversationId, currentDetail?.agentRun.id, loadDetail, selectedRun?.id])

  useEffect(() => {
    if (!conversationId || !selectedRun || selectedRun.status !== 'running') return
    const interval = window.setInterval(() => {
      void loadRuns(conversationId)
      void loadDetail(conversationId, selectedRun.id)
    }, 1800)
    return () => window.clearInterval(interval)
  }, [conversationId, loadDetail, loadRuns, selectedRun])

  const selectConversation = (nextId: string) => {
    setConversationId(nextId)
    setActiveConversation(nextId)
  }

  const selectRun = (runId: string) => {
    setSelectedRunId(runId)
    setSelectedStageId(null)
    setPanelTab('output')
  }

  const toggleFocusMode = () => {
    setFocusMode((current) => {
      const next = !current
      onFocusChange?.(next)
      return next
    })
  }

  const selectStage = (stageId: AgentRunBoardStage['id']) => {
    setSelectedStageId(stageId)
    setPanelTab(getBoardPanelTabForStage(stageId))
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--agenthub-surface-muted)]">
      <div className="sticky top-0 z-30 shrink-0 border-b border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] px-4 py-3 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span>分析</span>
              <span>/</span>
              <span>运行展板</span>
              {selectedConversation && (
                <>
                  <span>/</span>
                  <span className="max-w-[220px] truncate">{selectedConversation.title}</span>
                </>
              )}
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {selectedConversation?.title ?? '选择一个运行记录'}
              </h1>
              {selectedRun && <StatusPill status={selectedRun.status} />}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono text-slate-700 dark:text-slate-200">{selectedRun ? `Run ${shortId(selectedRun.id)}` : '暂无 Run'}</span>
              <span>{selectedRun ? formatRunDuration(selectedRun) : '-'}</span>
              <span>{totalTokens === null ? '-' : `${totalTokens.toLocaleString()} Tokens`}</span>
              <span>{selectedRun?.modelId ?? currentDetail?.snapshot?.agent.modelId ?? '-'}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={!selectedRun} title="重新运行">
              <RefreshCw className="size-3.5" />
              重新运行
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              title="刷新"
              aria-label="刷新"
              onClick={() => conversationId && void loadRuns(conversationId, selectedRunId)}
              disabled={!conversationId || loadingRuns}
            >
              <RefreshCw className={cn('size-3.5', loadingRuns && 'animate-spin')} />
            </Button>
            <Button type="button" size="icon-sm" variant="outline" title="复制 Run ID" aria-label="复制 Run ID" disabled={!selectedRun} onClick={() => selectedRun && void navigator.clipboard?.writeText(selectedRun.id)}>
              <Copy className="size-3.5" />
            </Button>
            <Button type="button" size="icon-sm" variant="outline" title="分享" aria-label="分享" disabled={!selectedRun}>
              <Share2 className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title={focusMode ? '退出全屏' : '全屏'}
              aria-label={focusMode ? '退出全屏' : '全屏'}
              onClick={toggleFocusMode}
            >
              {focusMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 flex shrink-0 items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <AlertTriangle className="size-3.5" />
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <button type="button" className="shrink-0" onClick={() => setError(null)} aria-label="关闭错误">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className={cn(
        'grid min-h-0 flex-1 grid-cols-1 overflow-hidden',
        focusMode
          ? 'grid-rows-[minmax(0,1fr)]'
          : 'md:grid-cols-[220px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)_220px]',
      )}>
        {!focusMode && <div className="hidden min-h-0 md:row-span-2 md:block">
          <RunHistoryRail
            conversations={conversations}
            selectedId={conversationId}
            onSelect={selectConversation}
            runs={runs}
            selectedRunId={selectedRun?.id ?? null}
            onSelectRun={selectRun}
          />
        </div>}

        <main className="relative min-w-0 overflow-hidden bg-[#f8fbff] dark:bg-[#11151c]">
          <div className="border-b border-[var(--agenthub-border)] bg-white px-3 py-2 md:hidden dark:bg-neutral-950/60">
            <select
              value={conversationId ?? ''}
              onChange={(event) => selectConversation(event.target.value)}
              className="h-8 w-full rounded-md border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] px-2 text-xs text-slate-700 outline-none dark:text-slate-200"
            >
              {conversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
              ))}
            </select>
          </div>

          <div className="h-[calc(100%-5.5rem)] p-3 md:h-[calc(100%-3rem)]">
            <div className="h-full overflow-hidden rounded-xl border border-[var(--agenthub-border)] bg-white shadow-sm dark:bg-neutral-950/50">
              {loadingDetail && !currentDetail ? (
                <div className="flex h-full items-center justify-center gap-2 text-xs text-slate-500">
                  <Loader2 className="size-4 animate-spin" />
                  正在加载运行展板
                </div>
              ) : currentDetail ? (
                <ReactFlow
                  nodes={graph.nodes}
                  edges={graph.edges}
                  nodeTypes={nodeTypes}
                  fitView
                  fitViewOptions={{ padding: 0.24, minZoom: 0.35, maxZoom: 1.2 }}
                  onInit={(instance) => {
                    requestAnimationFrame(() => {
                      instance.fitView({ padding: 0.24, minZoom: 0.35, maxZoom: 1.2 })
                    })
                  }}
                  onNodeClick={(_, node) => {
                    selectStage((node.data as AgentRunBoardNodeData).stage.id)
                  }}
                  proOptions={{ hideAttribution: true }}
                  className="agent-run-flow"
                >
                  <Background gap={22} size={1} color="rgba(148,163,184,.20)" />
                  <Controls showInteractive={false} />
                  <MiniMap
                    pannable
                    zoomable
                    nodeColor={(node) => toneColor((node.data as AgentRunBoardNodeData).stage.tone)}
                  />
                </ReactFlow>
              ) : (
                <EmptyBoard runs={runs} />
              )}
            </div>
          </div>

          {activeStage && currentDetail && (
            <div className="absolute inset-x-3 bottom-3 z-20 h-[min(420px,55%)] overflow-hidden rounded-xl border border-[var(--agenthub-border)] bg-white shadow-xl xl:hidden dark:bg-neutral-900">
              <BoardDetailDrawer detail={currentDetail} stage={activeStage} onClose={() => setSelectedStageId(null)} />
            </div>
          )}
        </main>

        {!focusMode && (
          <BottomPanel
            tab={panelTab}
            onTabChange={setPanelTab}
            detail={currentDetail}
            stage={panelStage}
            runs={runs}
            selectedRunId={selectedRun?.id ?? null}
            onSelectRun={selectRun}
          />
        )}
      </div>
    </div>
  )
}

export function AgentRunDebugBoardButton({ conversationId }: { conversationId: string }) {
  const openRunBoardTarget = useAppStore((state) => state.openRunBoardTarget)

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      title="打开运行展板"
      aria-label="打开运行展板"
      className="rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-neutral-800 dark:hover:text-slate-100"
      onClick={() => {
        openRunBoardTarget({ conversationId })
      }}
    >
      <Activity className="size-4" />
    </Button>
  )
}

function StageNode({ data, selected }: NodeProps<AgentRunBoardNode>) {
  const stage = data.stage
  return (
    <>
      <Handle type="target" position={Position.Left} className="!size-2 !border-0 !bg-slate-300" />
      <div
        className={cn(
          'w-[150px] rounded-xl border bg-white p-3 shadow-[0_10px_30px_rgba(31,55,86,.10)] transition dark:bg-neutral-900',
          selected && 'ring-2 ring-[var(--agenthub-accent)] ring-offset-2 dark:ring-offset-neutral-950',
          stage.status === 'running' && 'border-emerald-300 shadow-[0_0_0_4px_rgba(16,185,129,.10)]',
          stage.status === 'failed' || stage.status === 'aborted' ? 'border-rose-300' : '',
          stage.status === 'unavailable' ? 'border-dashed opacity-75' : '',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn('size-2.5 shrink-0 rounded-full', statusDotClass(stage.status))} />
            <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{stage.title}</span>
          </div>
          <span className="text-[10px] text-slate-400">{statusLabel(stage.status)}</span>
        </div>
        <div className="mt-2 line-clamp-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{stage.description}</div>
        <div className="mt-3 truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">{stage.metric}</div>
      </div>
      <Handle type="source" position={Position.Right} className="!size-2 !border-0 !bg-slate-300" />
    </>
  )
}

function BottomPanel({
  tab,
  onTabChange,
  detail,
  stage,
  runs,
  selectedRunId,
  onSelectRun,
}: {
  tab: BoardPanelTab
  onTabChange: (tab: BoardPanelTab) => void
  detail: AgentRunDebugDetail | null
  stage: AgentRunBoardStage | null
  runs: AgentRunDebugListItem[]
  selectedRunId: string | null
  onSelectRun: (runId: string) => void
}) {
  const tabs: Array<{ id: BoardPanelTab; label: string; icon: React.ReactNode }> = [
    { id: 'output', label: 'Output', icon: <Activity className="size-3.5" /> },
    { id: 'logs', label: 'Logs', icon: <FileCode2 className="size-3.5" /> },
    { id: 'trace', label: 'Tool Trace', icon: <TerminalSquare className="size-3.5" /> },
    { id: 'variables', label: 'Variables', icon: <GitBranch className="size-3.5" /> },
    { id: 'artifacts', label: 'Artifacts', icon: <PackageOpen className="size-3.5" /> },
    { id: 'history', label: 'History', icon: <Clock3 className="size-3.5" /> },
  ]

  return (
    <section className="hidden min-h-0 flex-col border-t border-[var(--agenthub-border)] bg-white md:flex dark:bg-neutral-900">
      <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--agenthub-border)] px-3">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            className={cn(
              'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition',
              tab === item.id
                ? 'bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/5 dark:hover:text-slate-200',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        {stage && <span className="ml-auto hidden truncate px-2 text-[11px] text-slate-400 lg:block">{stage.title} · {stage.metric}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!detail ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-500">选择一个 Run 后查看输出和证据</div>
        ) : tab === 'output' ? (
          <OutputPanel detail={detail} stage={stage} />
        ) : tab === 'trace' ? (
          <ToolTracePanel detail={detail} />
        ) : tab === 'variables' ? (
          <VariablesPanel detail={detail} />
        ) : tab === 'logs' ? (
          <LogsPanel detail={detail} />
        ) : tab === 'artifacts' ? (
          <ArtifactsPanel detail={detail} />
        ) : (
          <HistoryPanel runs={runs.filter((run) => run.id !== selectedRunId)} selectedRunId={selectedRunId} onSelect={onSelectRun} />
        )}
      </div>
    </section>
  )
}

function OutputPanel({ detail, stage }: { detail: AgentRunDebugDetail; stage: AgentRunBoardStage | null }) {
  const toolTrace = projectAgentRunToolTrace(detail)
  const artifacts = projectAgentRunArtifacts(detail)
  const usage = detail.agentRun.usage
  const totalTokens = usage
    ? usage.inputTokens + usage.outputTokens + usage.cacheCreationTokens + usage.cacheReadTokens
    : null
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <PanelMetric label="Status" value={statusLabel(detail.agentRun.status)} tone={toneForRunStatus(detail.agentRun.status)} />
        <PanelMetric label="Stage" value={stage?.title ?? '未选择'} />
        <PanelMetric label="Tool calls" value={`${toolTrace.length}`} />
        <PanelMetric label="Tokens" value={totalTokens === null ? '-' : totalTokens.toLocaleString()} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {artifacts.length > 0 ? artifacts.slice(0, 3).map((artifact) => (
          <div key={artifact.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-white/10 dark:bg-neutral-950/40">
            <FileCode2 className="size-3.5 text-[var(--agenthub-accent)]" />
            <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-200">{artifact.title ?? artifact.artifactId}</span>
            <span className="text-[10px] text-slate-400">{artifact.status ?? 'artifact'}</span>
          </div>
        )) : (
          <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-white/10">暂无产物输出</div>
        )}
      </div>
    </div>
  )
}

function ToolTracePanel({ detail }: { detail: AgentRunDebugDetail }) {
  const items = projectAgentRunToolTrace(detail)
  if (items.length === 0) return <PanelEmpty icon={<TerminalSquare className="size-4" />} text="当前 Run 没有工具调用" />
  return (
    <div className="relative max-w-4xl pl-6">
      <div className="absolute bottom-3 left-2.5 top-3 w-px bg-slate-200 dark:bg-white/10" />
      <div className="space-y-2">
        {items.map((item, index) => (
          <details key={item.callId} className="group relative rounded-lg border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-neutral-950/40">
            <span className={cn(
              'absolute -left-[1.72rem] top-3 z-10 size-2.5 rounded-full border-2 border-white dark:border-neutral-900',
              item.isError ? 'bg-rose-500' : item.completed ? 'bg-emerald-500' : 'bg-amber-400',
            )} />
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs">
              <span className="w-6 shrink-0 font-mono text-[10px] text-slate-400">{String(index + 1).padStart(2, '0')}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-200">{item.toolName}</span>
              <span className="text-[10px] text-slate-400">{item.completed ? '完成' : '进行中'}</span>
            </summary>
            <div className="space-y-2 border-t border-slate-200 px-3 py-2 dark:border-white/10">
              <CodeSnippet label="Args" value={summarizeAgentRunToolTraceArgs(item)} />
              {item.completed && <CodeSnippet label="Result" value={summarizeAgentRunToolTraceResult(item)} />}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}

function VariablesPanel({ detail }: { detail: AgentRunDebugDetail }) {
  const snapshot = detail.snapshot
  if (!snapshot) return <PanelEmpty icon={<GitBranch className="size-4" />} text="旧 Run 没有上下文快照" />
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <PanelMetric label="Workspace" value={snapshot.workspace.mode} />
      <PanelMetric label="History" value={`${snapshot.context.historyMessageCount} messages`} />
      <PanelMetric label="Memory" value={`${snapshot.context.workspaceMemoryNoteCount} notes`} />
      <PanelMetric label="Tools" value={`${snapshot.tools.toolNames.length}`} />
      <div className="sm:col-span-2 lg:col-span-4">
        <CodeSnippet label="Effective CWD" value={snapshot.workspace.effectiveCwd} />
      </div>
    </div>
  )
}

function LogsPanel({ detail }: { detail: AgentRunDebugDetail }) {
  const operations = projectAgentRunOperations(projectAgentRunToolTrace(detail))
  const rows = [
    ...operations.files.map((item) => ({ kind: item.kind, value: item.path, error: item.isError })),
    ...operations.commands.map((item) => ({ kind: item.exitCode === 0 ? 'command' : item.status ?? 'command', value: item.command, error: item.isError })),
    ...operations.network.map((item) => ({ kind: item.kind, value: item.target, error: item.isError })),
  ]
  if (rows.length === 0) return <PanelEmpty icon={<FileCode2 className="size-4" />} text="暂无文件、命令或网络日志" />
  return (
    <div className="grid gap-1.5 md:grid-cols-2">
      {rows.map((row, index) => (
        <div key={`${row.kind}-${row.value}-${index}`} className={cn('flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs dark:bg-neutral-950/40', row.error && 'bg-rose-50 text-rose-700')}>
          <span className="w-16 shrink-0 text-[10px] uppercase text-slate-400">{row.kind}</span>
          <span className="min-w-0 truncate font-mono text-[11px]">{row.value}</span>
        </div>
      ))}
    </div>
  )
}

function ArtifactsPanel({ detail }: { detail: AgentRunDebugDetail }) {
  const artifacts = projectAgentRunArtifacts(detail)
  if (artifacts.length === 0) return <PanelEmpty icon={<PackageOpen className="size-4" />} text="暂无 Artifact 或部署输出" />
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {artifacts.map((artifact) => (
        <div key={artifact.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-neutral-950/40">
          <div className="flex items-center gap-2">
            <FileCode2 className="size-4 text-[var(--agenthub-accent)]" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700 dark:text-slate-200">{artifact.title ?? artifact.artifactId}</span>
          </div>
          <div className="mt-2 text-[10px] text-slate-400">{artifact.status ?? artifact.kind} · {artifact.artifactId}</div>
        </div>
      ))}
    </div>
  )
}

function HistoryPanel({ runs, selectedRunId, onSelect }: { runs: AgentRunDebugListItem[]; selectedRunId: string | null; onSelect: (runId: string) => void }) {
  if (runs.length === 0) return <PanelEmpty icon={<Clock3 className="size-4" />} text="暂无历史 Run" />
  return (
    <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
      {runs.map((run) => (
        <button
          key={run.id}
          type="button"
          onClick={() => onSelect(run.id)}
          className={cn(
            'flex items-center gap-2 rounded-lg border px-3 py-2 text-left',
            run.id === selectedRunId ? 'border-blue-200 bg-blue-50/80' : 'border-slate-200 bg-slate-50 hover:bg-white',
          )}
        >
          <span className={cn('size-2 shrink-0 rounded-full', statusDotClass(run.status))} />
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-slate-600">{shortId(run.id)}</span>
          <span className="text-[10px] text-slate-400">{statusLabel(run.status)}</span>
        </button>
      ))}
    </div>
  )
}

function PanelMetric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: AgentRunBoardTone }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-neutral-950/40">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={cn('mt-1 text-sm font-semibold', toneTextClass(tone))}>{value}</div>
    </div>
  )
}

function PanelEmpty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex h-full min-h-16 items-center justify-center gap-2 text-xs text-slate-500">{icon}{text}</div>
}

function RunHistoryRail({
  conversations,
  selectedId,
  onSelect,
  runs,
  selectedRunId,
  onSelectRun,
}: {
  conversations: ReturnType<typeof useConversationList>
  selectedId: string | null
  onSelect: (id: string) => void
  runs: AgentRunDebugListItem[]
  selectedRunId: string | null
  onSelectRun: (runId: string) => void
}) {
  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-r border-[var(--agenthub-border)] bg-white dark:bg-neutral-900">
      <div className="shrink-0 border-b border-[var(--agenthub-border)] p-3">
        <div className="flex items-center gap-2">
          <Clock3 className="size-4 text-[var(--agenthub-accent)]" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">运行记录</h2>
        </div>
        <div className="mt-3">
          <select
            value={selectedId ?? ''}
            onChange={(event) => onSelect(event.target.value)}
            className="h-8 w-full rounded-md border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] px-2 text-xs text-slate-700 outline-none dark:text-slate-200"
          >
            {conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">最近运行</div>
        {runs.length === 0 ? (
          <div className="px-2 py-8 text-center text-xs text-slate-500">暂无运行</div>
        ) : (
          runs.map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => onSelectRun(run.id)}
              className={cn(
                'mb-1 w-full rounded-lg border px-2.5 py-2 text-left transition',
                run.id === selectedRunId
                  ? 'border-blue-200 bg-blue-50/80 dark:border-blue-400/30 dark:bg-blue-500/10'
                  : 'border-transparent hover:border-[var(--agenthub-border)] hover:bg-slate-50 dark:hover:bg-white/5',
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn('size-2 shrink-0 rounded-full', statusDotClass(run.status))} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-100">{run.id.length > 14 ? shortId(run.id) : run.id}</span>
                <span className="shrink-0 text-[10px] text-slate-400">{relativeTime(run.startedAt)}</span>
              </div>
              <div className="mt-1 truncate pl-4 text-[10px] text-slate-500">
                {run.status === 'running' ? '运行中' : run.status === 'failed' ? '失败' : '完成'} · {formatRunDuration(run)}
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  )
}

function BoardDetailDrawer({
  detail,
  stage,
  onClose,
}: {
  detail: AgentRunDebugDetail
  stage: AgentRunBoardStage
  onClose: () => void
}) {
  const toolTrace = projectAgentRunToolTrace(detail)
  const artifacts = projectAgentRunArtifacts(detail)
  const operations = projectAgentRunOperations(toolTrace)
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-[var(--agenthub-border)] bg-white dark:bg-neutral-900">
      <div className="shrink-0 border-b border-[var(--agenthub-border)] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--agenthub-accent)]">
              <GitBranch className="size-3.5" />
              Selected Stage
            </div>
            <h2 className="mt-2 truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{stage.title}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{stage.description}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100" aria-label="关闭详情">
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          <DetailMetric label="状态" value={statusLabel(stage.status)} tone={stage.tone} />
          <DetailMetric label="Run" value={shortId(detail.agentRun.id)} />
        </div>
        <DetailSection title="运行信息">
          <DetailRow label="Agent" value={detail.agentRun.agentName ?? detail.agentRun.agentId} />
          <DetailRow label="模型" value={detail.snapshot?.agent.modelId ?? detail.agentRun.modelId ?? '-'} />
          <DetailRow label="Run 状态" value={detail.agentRun.status} />
          <DetailRow label="工具调用" value={`${toolTrace.length} 次`} />
        </DetailSection>
        <DetailSection title="执行证据">
          <DetailRow label="文件" value={`${operations.files.length} 条`} />
          <DetailRow label="命令" value={`${operations.commands.length} 条`} />
          <DetailRow label="网络" value={`${operations.network.length} 条`} />
          <DetailRow label="子 Run" value={`${detail.childrenRuns.length} 个`} />
        </DetailSection>
        {toolTrace.length > 0 && (
          <DetailSection title="工具轨迹">
            <div className="space-y-2">
              {toolTrace.slice(0, 8).map((item) => (
                <details key={item.callId} className="rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-white/10 dark:bg-neutral-950/40">
                  <summary className="cursor-pointer list-none text-xs font-medium text-slate-700 dark:text-slate-200">
                    <span className="mr-2 text-[10px] text-slate-400">{item.completed ? '完成' : '进行中'}</span>
                    {item.toolName}
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    <CodeSnippet label="Args" value={summarizeAgentRunToolTraceArgs(item)} />
                    {item.completed && <CodeSnippet label="Result" value={summarizeAgentRunToolTraceResult(item)} />}
                  </div>
                </details>
              ))}
            </div>
          </DetailSection>
        )}
        {artifacts.length > 0 && (
          <DetailSection title="产出">
            <div className="space-y-1.5">
              {artifacts.map((artifact) => (
                <div key={artifact.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-white/10 dark:bg-neutral-950/40">
                  <FileCode2 className="size-3.5 text-[var(--agenthub-accent)]" />
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-200">{artifact.title ?? artifact.artifactId}</span>
                  <span className="text-[10px] text-slate-400">{artifact.status ?? artifact.kind}</span>
                </div>
              ))}
            </div>
          </DetailSection>
        )}
        <DetailSection title="关联消息">
          <DetailRow label="触发消息" value={detail.triggerMessage ? '可用' : '不可用'} />
          <DetailRow label="输出消息" value={`${detail.outputMessages.length} 条`} />
          <DetailRow label="Parent Run" value={detail.parentRun ? shortId(detail.parentRun.id) : '-'} />
        </DetailSection>
      </div>
    </aside>
  )
}

function EmptyBoard({ runs }: { runs: AgentRunDebugListItem[] }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-[var(--agenthub-accent)] dark:bg-blue-500/10">
        {runs.length === 0 ? <Bot className="size-6" /> : <Loader2 className="size-6 animate-spin" />}
      </div>
      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        {runs.length === 0 ? '当前会话还没有可展示的 Run' : '正在准备流程展板'}
      </div>
      <div className="max-w-xs text-xs leading-5 text-slate-500">运行阶段会按触发、上下文、规划、执行和产出依次展开。</div>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-neutral-950/40">
      <h3 className="mb-2 text-xs font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
      {children}
    </section>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[180px] truncate text-right font-medium text-slate-700 dark:text-slate-200">{value}</span>
    </div>
  )
}

function DetailMetric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: AgentRunBoardStage['tone'] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-white/10 dark:bg-neutral-950/40">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className={cn('mt-1 text-sm font-semibold', toneTextClass(tone))}>{value}</div>
    </div>
  )
}

function CodeSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-900 px-2 py-1.5 font-mono text-[10px] leading-4 text-slate-100">{value}</pre>
    </div>
  )
}

function mergeLiveRuns(
  cachedRuns: AgentRunDebugListItem[],
  liveRuns: Record<string, AgentRunRow> | undefined,
  agents: Record<string, { name: string }>,
): AgentRunDebugListItem[] {
  const merged = cachedRuns.map((run) => {
    const live = liveRuns?.[run.id]
    return live
      ? { ...run, status: live.status, error: live.error ?? run.error, usage: live.usage ?? run.usage, finishedAt: live.finishedAt ?? run.finishedAt }
      : run
  })
  const knownIds = new Set(merged.map((run) => run.id))
  for (const live of Object.values(liveRuns ?? {})) {
    if (knownIds.has(live.id)) continue
    merged.push({
      id: live.id,
      conversationId: live.conversationId,
      agentId: live.agentId,
      agentName: agents[live.agentId]?.name ?? null,
      adapterName: null,
      modelId: null,
      triggerMessageId: live.triggerMessageId,
      parentRunId: live.parentRunId ?? null,
      status: live.status,
      error: live.error ?? null,
      usage: live.usage ?? null,
      startedAt: live.startedAt,
      finishedAt: live.finishedAt ?? null,
      hasDebugSnapshot: false,
    })
  }
  return merged.sort((a, b) => b.startedAt - a.startedAt)
}

function statusDotClass(status: AgentRunBoardStageStatus | AgentRunDebugListItem['status']): string {
  if (status === 'complete') return 'bg-emerald-500'
  if (status === 'running') return 'bg-blue-500 animate-pulse'
  if (status === 'failed' || status === 'aborted') return 'bg-rose-500'
  if (status === 'pending' || status === 'queued') return 'bg-amber-400'
  return 'bg-slate-300'
}

function statusLabel(status: AgentRunBoardStageStatus | AgentRunDebugListItem['status']): string {
  if (status === 'complete') return '完成'
  if (status === 'running') return '运行中'
  if (status === 'failed') return '失败'
  if (status === 'aborted') return '中止'
  if (status === 'pending' || status === 'queued') return '等待'
  return '不可用'
}

function toneForRunStatus(status: AgentRunDebugListItem['status']): AgentRunBoardTone {
  if (status === 'complete') return 'success'
  if (status === 'running') return 'info'
  if (status === 'failed' || status === 'aborted') return 'danger'
  return 'warning'
}

function toneTextClass(tone: AgentRunBoardStage['tone']): string {
  if (tone === 'success') return 'text-emerald-600 dark:text-emerald-300'
  if (tone === 'info') return 'text-blue-600 dark:text-blue-300'
  if (tone === 'warning') return 'text-amber-600 dark:text-amber-300'
  if (tone === 'danger') return 'text-rose-600 dark:text-rose-300'
  return 'text-slate-700 dark:text-slate-200'
}

function toneColor(tone: AgentRunBoardStage['tone']): string {
  if (tone === 'success') return '#10b981'
  if (tone === 'info') return '#3b82f6'
  if (tone === 'warning') return '#f59e0b'
  if (tone === 'danger') return '#ef4444'
  return '#94a3b8'
}

function relativeTime(value: number): string {
  const diff = Math.max(0, Date.now() - value)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时`
  return `${Math.floor(hours / 24)} 天`
}

function formatRunDuration(run: Pick<AgentRunDebugListItem, 'startedAt' | 'finishedAt'>): string {
  if (run.finishedAt === null) return '-'
  const value = Math.max(0, run.finishedAt - run.startedAt)
  if (value < 1000) return `${value}ms`
  const seconds = Math.floor(value / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`
}

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 10)}…` : id
}

function StatusPill({ status }: { status: AgentRunDebugListItem['status'] }) {
  const tone = status === 'complete' ? 'success' : status === 'running' ? 'info' : status === 'failed' || status === 'aborted' ? 'danger' : 'warning'
  return <span className={cn('agenthub-status-badge', `agenthub-status-${tone}`)}>{statusLabel(status)}</span>
}
