'use client'

import {
  Activity,
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Copy,
  Cpu,
  Database,
  FileCode2,
  GitBranch,
  Loader2,
  Maximize2,
  Minimize2,
  PackageOpen,
  Pause,
  Play,
  RefreshCw,
  Search,
  Share2,
  TerminalSquare,
  Wrench,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type ReactFlowInstance,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'

import { Button } from '@/components/ui/button'
import {
  abortRun,
  fetchAgentRunDebugDetail,
  fetchAgentRunDebugEvents,
  fetchAgentRuns,
  fetchConversationAgentRunDebugEvents,
  fetchTerminalEventsForSession,
  fetchTerminalSessionsForRun,
  fetchMessages,
  regenerateLastResponse,
  writeTerminalInput,
} from '@/lib/api'
import {
  projectAgentRunArtifacts,
  projectAgentRunAskUserInteractions,
  projectAgentRunOperations,
  projectAgentRunTaskResults,
  projectAgentRunTimeline,
  projectAgentRunToolTrace,
  summarizeAgentRunToolTraceArgs,
  summarizeAgentRunToolTraceResult,
  type AgentRunToolTraceItem,
} from '@/lib/agent-run-debug-projection'
import {
  buildAgentRunDebuggerGraph,
  buildAgentRunInspectorViewModel,
  buildAgentRunToolInspectorViewModel,
  buildAgentRunSessionDebuggerGraph,
  describeAgentRunDebugEvent,
  focusAgentRunDebuggerGraph,
  getBoardPanelTabForCanvasView,
  getBoardPanelTabForDebuggerNode,
  getBoardPanelTabForStage,
  getDebuggerNodeIdForDebugEvent,
  getVisibleAgentDebuggerSteps,
  projectAgentRunTerminalOutput,
  shouldInitializeDebuggerSelection,
  projectAgentRunBoardStages,
  rootTaskLabel,
  summarizeRunDisplayTitle,
  type AgentRunDebuggerNodeData,
  type AgentRunDebuggerGraph,
  type AgentRunDebuggerNode,
  type AgentRunDebuggerStep,
  type AgentRunBoardPanelTab,
  type AgentRunBoardStage,
  type AgentRunBoardStageStatus,
  type AgentRunBoardTone,
  type AgentRunDebuggerCanvasView,
  type AgentRunDebuggerStatus,
  type AgentRunTerminalOutput,
  type AgentRunInspectorMetric,
  type AgentRunInspectorViewModel,
  type AgentRunToolInspectorViewModel,
  type AgentRunInspectorTask,
} from '@/lib/agent-run-debug-board'
import {
  filterAgentRunTimeline,
  type AgentRunTimelineFilter,
} from '@/lib/agent-run-debug-view'
import { cn } from '@/lib/utils'
import type { AgentRunRow, ConversationWithMeta } from '@/db/schema'
import {
  useAgentRunDebugDetail,
  useAgentRunDebugEvents,
  useAgentRunDebugList,
  useAppStore,
  useMessagesForConversation,
  useConversationList,
  useTerminalEventsBySession,
  useTerminalSessionsForRun,
} from '@/stores/app-store'
import type { AgentRunDebugDetail, AgentRunDebugEventRecord, AgentRunDebugListItem, MessageRecord, TerminalEventRecord, TerminalSessionRecord } from '@/shared/types'

const nodeTypes: NodeTypes = {
  runDebuggerNode: DebuggerNode,
}

type BoardPanelTab = AgentRunBoardPanelTab
type InspectorTab = 'terminal' | 'logs' | 'trace' | 'variables' | 'artifacts'
type CanvasGraphScope = 'session' | 'run'
type InspectorWorkbenchViewModel = AgentRunInspectorViewModel | AgentRunToolInspectorViewModel

const TIMELINE_FILTER_OPTIONS: Array<{ id: AgentRunTimelineFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'agent', label: 'Agent' },
  { id: 'tools', label: '工具' },
  { id: 'errors', label: '错误' },
]

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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [inspectorRunId, setInspectorRunId] = useState<string | null>(null)
  const [selectedToolCallId, setSelectedToolCallId] = useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true)
  const [pendingInspectorEvent, setPendingInspectorEvent] = useState<AgentRunDebugEventRecord | null>(null)
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [pausingRun, setPausingRun] = useState(false)
  const [rerunningRun, setRerunningRun] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [panelTab, setPanelTab] = useState<BoardPanelTab>('output')
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('logs')
  const [canvasView, setCanvasView] = useState<AgentRunDebuggerCanvasView>('graph')
  const [canvasGraphScope, setCanvasGraphScope] = useState<CanvasGraphScope>('session')
  const [expandedSessionRunIds, setExpandedSessionRunIds] = useState<readonly string[] | null>(null)
  const [timelineFilter, setTimelineFilter] = useState<AgentRunTimelineFilter>('all')
  const [focusMode, setFocusMode] = useState(false)
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<AgentRunDebuggerNode> | null>(null)

  const selectedConversation = conversations.find((conversation) => conversation.id === conversationId) ?? null
  const conversationMessages = useMessagesForConversation(conversationId ?? '')
  const cachedRuns = useAgentRunDebugList(conversationId)
  const selectedDetail = useAgentRunDebugDetail(selectedRunId)
  const selectedInspectorDetail = useAgentRunDebugDetail(inspectorRunId)
  const selectedDebugEvents = useAgentRunDebugEvents(selectedRunId)
  const selectedInspectorDebugEvents = useAgentRunDebugEvents(inspectorRunId)
  const selectedTerminalSessions = useTerminalSessionsForRun(selectedRunId)
  const selectedInspectorTerminalSessions = useTerminalSessionsForRun(inspectorRunId)
  const terminalEventsBySession = useTerminalEventsBySession()
  const debugEventsByRun = useAppStore((state) => state.agentRunDebugEventsByRun)
  const liveRuns = useAppStore((state) => (conversationId ? state.runsByConv[conversationId] : undefined))
  const setAgentRunDebugList = useAppStore((state) => state.setAgentRunDebugList)
  const setAgentRunDebugDetail = useAppStore((state) => state.setAgentRunDebugDetail)
  const setAgentRunDebugEvents = useAppStore((state) => state.setAgentRunDebugEvents)
  const setTerminalSessionsForRun = useAppStore((state) => state.setTerminalSessionsForRun)
  const setTerminalEventsForSession = useAppStore((state) => state.setTerminalEventsForSession)
  const setMessagesForConversation = useAppStore((state) => state.setMessagesForConversation)

  const runs = useMemo(
    () => mergeLiveRuns(cachedRuns, liveRuns, agents),
    [agents, cachedRuns, liveRuns],
  )
  const conversationDebugEvents = useMemo(
    () => collectConversationDebugEvents(runs, debugEventsByRun),
    [debugEventsByRun, runs],
  )
  const selectedRun = selectedRunId
    ? runs.find((run) => run.id === selectedRunId) ?? null
    : runs[0] ?? null
  const currentDetail = selectedDetail?.agentRun.id === selectedRun?.id ? selectedDetail : null
  const stages = useMemo(
    () => (currentDetail ? projectAgentRunBoardStages(currentDetail) : []),
    [currentDetail],
  )
  const graph = useMemo<AgentRunDebuggerGraph>(
    () => (currentDetail ? buildAgentRunDebuggerGraph(currentDetail) : { nodes: [], edges: [] }),
    [currentDetail],
  )
  const sessionExpandedRunIds = useMemo(
    () => expandedSessionRunIds ?? (selectedRunId ? [selectedRunId] : []),
    [expandedSessionRunIds, selectedRunId],
  )
  const sessionGraph = useMemo<AgentRunDebuggerGraph>(
    () => buildAgentRunSessionDebuggerGraph({
      messages: conversationMessages,
      runs,
      currentDetail,
      expandedRunIds: sessionExpandedRunIds,
    }),
    [conversationMessages, currentDetail, runs, sessionExpandedRunIds],
  )
  const activeGraph = canvasGraphScope === 'session' ? sessionGraph : graph
  const canRenderCanvas = canvasGraphScope === 'session'
    ? activeGraph.nodes.length > 0
    : Boolean(currentDetail)
  const focusedGraph = useMemo<AgentRunDebuggerGraph>(
    () => focusAgentRunDebuggerGraph(activeGraph, timelineFilter),
    [activeGraph, timelineFilter],
  )
  const workerAgentCount = useMemo(
    () => activeGraph.nodes.filter((node) => node.data.kind === 'agent' && node.data.agent?.role === 'worker').length,
    [activeGraph.nodes],
  )
  const latestTopLevelRun = runs.find((run) => run.parentRunId === null) ?? null
  const canRerunSelected = Boolean(selectedRun && latestTopLevelRun?.id === selectedRun.id && selectedRun.status !== 'running')
  const activeStage = selectedStageId ? stages.find((stage) => stage.id === selectedStageId) ?? null : null
  const panelStage = activeStage ?? stages[0] ?? null
  const selectedNode = selectedNodeId ? activeGraph.nodes.find((node) => node.id === selectedNodeId) ?? null : null
  const inspectorDetail = inspectorRunId && selectedInspectorDetail?.agentRun.id === inspectorRunId
    ? selectedInspectorDetail
    : currentDetail
  const inspectorDebugEvents = inspectorRunId ? selectedInspectorDebugEvents : selectedDebugEvents
  const inspectorTerminalSessions = inspectorRunId ? selectedInspectorTerminalSessions : selectedTerminalSessions
  const headerTitle = currentDetail
    ? rootTaskLabel(currentDetail, [
        currentDetail.snapshot?.agent.name,
        currentDetail.agentRun.agentName,
        ...currentDetail.childrenRuns.map((run) => run.agentName),
      ])
    : selectedConversation
      ? summarizeRunDisplayTitle(selectedConversation.title)
      : '选择一个运行记录'
  const totalTokens = selectedRun?.usage
    ? selectedRun.usage.inputTokens + selectedRun.usage.outputTokens + selectedRun.usage.cacheCreationTokens + selectedRun.usage.cacheReadTokens
    : null

  const loadRuns = useCallback(async (targetConversationId: string, preferredRunId?: string | null) => {
    setLoadingRuns(true)
    setError(null)
    try {
      const cursorTarget = preferredRunId ?? targetRunId
      const [allRuns, allEvents] = await Promise.all([
        fetchAgentRuns(targetConversationId),
        fetchConversationAgentRunDebugEvents(targetConversationId),
      ])
      setAgentRunDebugList(targetConversationId, allRuns)
      setDebugEventsByRun(allEvents, setAgentRunDebugEvents)
      if (cursorTarget) {
        setSelectedRunId((current) => {
          const availableRuns = useAppStore.getState().agentRunDebugByConv[targetConversationId] ?? []
          if (availableRuns.some((run) => run.id === cursorTarget)) return cursorTarget
          if (current && availableRuns.some((run) => run.id === current)) return current
          return availableRuns[0]?.id ?? null
        })
      } else {
        setSelectedRunId((current) => {
          if (current) return current
          const availableRuns = useAppStore.getState().agentRunDebugByConv[targetConversationId] ?? []
          return availableRuns[0]?.id ?? null
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingRuns(false)
    }
  }, [
    setError,
    setLoadingRuns,
    setAgentRunDebugList,
    setAgentRunDebugEvents,
    setSelectedRunId,
    targetRunId,
  ])

  const loadDetail = useCallback(async (targetConversationId: string, runId: string) => {
    setLoadingDetail(true)
    setError(null)
    try {
      const [detail, events, terminalSessions] = await Promise.all([
        fetchAgentRunDebugDetail(targetConversationId, runId),
        fetchAgentRunDebugEvents(targetConversationId, runId),
        fetchTerminalSessionsForRun(targetConversationId, runId),
      ])
      setAgentRunDebugDetail(runId, detail)
      setAgentRunDebugEvents(runId, events)
      setTerminalSessionsForRun(runId, terminalSessions)
      await Promise.all(terminalSessions.map(async (session) => {
        const terminalEvents = await fetchTerminalEventsForSession(targetConversationId, session.id)
        setTerminalEventsForSession(session.id, terminalEvents)
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingDetail(false)
    }
  }, [setAgentRunDebugDetail, setAgentRunDebugEvents, setError, setLoadingDetail, setTerminalEventsForSession, setTerminalSessionsForRun])

  const submitTerminalInput = useCallback(async (sessionId: string, input: string) => {
    if (!conversationId) return
    const event = await writeTerminalInput(conversationId, sessionId, input)
    const existing = useAppStore.getState().terminalEventsBySession[sessionId] ?? []
    setTerminalEventsForSession(sessionId, [...existing, event])
  }, [conversationId, setTerminalEventsForSession])

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
    setSelectedNodeId(null)
    setInspectorRunId(null)
    setSelectedToolCallId(null)
    setPendingInspectorEvent(null)
    setInspectorOpen(false)
    setInspectorTab('logs')
    setPanelTab('output')
    setCanvasView('graph')
    setCanvasGraphScope('session')
    setExpandedSessionRunIds(null)
    setTimelineFilter('all')
    void loadRuns(conversationId, targetRunId)
  }, [conversationId, loadRuns, targetRunId])

  useEffect(() => {
    if (!targetRunId) return
    setSelectedRunId(targetRunId)
    setSelectedStageId(null)
    setSelectedNodeId(null)
    setInspectorRunId(null)
    setSelectedToolCallId(null)
    setPendingInspectorEvent(null)
    setInspectorOpen(false)
    setInspectorTab('logs')
    setCanvasView('graph')
    setCanvasGraphScope('session')
    setExpandedSessionRunIds([targetRunId])
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
    setInspectorOpen(false)
    setSelectedToolCallId(null)
  }

  const selectRun = (runId: string) => {
    setSelectedRunId(runId)
    setSelectedStageId(null)
    setSelectedNodeId(null)
    setInspectorRunId(null)
    setSelectedToolCallId(null)
    setPendingInspectorEvent(null)
    setInspectorOpen(false)
    setInspectorTab('logs')
    setPanelTab('output')
    setCanvasView('graph')
    setCanvasGraphScope('session')
    setExpandedSessionRunIds([runId])
  }

  const selectTimelineRun = (runId: string) => {
    selectRun(runId)
    setInspectorOpen(true)
    setBottomPanelOpen(true)
    setInspectorTab('logs')
    setPanelTab('logs')
  }

  const toggleFocusMode = () => {
    setFocusMode((current) => {
      const next = !current
      onFocusChange?.(next)
      return next
    })
  }

  const pauseSelectedRun = async () => {
    if (!selectedRun || selectedRun.status !== 'running' || !conversationId || pausingRun) return
    setPausingRun(true)
    setError(null)
    try {
      await abortRun(selectedRun.id)
      await loadRuns(conversationId, selectedRun.id)
      await loadDetail(conversationId, selectedRun.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPausingRun(false)
    }
  }

  const rerunSelectedRun = async () => {
    if (!conversationId || !canRerunSelected || rerunningRun) return
    setRerunningRun(true)
    setError(null)
    try {
      const result = await regenerateLastResponse(conversationId)
      const nextRunId = result.runIds[0] ?? null
      if (nextRunId) setSelectedRunId(nextRunId)
      await loadRuns(conversationId, nextRunId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRerunningRun(false)
    }
  }

  const selectStage = (stageId: AgentRunBoardStage['id']) => {
    setSelectedStageId(stageId)
    setPanelTab(getBoardPanelTabForStage(stageId))
    setBottomPanelOpen(true)
  }

  const selectCanvasView = (view: AgentRunDebuggerCanvasView) => {
    setCanvasView(view)
    setPanelTab(getBoardPanelTabForCanvasView(view))
  }

  const selectCanvasGraphScope = (scope: CanvasGraphScope) => {
    setCanvasGraphScope(scope)
    setCanvasView('graph')
    setPanelTab('trace')
    setBottomPanelOpen(true)
  }

  const toggleSelectedRunExpansion = () => {
    if (!selectedRunId) return
    setExpandedSessionRunIds((current) => {
      const base = current ?? [selectedRunId]
      if (base.includes(selectedRunId)) return base.filter((runId) => runId !== selectedRunId)
      return [selectedRunId]
    })
  }

  useEffect(() => {
    if (!conversationId) return
    let cancelled = false
    fetchMessages(conversationId)
      .then((messages) => {
        if (!cancelled) setMessagesForConversation(conversationId, messages)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [conversationId, setMessagesForConversation])

  useEffect(() => {
    if (!currentDetail || activeGraph.nodes.length === 0) return
    if (!shouldInitializeDebuggerSelection({ inspectorOpen, selectedNodeId, graph: activeGraph })) return
    const defaultNode =
      activeGraph.nodes.find((node) => node.data.kind === 'agent' && node.data.agent?.role === 'worker')
      ?? activeGraph.nodes.find((node) => node.data.kind === 'agent')
      ?? activeGraph.nodes[0]
    setSelectedNodeId(defaultNode?.id ?? null)
    setInspectorTab(defaultNode && currentDetail ? getPreferredInspectorTab(defaultNode, currentDetail, selectedDebugEvents) : 'logs')
  }, [activeGraph, currentDetail, inspectorOpen, selectedDebugEvents, selectedNodeId])

  useEffect(() => {
    if (!pendingInspectorEvent || !currentDetail || pendingInspectorEvent.runId !== currentDetail.agentRun.id) return
    const nodeId = getDebuggerNodeIdForDebugEvent(activeGraph, pendingInspectorEvent)
    if (nodeId && activeGraph.nodes.some((node) => node.id === nodeId)) setSelectedNodeId(nodeId)
    setInspectorRunId(null)
    setInspectorOpen(true)
    setBottomPanelOpen(true)
    setPanelTab(pendingInspectorEvent.type.includes('.tool.') ? 'trace' : 'logs')
    setInspectorTab(pendingInspectorEvent.type.includes('.tool.') ? 'trace' : pendingInspectorEvent.type === 'run.debug.terminal.output' ? 'terminal' : 'logs')
    setPendingInspectorEvent(null)
  }, [activeGraph, currentDetail, pendingInspectorEvent])

  const selectGraphNode = (nodeId: string) => {
    const node = activeGraph.nodes.find((item) => item.id === nodeId)
    if (!node) return
    if (node.data.kind === 'run' && node.data.run?.id && node.data.run.id !== selectedRunId) {
      selectRun(node.data.run.id)
      setSelectedNodeId(nodeId)
      setInspectorOpen(true)
      setInspectorTab('logs')
      setPanelTab('output')
      setBottomPanelOpen(true)
      setSelectedToolCallId(null)
      if (canvasGraphScope === 'session') {
        setExpandedSessionRunIds([node.data.run.id])
      }
      return
    }
    setSelectedNodeId(nodeId)
    setInspectorOpen(true)
    setInspectorTab(currentDetail ? getPreferredInspectorTab(node, currentDetail, selectedDebugEvents) : 'logs')
    setPanelTab(getBoardPanelTabForDebuggerNode(node.data.kind))
    setBottomPanelOpen(true)
    setSelectedToolCallId(null)
    const runId = node.data.agent?.runId ?? node.data.run?.id ?? null
    const nextInspectorRunId = runId && runId !== currentDetail?.agentRun.id ? runId : null
    setInspectorRunId(nextInspectorRunId)
    if (conversationId && nextInspectorRunId && selectedInspectorDetail?.agentRun.id !== nextInspectorRunId) {
      void loadDetail(conversationId, nextInspectorRunId)
    }
    void flowInstance?.setCenter(node.position.x + 140, node.position.y + 90, {
      zoom: 0.82,
      duration: 280,
    })
  }

  const selectDebugEvent = (event: AgentRunDebugEventRecord) => {
    if (event.runId !== selectedRunId) {
      selectRun(event.runId)
      setPendingInspectorEvent(event)
      setInspectorOpen(true)
      setBottomPanelOpen(true)
      setPanelTab('logs')
      setInspectorTab(event.type.includes('.tool.') ? 'trace' : event.type === 'run.debug.terminal.output' ? 'terminal' : 'logs')
      setSelectedToolCallId(event.toolCallId ?? null)
      return
    }
    const nodeId = getDebuggerNodeIdForDebugEvent(activeGraph, event)
    if (nodeId) {
      setCanvasView('graph')
      selectGraphNode(nodeId)
    }
    else setInspectorOpen(true)
    setBottomPanelOpen(true)
    setPanelTab('logs')
    if (event.type.includes('.tool.')) setInspectorTab('trace')
    else if (event.type === 'run.debug.terminal.output') setInspectorTab('terminal')
    else setInspectorTab('logs')
    setSelectedToolCallId(event.toolCallId ?? null)
  }

  const selectToolCall = (callId: string) => {
    const event = [...selectedDebugEvents, ...conversationDebugEvents].find((item) => item.toolCallId === callId)
    setSelectedToolCallId(callId)
    if (event && event.runId !== selectedRunId) {
      selectRun(event.runId)
      setSelectedToolCallId(callId)
      setPendingInspectorEvent(event)
      setInspectorOpen(true)
      setBottomPanelOpen(true)
      setPanelTab('trace')
      setInspectorTab(event.type === 'run.debug.terminal.output' ? 'terminal' : 'trace')
      return
    }

    let nodeId: string | null = null
    if (event) {
      nodeId = getDebuggerNodeIdForDebugEvent(activeGraph, event) ?? getDebuggerNodeIdForDebugEvent(graph, event)
    }
    if (!nodeId) {
      nodeId =
        selectedNode?.data.kind === 'agent'
          ? selectedNode.id
          : activeGraph.nodes.find((node) => node.data.kind === 'agent' && node.data.agent?.runId === currentDetail?.agentRun.id)?.id
            ?? activeGraph.nodes.find((node) => node.data.kind === 'agent' && node.data.agent?.agentId === currentDetail?.agentRun.agentId)?.id
            ?? activeGraph.nodes.find((node) => node.data.kind === 'agent')?.id
            ?? null
    }
    if (nodeId) {
      const node = activeGraph.nodes.find((item) => item.id === nodeId) ?? graph.nodes.find((item) => item.id === nodeId) ?? null
      setSelectedNodeId(nodeId)
      const nextInspectorRunId = node?.data.agent?.runId && node.data.agent.runId !== currentDetail?.agentRun.id ? node.data.agent.runId : null
      setInspectorRunId(nextInspectorRunId)
      if (conversationId && nextInspectorRunId && selectedInspectorDetail?.agentRun.id !== nextInspectorRunId) {
        void loadDetail(conversationId, nextInspectorRunId)
      }
      void flowInstance?.setCenter((node?.position.x ?? 0) + 140, (node?.position.y ?? 0) + 90, {
        zoom: 0.82,
        duration: 280,
      })
    }
    setInspectorOpen(true)
    setInspectorTab(event?.type === 'run.debug.terminal.output' ? 'terminal' : 'trace')
    setPanelTab('trace')
    setBottomPanelOpen(true)
  }

  const openBottomPanelTab = (tab: BoardPanelTab) => {
    setPanelTab(tab)
    setBottomPanelOpen(true)
  }

  const closeInspector = () => {
    setInspectorOpen(false)
    setSelectedNodeId(null)
    setSelectedToolCallId(null)
  }

  const visibleInspectorDetail = inspectorDetail ?? currentDetail
  const showInspector = !focusMode && inspectorOpen && Boolean(visibleInspectorDetail)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--agenthub-surface-muted)]">
      <div className="sticky top-0 z-30 shrink-0 border-b border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] px-4 py-3 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-4 flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950">
              <GitBranch className="size-5" />
            </div>
            <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span>分析</span>
              <span>/</span>
              <span>运行调试</span>
              <span>/</span>
              <span className="max-w-[260px] truncate">{headerTitle}</span>
              {selectedRun && (
                <>
                  <span>/</span>
                  <span>{formatRunLabel(selectedRun.id)}</span>
                </>
              )}
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {headerTitle}
              </h1>
              {selectedRun && <StatusPill status={selectedRun.status} />}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono text-slate-700 dark:text-slate-200">{selectedRun ? formatRunLabel(selectedRun.id) : '暂无 Run'}</span>
              <span>{selectedRun ? formatRunDuration(selectedRun) : '-'}</span>
              <span>{totalTokens === null ? '-' : `${totalTokens.toLocaleString()} Tokens`}</span>
              <span>Cost -</span>
              <span>{selectedRun?.modelId ?? currentDetail?.snapshot?.agent.modelId ?? '-'}</span>
              <span>{workerAgentCount ? `${workerAgentCount} Agents` : '-'}</span>
            </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-[var(--agenthub-accent)] text-white hover:bg-[var(--agenthub-accent-hover)]"
              disabled={!canRerunSelected || rerunningRun}
              title={canRerunSelected ? '重新运行最后一次回复' : '只能重新运行当前会话最后一次顶层 Run'}
              onClick={() => void rerunSelectedRun()}
            >
              {rerunningRun ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />}
              重新运行
            </Button>
            {selectedRun?.status === 'running' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                title="暂停"
                aria-label="暂停"
                onClick={() => void pauseSelectedRun()}
                disabled={pausingRun}
              >
                <Pause className="size-3.5" />
                暂停
              </Button>
            )}
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

      {!focusMode && currentDetail && (
        <StageRail
          stages={stages}
          activeStageId={selectedStageId}
          onSelectStage={selectStage}
        />
      )}

      <div className={cn(
        'grid min-h-0 flex-1 grid-cols-1 overflow-hidden',
        focusMode
          ? 'grid-cols-1'
          : showInspector
            ? 'md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_340px]'
            : 'md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]',
      )}>
        {!focusMode && (
          <div className="hidden h-full min-h-0 md:block">
            <ConversationRail
              conversations={conversations}
              selectedId={conversationId}
              onSelect={selectConversation}
              selectedRunId={selectedRun?.id ?? null}
              runs={runs}
              loading={loadingRuns}
            />
          </div>
        )}

        <main className="relative flex min-w-0 flex-col overflow-hidden bg-[#f8fbff] dark:bg-[#11151c]">
          <div className="border-b border-[var(--agenthub-border)] bg-white px-3 py-2 md:hidden dark:bg-neutral-950/60">
            <div className="space-y-2">
              <select
                value={conversationId ?? ''}
                onChange={(event) => selectConversation(event.target.value)}
                className="h-8 w-full rounded-md border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] px-2 text-xs text-slate-700 outline-none dark:text-slate-200"
              >
                {conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
                ))}
              </select>
              <SegmentedFilter
                value={timelineFilter}
                options={TIMELINE_FILTER_OPTIONS}
                onChange={setTimelineFilter}
              />
            </div>
          </div>

          <div className="min-h-[360px] flex-1 p-3 pb-2">
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--agenthub-border)] bg-white shadow-sm dark:bg-neutral-950/50">
              {conversationId && (
                <CanvasToolbar
                  graphScope={canvasGraphScope}
                  onGraphScopeChange={selectCanvasGraphScope}
                  currentRunExpanded={Boolean(selectedRunId && sessionExpandedRunIds.includes(selectedRunId))}
                  onToggleCurrentRunExpansion={toggleSelectedRunExpansion}
                  view={canvasView}
                  onViewChange={selectCanvasView}
                  filter={timelineFilter}
                  onFilterChange={setTimelineFilter}
                />
              )}
              {(loadingRuns || loadingDetail) && !canRenderCanvas ? (
                <div className="flex h-full items-center justify-center gap-2 text-xs text-slate-500">
                  <Loader2 className="size-4 animate-spin" />
                  正在加载会话任务图
                </div>
              ) : canRenderCanvas ? (
                <div className="min-h-0 flex-1">
                  {canvasView === 'graph' ? (
                    <ReactFlow
                      nodes={focusedGraph.nodes}
                      edges={focusedGraph.edges}
                      nodeTypes={nodeTypes}
                      fitView
                      fitViewOptions={{ padding: 0.2, minZoom: 0.42, maxZoom: 1.1 }}
                      onInit={(instance) => {
                        setFlowInstance(instance)
                        requestAnimationFrame(() => {
                          instance.fitView({ padding: 0.2, minZoom: 0.42, maxZoom: 1.1 })
                        })
                      }}
                      onNodeClick={(_, node) => {
                        selectGraphNode(node.id)
                      }}
                      proOptions={{ hideAttribution: true }}
                      className="agent-run-flow"
                    >
                      <Background gap={22} size={1} color="rgba(148,163,184,.20)" />
                      <Controls showInteractive={false} />
                    </ReactFlow>
                  ) : canvasView === 'timeline' ? (
                    <div className="h-full min-h-0 p-4">
                      <EventTimelinePanel
                        detail={canvasGraphScope === 'session' ? null : currentDetail}
                        messages={conversationMessages}
                        runs={runs}
                        debugEvents={canvasGraphScope === 'session' ? conversationDebugEvents : selectedDebugEvents}
                        filter={timelineFilter}
                        onSelectDebugEvent={selectDebugEvent}
                        onSelectRun={selectTimelineRun}
                      />
                    </div>
                  ) : (
                    <div className="h-full min-h-0 p-4">
                      <RawEventStreamPanel
                        debugEvents={canvasGraphScope === 'session' ? conversationDebugEvents : selectedDebugEvents}
                        filter={timelineFilter}
                        onSelectDebugEvent={selectDebugEvent}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <EmptyBoard runs={runs} />
              )}
            </div>
          </div>

          {!focusMode && bottomPanelOpen && (
            <div className="shrink-0 px-3 pb-3">
              <BottomPanel
                tab={panelTab}
                onTabChange={openBottomPanelTab}
                detail={currentDetail}
                diagnosticDetail={inspectorDetail ?? currentDetail}
                stage={panelStage}
                runs={runs}
                selectedRunId={selectedRun?.id ?? null}
                onSelectRun={selectRun}
                debugEvents={selectedDebugEvents}
                onSelectToolCall={selectToolCall}
                onClose={() => setBottomPanelOpen(false)}
              />
            </div>
          )}

          {!focusMode && !bottomPanelOpen && (
            <div className="shrink-0 px-3 pb-3">
              <button
                type="button"
                onClick={() => setBottomPanelOpen(true)}
                className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--agenthub-border)] bg-white px-3 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 dark:bg-neutral-900 dark:text-slate-300 dark:hover:bg-white/5"
              >
                <ChevronDown className="size-3.5" />
                展开详情
              </button>
            </div>
          )}

          {!focusMode && visibleInspectorDetail && showInspector && (
            <div className="absolute inset-x-3 bottom-3 z-20 h-[min(380px,55%)] overflow-hidden rounded-xl border border-[var(--agenthub-border)] bg-white shadow-xl xl:hidden dark:bg-neutral-900">
              <InspectorPanel
                detail={visibleInspectorDetail}
                selectedNode={selectedNode}
                tab={inspectorTab}
                onTabChange={setInspectorTab}
                onClose={closeInspector}
                debugEvents={inspectorDebugEvents}
                terminalSessions={inspectorTerminalSessions}
                terminalEventsBySession={terminalEventsBySession}
                onSelectToolCall={selectToolCall}
                onOpenGlobalPanel={openBottomPanelTab}
                onTerminalInput={submitTerminalInput}
                selectedToolCallId={selectedToolCallId}
              />
            </div>
          )}
        </main>

        {!focusMode && visibleInspectorDetail && showInspector && (
          <aside className="hidden min-h-0 xl:block">
            <InspectorPanel
              detail={visibleInspectorDetail}
              selectedNode={selectedNode}
              tab={inspectorTab}
              onTabChange={setInspectorTab}
              onClose={closeInspector}
              debugEvents={inspectorDebugEvents}
              terminalSessions={inspectorTerminalSessions}
              terminalEventsBySession={terminalEventsBySession}
              onSelectToolCall={selectToolCall}
              onOpenGlobalPanel={openBottomPanelTab}
              onTerminalInput={submitTerminalInput}
              selectedToolCallId={selectedToolCallId}
            />
          </aside>
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

function CanvasToolbar({
  graphScope,
  onGraphScopeChange,
  currentRunExpanded,
  onToggleCurrentRunExpansion,
  view,
  onViewChange,
  filter,
  onFilterChange,
}: {
  graphScope: CanvasGraphScope
  onGraphScopeChange: (scope: CanvasGraphScope) => void
  currentRunExpanded: boolean
  onToggleCurrentRunExpansion: () => void
  view: AgentRunDebuggerCanvasView
  onViewChange: (view: AgentRunDebuggerCanvasView) => void
  filter: AgentRunTimelineFilter
  onFilterChange: (filter: AgentRunTimelineFilter) => void
}) {
  const views: Array<{ id: AgentRunDebuggerCanvasView; label: string }> = [
    { id: 'graph', label: '任务图' },
    { id: 'timeline', label: '时间线' },
    { id: 'events', label: '事件流' },
  ]

  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-[var(--agenthub-border)] bg-white/95 px-3 dark:bg-neutral-950/80">
      <div className="flex shrink-0 items-center gap-1 border-r border-slate-200 pr-3 dark:border-white/10">
        {[
          { id: 'session' as const, label: '全会话' },
          { id: 'run' as const, label: '当前 Run' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onGraphScopeChange(item.id)}
            aria-pressed={graphScope === item.id && view === 'graph'}
            className={cn(
              'h-7 rounded-md px-2.5 text-xs font-medium transition',
              graphScope === item.id && view === 'graph'
                ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/5 dark:hover:text-slate-200',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {graphScope === 'session' && view === 'graph' && (
        <button
          type="button"
          onClick={onToggleCurrentRunExpansion}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 dark:border-white/10 dark:bg-neutral-950/40 dark:hover:bg-white/5 dark:hover:text-slate-200"
        >
          {currentRunExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          {currentRunExpanded ? '收起当前 Run' : '展开当前 Run'}
        </button>
      )}
      <div className="flex min-w-0 items-center gap-1">
        {views.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onViewChange(item.id)}
            aria-pressed={view === item.id}
            className={cn(
              'h-7 rounded-md px-2.5 text-xs font-medium transition',
              view === item.id
                ? 'bg-[var(--agenthub-accent)] text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/5 dark:hover:text-slate-200',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {TIMELINE_FILTER_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onFilterChange(option.id)}
            className={cn(
              'h-7 rounded-md border px-2.5 text-[11px] font-medium transition',
              filter === option.id
                ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-300'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:bg-neutral-950/40 dark:hover:bg-white/5',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function DebuggerNode({ data, selected }: NodeProps<AgentRunDebuggerNode>) {
  const [expanded, setExpanded] = useState(false)
  const muted = data.status === 'waiting' || data.status === 'unavailable'
  const focusMuted = data.emphasis === 'muted'
  return (
    <>
      <Handle type="target" position={Position.Top} className="!size-2 !border-0 !bg-slate-300" />
      <div
        className={cn(
          'rounded-lg border bg-white shadow-[0_16px_40px_rgba(31,55,86,.12)] transition dark:bg-neutral-900',
          data.kind === 'message' && 'w-[310px] border-indigo-100 p-3',
          data.kind === 'run' && 'w-[310px] border-blue-100 p-3',
          data.kind === 'agent' && 'w-[280px] p-3',
          data.kind === 'task' && 'w-[270px] p-3',
          data.kind === 'tool' && 'w-[290px] p-3',
          data.kind === 'summary' && 'w-[270px] border-slate-200 p-3',
          selected && 'ring-2 ring-[var(--agenthub-accent)] ring-offset-2 dark:ring-offset-neutral-950',
          data.tone === 'success' && 'border-emerald-300 shadow-[0_0_0_4px_rgba(16,185,129,.10)]',
          data.tone === 'info' && 'border-blue-300 shadow-[0_0_0_4px_rgba(37,99,235,.10)]',
          data.tone === 'warning' && 'border-amber-300 shadow-[0_0_0_4px_rgba(245,158,11,.10)]',
          data.tone === 'danger' && 'border-rose-300 shadow-[0_0_0_4px_rgba(244,63,94,.10)]',
          muted && 'opacity-70',
          focusMuted && !selected && 'opacity-35 grayscale',
          focusMuted && selected && 'opacity-60 grayscale',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg', debuggerNodeIconClass(data.tone))}>
              {debuggerNodeIcon(data)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{data.label}</div>
              <div className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                {renderDebuggerNodeDescription(data)}
              </div>
            </div>
          </div>
          <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', debuggerStatusBadgeClass(data.status))}>
            <span className={cn('size-1.5 rounded-full', debuggerStatusDotClass(data.status))} />
            {debuggerStatusLabel(data.status)}
          </span>
          {data.kind === 'agent' && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setExpanded((current) => !current)
              }}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
              aria-label={expanded ? '收起 Agent 步骤' : '展开 Agent 步骤'}
              title={expanded ? '收起 Agent 步骤' : '展开 Agent 步骤'}
            >
              {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
          )}
        </div>

        {data.kind === 'message' && data.message && (
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-white/10">
            <div className="line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{data.message.preview}</div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <NodeMetric label="关联 Run" value={String(data.message.runIds.length)} />
              <NodeMetric label="时间" value={formatClockTime(data.message.createdAt)} />
            </div>
          </div>
        )}

        {(data.kind === 'run' || data.kind === 'summary') && (
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-[10px] dark:border-white/10">
            <NodeMetric label="耗时" value={data.run?.durationMs === null || data.run?.durationMs === undefined ? '-' : formatDurationMs(data.run.durationMs)} />
            <NodeMetric label="Token" value={data.run?.tokenTotal === null || data.run?.tokenTotal === undefined ? '-' : formatCompactNumber(data.run.tokenTotal)} />
            <NodeMetric label="模型" value={compactModelName(data.run?.modelId ?? '-')} />
          </div>
        )}

        {data.kind === 'agent' && data.agent && (
          <>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
              <NodeMetric label="耗时" value={data.agent.durationMs === null ? '-' : formatDurationMs(data.agent.durationMs)} />
              <NodeMetric label="Token" value={data.agent.tokenTotal === null ? '-' : formatCompactNumber(data.agent.tokenTotal)} />
              <NodeMetric label="工具" value={String(data.agent.toolCallCount)} />
            </div>
            <NodeStepList
              steps={data.agent.steps}
              fallbackItems={data.agent.taskTitles.length ? data.agent.taskTitles : data.agent.taskIds}
              status={data.status}
              expanded={expanded}
            />
            <NodeToolChips tools={data.agent.toolNames} expanded={expanded} />
          </>
        )}

        {data.kind === 'tool' && data.tool && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
              <NodeMetric label="Call ID" value={shortId(data.tool.callId)} />
              <NodeMetric label="Agent" value={data.tool.agentName ?? data.tool.agentId} />
            </div>
            <div className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-[10px] leading-5 text-slate-600 dark:bg-white/5 dark:text-slate-300">
              <div className="font-medium text-slate-700 dark:text-slate-200">{data.tool.toolName}</div>
              <div className="mt-0.5 line-clamp-2 break-words">{data.tool.summary || '暂无输入摘要'}</div>
            </div>
          </>
        )}

        {data.kind === 'task' && data.task && (
          <>
            <NodeTaskList
              items={[
                data.task.title,
                data.task.dependsOn.length ? `依赖 ${data.task.dependsOn.join(', ')}` : '可直接执行',
                data.task.agentId,
              ]}
              status={data.status}
            />
            <NodeToolChips tools={data.task.toolNames} />
          </>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!size-2 !border-0 !bg-slate-300" />
    </>
  )
}

function NodeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-slate-400">{label}</div>
      <div className="mt-0.5 truncate font-semibold text-slate-800 dark:text-slate-100">{value}</div>
    </div>
  )
}

function NodeTaskList({ items, status }: { items: string[]; status: AgentRunDebuggerStatus }) {
  const visibleItems = items.filter(Boolean).slice(0, 3)
  if (visibleItems.length === 0) return null
  return (
    <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 dark:border-white/10">
      {visibleItems.map((item, index) => (
        <div key={`${item}-${index}`} className="flex min-w-0 items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
          {index === 0 && (status === 'completed' ? (
            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
          ) : status === 'running' ? (
            <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full border border-blue-300">
              <span className="size-1.5 rounded-full bg-blue-500" />
            </span>
          ) : (
            <span className="size-3.5 shrink-0 rounded-full border border-slate-300" />
          ))}
          {index > 0 && <span className="ml-[3px] size-2 shrink-0 rounded-full border border-slate-300" />}
          <span className="truncate">{item}</span>
        </div>
      ))}
    </div>
  )
}

function NodeStepList({
  steps,
  fallbackItems,
  status,
  expanded,
}: {
  steps: AgentRunDebuggerStep[]
  fallbackItems: string[]
  status: AgentRunDebuggerStatus
  expanded: boolean
}) {
  const { steps: visibleSteps, hiddenCount } = getVisibleAgentDebuggerSteps(steps, expanded)
  if (visibleSteps.length === 0) return <NodeTaskList items={fallbackItems} status={status} />
  return (
    <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 dark:border-white/10">
      {visibleSteps.map((step) => (
        <div key={step.id} className="min-w-0 text-[11px] text-slate-600 dark:text-slate-300">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn('size-2 shrink-0 rounded-full', debuggerStatusDotClass(step.status))} />
            <span className="min-w-0 flex-1 truncate">{step.title}</span>
            {step.dependsOn.length > 0 && (
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-500 dark:bg-white/10">
                dep {step.dependsOn.length}
              </span>
            )}
          </div>
        </div>
      ))}
      {hiddenCount > 0 && (
        <div className="pl-4 text-[10px] text-slate-400">+{hiddenCount} 个步骤</div>
      )}
    </div>
  )
}

function NodeToolChips({ tools, expanded = false }: { tools: string[]; expanded?: boolean }) {
  if (tools.length === 0) return null
  const visibleTools = expanded ? tools : tools.slice(0, 4)
  return (
    <div className="mt-3 rounded-lg border border-dashed border-blue-100 bg-blue-50/40 px-2.5 py-2 dark:border-blue-400/20 dark:bg-blue-500/10">
      <div className="mb-1.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">调用工具</div>
      <div className="flex flex-wrap gap-1.5">
        {visibleTools.map((tool) => (
          <span key={tool} className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 font-mono text-[10px] text-slate-600 dark:border-white/10 dark:bg-neutral-950/50 dark:text-slate-300">
            <Wrench className="size-3 shrink-0" />
            <span className="truncate">{tool}</span>
          </span>
        ))}
        {tools.length > visibleTools.length && (
          <span className="inline-flex items-center rounded-md px-1.5 py-1 text-[10px] text-slate-400">
            +{tools.length - visibleTools.length}
          </span>
        )}
      </div>
    </div>
  )
}

function debuggerNodeIcon(data: AgentRunDebuggerNodeData) {
  if (data.kind === 'message') return <MessageCircleIcon />
  if (data.kind === 'run') return <GitBranch className="size-4" />
  if (data.kind === 'summary') return <Database className="size-4" />
  if (data.kind === 'task') return <GitBranch className="size-4" />
  if (data.kind === 'tool') return <TerminalSquare className="size-4" />
  if (data.agent?.role === 'orchestrator') return <Cpu className="size-4" />
  return <Bot className="size-4" />
}

function MessageCircleIcon() {
  return <Activity className="size-4" />
}

function debuggerNodeIconClass(tone: AgentRunBoardTone): string {
  if (tone === 'success') return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
  if (tone === 'info') return 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300'
  if (tone === 'warning') return 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300'
  if (tone === 'danger') return 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300'
  return 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300'
}

function debuggerStatusBadgeClass(status: AgentRunDebuggerStatus): string {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
  if (status === 'running') return 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
  if (status === 'failed' || status === 'aborted') return 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
  if (status === 'waiting' || status === 'blocked') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
  return 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300'
}

function InspectorPanel({
  detail,
  selectedNode,
  tab,
  onTabChange,
  onClose,
  debugEvents,
  terminalSessions,
  terminalEventsBySession,
  onSelectToolCall,
  onOpenGlobalPanel,
  onTerminalInput,
  selectedToolCallId,
}: {
  detail: AgentRunDebugDetail
  selectedNode: AgentRunDebuggerGraph['nodes'][number] | null
  tab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
  onClose: () => void
  debugEvents: AgentRunDebugEventRecord[]
  terminalSessions: TerminalSessionRecord[]
  terminalEventsBySession: Record<string, TerminalEventRecord[]>
  onSelectToolCall: (callId: string) => void
  onOpenGlobalPanel: (tab: BoardPanelTab) => void
  onTerminalInput: (sessionId: string, input: string) => Promise<void>
  selectedToolCallId: string | null
}) {
  const selectedAgent = selectedNode?.data.kind === 'agent'
    ? selectedNode.data.agent ?? null
    : selectedNode?.data.kind === 'tool'
      ? {
          agentId: selectedNode.data.tool?.agentId ?? detail.agentRun.agentId,
          name: selectedNode.data.tool?.agentName ?? detail.agentRun.agentName ?? detail.agentRun.agentId,
          role: 'orchestrator' as const,
          status: selectedNode.data.status,
          runId: selectedNode.data.tool?.runId ?? detail.agentRun.id,
          taskIds: [],
          taskTitles: [],
          steps: [],
          durationMs: null,
          tokenTotal: null,
          toolCallCount: 0,
          toolNames: [],
          source: 'current_run' as const,
        }
      : null
  const selectedAgentId = selectedAgent?.agentId ?? detail.agentRun.agentId
  const toolTrace = projectAgentRunToolTrace(detail)
  const agentToolTrace = filterToolTraceForInspectorAgent(toolTrace, {
    detail,
    debugEvents,
    agent: selectedAgent,
  })
  const artifacts = projectAgentRunArtifacts(detail)
  const askUserInteractions = projectAgentRunAskUserInteractions(agentToolTrace)
  const taskResults = projectAgentRunTaskResults(agentToolTrace)
  const operations = projectAgentRunOperations(agentToolTrace)
  const terminalOutput = projectAgentRunTerminalOutput(detail, debugEvents, selectedAgentId)
  const realTerminal = projectRealAgentTerminalOutput(terminalSessions, terminalEventsBySession, selectedAgentId)
  const inspectorView = buildAgentRunInspectorViewModel(detail, selectedNode, agentToolTrace)
  const toolInspectorView = buildAgentRunToolInspectorViewModel(detail, agentToolTrace, debugEvents, selectedToolCallId)
  const activeSummaryView = toolInspectorView ?? inspectorView
  const tabs: Array<{ id: InspectorTab; label: string; icon: React.ReactNode }> = [
    { id: 'terminal', label: '终端', icon: <TerminalSquare className="size-3" /> },
    { id: 'logs', label: '日志', icon: <FileCode2 className="size-3" /> },
    { id: 'trace', label: '工具', icon: <Activity className="size-3" /> },
    { id: 'variables', label: '变量', icon: <GitBranch className="size-3" /> },
    { id: 'artifacts', label: '产物', icon: <PackageOpen className="size-3" /> },
  ]

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-[var(--agenthub-border)] bg-white dark:bg-neutral-900">
      <div className="shrink-0 border-b border-[var(--agenthub-border)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--agenthub-accent)]">
              {inspectorIcon(activeSummaryView.kind)}
              {activeSummaryView.kicker}
            </div>
            <div className="mt-2 flex min-w-0 items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">
                {activeSummaryView.title}
              </h2>
              {(selectedNode || activeSummaryView.kind === 'tool') && (
                <span className={cn('size-2 shrink-0 rounded-full', debuggerStatusDotClass(activeSummaryView.status))} />
              )}
            </div>
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
              {activeSummaryView.subtitle}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="关闭详情">
            <X className="size-4" />
          </button>
        </div>
      </div>

      <InspectorWorkbenchSummary view={activeSummaryView} />

      <div className="flex shrink-0 flex-nowrap items-center gap-0.5 border-b border-[var(--agenthub-border)] px-2 py-1.5">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            className={cn(
              'inline-flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition',
              tab === item.id
                ? 'bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/5 dark:hover:text-slate-200',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      <div className={cn('min-h-0 flex-1', tab === 'terminal' ? 'flex flex-col p-3' : 'overflow-y-auto p-3')}>
        {tab === 'terminal' ? (
          <TerminalPanel terminal={terminalOutput} realTerminal={realTerminal} onInput={onTerminalInput} />
        ) : tab === 'logs' ? (
          <InspectorSummaryPanel
            title="日志摘要"
            emptyText="暂无文件、命令或网络日志"
            items={[
              ...operations.files.map((item) => ({ id: item.callId, label: item.kind, value: item.path, error: item.isError })),
              ...operations.commands.map((item) => ({ id: item.callId, label: item.exitCode === 0 ? 'command' : item.status ?? 'command', value: item.command, error: item.isError })),
              ...operations.network.map((item) => ({ id: item.callId, label: item.kind, value: item.target, error: item.isError })),
            ]}
            total={operations.files.length + operations.commands.length + operations.network.length}
            onOpenGlobal={() => onOpenGlobalPanel('logs')}
          />
        ) : tab === 'trace' ? (
          <InspectorSummaryPanel
            title="工具调用摘要"
            emptyText="当前 Agent 没有工具调用"
            items={agentToolTrace.map((item) => ({
              id: item.callId,
              label: item.toolName,
              value: summarizeAgentRunToolTraceArgs(item),
              error: item.isError,
              onClick: () => onSelectToolCall(item.callId),
            }))}
            total={agentToolTrace.length}
            onOpenGlobal={() => onOpenGlobalPanel('trace')}
          />
        ) : tab === 'variables' ? (
          <InspectorVariablesSummary detail={detail} onOpenGlobal={() => onOpenGlobalPanel('variables')} />
        ) : (
          <InspectorSummaryPanel
            title="产物摘要"
            emptyText="暂无 Artifact、部署输出或任务结果"
            items={[
              ...artifacts.map((artifact) => ({ id: artifact.id, label: artifact.status ?? artifact.kind, value: artifact.title ?? artifact.artifactId, error: false })),
              ...taskResults.map((result) => ({ id: result.callId, label: result.status, value: result.summary, error: result.status !== 'complete' })),
              ...askUserInteractions.map((interaction) => ({ id: interaction.callId, label: interaction.answered ? 'answered' : 'pending', value: `${interaction.questionCount} question(s)`, error: interaction.isError })),
            ]}
            total={artifacts.length + taskResults.length + askUserInteractions.length}
            onOpenGlobal={() => onOpenGlobalPanel('artifacts')}
          />
        )}
      </div>
    </aside>
  )
}

function InspectorWorkbenchSummary({
  view,
}: {
  view: InspectorWorkbenchViewModel
}) {
  if (view.kind === 'tool') {
    return (
      <div className="shrink-0 space-y-2 border-b border-[var(--agenthub-border)] bg-slate-50/60 p-3 dark:bg-neutral-950/30">
        <ToolInspectorSummary view={view} />
      </div>
    )
  }
  if (view.kind === 'message') {
    return (
      <div className="shrink-0 space-y-2 border-b border-[var(--agenthub-border)] bg-slate-50/60 p-3 dark:bg-neutral-950/30">
        <MessageInspectorSummary view={view} />
      </div>
    )
  }
  return (
    <div className="shrink-0 space-y-2 border-b border-[var(--agenthub-border)] bg-slate-50/60 p-3 dark:bg-neutral-950/30">
      <div className="grid grid-cols-2 gap-2">
        {view.metrics.map((metric) => (
          <PanelMetric key={metric.label} label={metric.label} value={formatInspectorMetric(metric)} />
        ))}
      </div>
      <CurrentTaskSummary task={view.currentTask} />
      {view.fields.length > 0 && (
        <div className="grid gap-1 text-[11px] text-slate-500 dark:text-slate-400">
          {view.fields.map((field) => (
            <div key={field.label} className="flex items-center justify-between gap-2">
              <span>{field.label}</span>
              <span className="min-w-0 truncate font-mono text-slate-700 dark:text-slate-200">{field.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ToolInspectorSummary({ view }: { view: AgentRunToolInspectorViewModel }) {
  return (
    <div className="space-y-2">
      <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-900">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">工具</div>
            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{view.title}</div>
          </div>
          <span className={cn('rounded px-1.5 py-0.5 text-[10px]', view.status === 'completed' ? 'bg-emerald-500/10 text-emerald-300' : view.status === 'running' ? 'bg-blue-500/10 text-blue-300' : 'bg-white/10 text-slate-300')}>
            {view.subtitle}
          </span>
        </div>
      </section>
      <div className="grid grid-cols-2 gap-2">
        {view.metrics.map((metric) => (
          <PanelMetric key={metric.label} label={metric.label} value={formatInspectorMetric(metric)} />
        ))}
      </div>
      <div className="grid gap-1.5 text-xs">
        {view.fields.map((field) => (
          <div key={field.label} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 dark:bg-neutral-900">
            <span className="shrink-0 text-slate-500 dark:text-slate-400">{field.label}</span>
            <span className="min-w-0 truncate text-right font-medium text-slate-800 dark:text-slate-100">{field.value}</span>
          </div>
        ))}
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-900">
        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Input</div>
        <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-slate-900 dark:text-slate-100">{view.input || '-'}</p>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-900">
        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Output</div>
        <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-slate-900 dark:text-slate-100">{view.output || '-'}</p>
      </section>
    </div>
  )
}

function MessageInspectorSummary({
  view,
}: {
  view: Pick<AgentRunInspectorViewModel, 'messageContent' | 'fields'>
}) {
  return (
    <div className="space-y-2">
      <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-900">
        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">内容</div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-900 dark:text-slate-100">
          {view.messageContent ?? '-'}
        </p>
      </section>
      <div className="grid gap-1.5 text-xs">
        {view.fields.map((field) => (
          <div key={field.label} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 dark:bg-neutral-900">
            <span className="shrink-0 text-slate-500 dark:text-slate-400">{field.label}</span>
            <span className="min-w-0 truncate text-right font-medium text-slate-800 dark:text-slate-100">
              {field.label === '发送时间' ? formatClockTime(Number(field.value)) : field.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CurrentTaskSummary({ task }: { task: AgentRunInspectorTask | null }) {
  if (!task) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-neutral-900">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-slate-900 dark:text-slate-100">当前任务</span>
          <span className="min-w-0 truncate text-slate-500 dark:text-slate-400">暂无可识别步骤</span>
        </div>
      </section>
    )
  }

  const progress = task.stepTotal > 0 ? Math.round((task.stepIndex / task.stepTotal) * 100) : task.status === 'completed' ? 100 : 20
  return (
    <section className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-neutral-900">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-900 dark:text-slate-100">当前任务</span>
        <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">{task.title}</span>
      </div>
      {task.stepTitle && (
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="min-w-0 truncate">{task.stepTitle}</span>
          <span className="shrink-0">{task.stepIndex}/{task.stepTotal}</span>
        </div>
      )}
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        <div
          className={cn(
            'h-full rounded-full',
            task.status === 'completed' ? 'bg-emerald-500' : task.status === 'running' ? 'bg-blue-500' : task.status === 'failed' ? 'bg-rose-500' : 'bg-amber-400',
          )}
          style={{ width: `${Math.min(100, Math.max(8, progress))}%` }}
        />
      </div>
    </section>
  )
}

function formatInspectorMetric(metric: AgentRunInspectorMetric): string {
  if (metric.value === null || metric.value === undefined || metric.value === '') return '-'
  if (metric.label === '耗时' && typeof metric.value === 'number') return formatDurationMs(metric.value)
  if (metric.label === 'Token' && typeof metric.value === 'number') return formatCompactNumber(metric.value)
  if (metric.label === '模型' && typeof metric.value === 'string') return compactModelName(metric.value)
  return String(metric.value)
}

function inspectorIcon(kind: ReturnType<typeof buildAgentRunInspectorViewModel>['kind'] | AgentRunToolInspectorViewModel['kind']) {
  if (kind === 'message') return <Activity className="size-3.5" />
  if (kind === 'agent') return <Bot className="size-3.5" />
  if (kind === 'tool') return <TerminalSquare className="size-3.5" />
  if (kind === 'task') return <GitBranch className="size-3.5" />
  if (kind === 'summary') return <Database className="size-3.5" />
  return <GitBranch className="size-3.5" />
}

function BottomPanel({
  tab,
  onTabChange,
  detail,
  diagnosticDetail,
  stage,
  runs,
  selectedRunId,
  onSelectRun,
  debugEvents,
  onSelectToolCall,
  onClose,
}: {
  tab: BoardPanelTab
  onTabChange: (tab: BoardPanelTab) => void
  detail: AgentRunDebugDetail | null
  diagnosticDetail: AgentRunDebugDetail | null
  stage: AgentRunBoardStage | null
  runs: AgentRunDebugListItem[]
  selectedRunId: string | null
  onSelectRun: (runId: string) => void
  debugEvents: AgentRunDebugEventRecord[]
  onSelectToolCall: (callId: string) => void
  onClose: () => void
}) {
  const tabs: Array<{ id: BoardPanelTab; label: string; icon: React.ReactNode }> = [
    { id: 'output', label: '输出', icon: <Activity className="size-3.5" /> },
    { id: 'logs', label: '日志', icon: <FileCode2 className="size-3.5" /> },
    { id: 'trace', label: '工具调用', icon: <TerminalSquare className="size-3.5" /> },
    { id: 'variables', label: '变量', icon: <GitBranch className="size-3.5" /> },
    { id: 'artifacts', label: '产物', icon: <PackageOpen className="size-3.5" /> },
    { id: 'history', label: '历史', icon: <Clock3 className="size-3.5" /> },
  ]

  return (
    <section className="hidden h-[224px] min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--agenthub-border)] bg-white shadow-sm md:flex dark:bg-neutral-900">
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-1 border-b border-[var(--agenthub-border)] px-3 py-1">
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
        <button
          type="button"
          onClick={onClose}
          className="ml-1 inline-flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-200"
          aria-label="关闭全局详情"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!detail ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-500">选择一个 Run 后查看输出和证据</div>
        ) : tab === 'output' ? (
          <OutputPanel detail={detail} stage={stage} />
        ) : tab === 'trace' ? (
          <ToolTracePanel detail={diagnosticDetail ?? detail} debugEvents={debugEvents} onSelectToolCall={onSelectToolCall} />
        ) : tab === 'variables' ? (
          <VariablesPanel detail={diagnosticDetail ?? detail} />
        ) : tab === 'logs' ? (
          <LogsPanel detail={diagnosticDetail ?? detail} />
        ) : tab === 'artifacts' ? (
          <ArtifactsPanel detail={diagnosticDetail ?? detail} />
        ) : (
          <HistoryPanel runs={runs.filter((run) => run.id !== selectedRunId)} selectedRunId={selectedRunId} onSelect={onSelectRun} />
        )}
      </div>
    </section>
  )
}

function StageRail({
  stages,
  activeStageId,
  onSelectStage,
}: {
  stages: AgentRunBoardStage[]
  activeStageId: AgentRunBoardStage['id'] | null
  onSelectStage: (stageId: AgentRunBoardStage['id']) => void
}) {
  return (
    <div className="shrink-0 border-b border-[var(--agenthub-border)] bg-white px-5 py-2 dark:bg-neutral-950/70">
      <div className="flex flex-wrap items-center gap-0">
        {stages.map((stage, index) => (
          <div key={stage.id} className="flex shrink-0 items-center">
            {index > 0 && <div className="h-px w-12 bg-slate-200 dark:bg-white/10" />}
            <button
              type="button"
              onClick={() => onSelectStage(stage.id)}
              className={cn(
                'inline-flex h-7 items-center gap-2 rounded-full px-2.5 text-[11px] font-medium transition',
                activeStageId === stage.id
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200',
              )}
            >
              <span className={cn('flex size-4 items-center justify-center rounded-full text-white', debuggerStatusDotClass(stageToDebuggerStatus(stage.status)))}>
                {stage.status === 'complete' ? <CheckCircle2 className="size-3" /> : null}
              </span>
              <span>{stage.title}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function filterToolTraceForInspectorAgent(
  items: readonly AgentRunToolTraceItem[],
  {
    detail,
    debugEvents,
    agent,
  }: {
    detail: AgentRunDebugDetail
    debugEvents: readonly AgentRunDebugEventRecord[]
    agent: AgentRunDebuggerNodeData['agent'] | null
  },
): AgentRunToolTraceItem[] {
  if (!agent) return [...items]
  const taskIds = new Set(agent.taskIds)
  const eventOwners = new Map<string, { agentIds: Set<string>; taskIds: Set<string> }>()
  for (const event of debugEvents) {
    if (event.runId !== detail.agentRun.id || !event.toolCallId) continue
    const owner = eventOwners.get(event.toolCallId) ?? { agentIds: new Set<string>(), taskIds: new Set<string>() }
    if (event.agentId) owner.agentIds.add(event.agentId)
    if (event.taskId) owner.taskIds.add(event.taskId)
    eventOwners.set(event.toolCallId, owner)
  }

  return items.filter((item) => {
    const owner = eventOwners.get(item.callId)
    if (owner) {
      if (owner.agentIds.has(agent.agentId)) return true
      for (const taskId of owner.taskIds) {
        if (taskIds.has(taskId)) return true
      }
      if (owner.agentIds.size > 0 || owner.taskIds.size > 0) return false
    }

    const haystack = `${stringifyForSearch(item.args)} ${stringifyForSearch(item.result)}`
    if (haystack.includes(agent.agentId)) return true
    for (const taskId of taskIds) {
      if (haystack.includes(taskId)) return true
    }

    return agent.role === 'orchestrator' && agent.agentId === detail.agentRun.agentId
  })
}

function stringifyForSearch(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

interface RealAgentTerminalOutput {
  status: 'empty' | 'live' | 'completed'
  sessionId: string | null
  shell: string
  cwd: string | null
  transcript: string
}

function TerminalPanel({
  terminal,
  realTerminal,
  onInput,
}: {
  terminal: AgentRunTerminalOutput
  realTerminal: RealAgentTerminalOutput
  onInput: (sessionId: string, input: string) => Promise<void>
}) {
  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [inputError, setInputError] = useState<string | null>(null)
  const activeTerminal = realTerminal.status === 'empty' ? terminal : realTerminal
  const canInput = realTerminal.status === 'live' && Boolean(realTerminal.sessionId)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canInput || !realTerminal.sessionId || !input || submitting) return
    setSubmitting(true)
    setInputError(null)
    try {
      await onInput(realTerminal.sessionId, input.endsWith('\n') ? input : `${input}\n`)
      setInput('')
    } catch (err) {
      setInputError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (activeTerminal.status === 'empty') {
    return <PanelEmpty icon={<TerminalSquare className="size-4" />} text="暂无命令输出" />
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-950 font-mono text-[11px] leading-5 text-slate-100 shadow-inner">
      <div className="flex min-h-9 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-1 text-[10px] text-slate-400">
        <div className="min-w-0">
          <div className="font-semibold text-slate-200">
            终端输出
          </div>
          <div className="mt-0.5 break-words">{activeTerminal.shell}{activeTerminal.cwd ? ` · ${activeTerminal.cwd}` : ''}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn('rounded px-1.5 py-0.5', activeTerminal.status === 'live' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/10 text-slate-300')}>
            {activeTerminal.status === 'live' ? '● LIVE' : '完成'}
          </span>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(activeTerminal.transcript)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-slate-200"
          >
            <Copy className="size-3" />
            复制
          </button>
        </div>
      </div>
      <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2">
        {activeTerminal.transcript}
      </pre>
      {canInput && (
        <div className="shrink-0 border-t border-white/10">
          <form onSubmit={submit} className="flex items-center gap-2 px-3 py-2">
            <span className="shrink-0 text-emerald-300">$</span>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-slate-100 outline-none placeholder:text-slate-500"
              placeholder="输入 stdin 后回车"
              disabled={submitting}
            />
            <button
              type="submit"
              disabled={!input || submitting}
              className="rounded bg-white/10 px-2 py-1 text-[10px] text-slate-200 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              发送
            </button>
          </form>
          {inputError && <div className="px-3 pb-2 text-[10px] text-rose-300">{inputError}</div>}
        </div>
      )}
    </div>
  )
}

function projectRealAgentTerminalOutput(
  sessions: readonly TerminalSessionRecord[],
  eventsBySession: Record<string, TerminalEventRecord[]>,
  agentId: string | null,
): RealAgentTerminalOutput {
  const agentSessions = sessions
    .filter((session) => !agentId || session.agentId === agentId)
    .sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))
  if (agentSessions.length === 0) {
    return {
      status: 'empty',
      sessionId: null,
      shell: 'Shell',
      cwd: null,
      transcript: '',
    }
  }

  const lines: string[] = []
  for (const session of agentSessions) {
    const prompt = terminalPrompt(session.shell, session.cwd)
    lines.push(ensureTerminalLine(`${prompt} ${session.command}`))
    const events = [...(eventsBySession[session.id] ?? [])].sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id))
    for (const event of events) {
      if (!event.text) continue
      if (event.type === 'terminal.input') lines.push(ensureTerminalLine(event.text))
      else if (event.type === 'terminal.output' || event.type === 'terminal.error') lines.push(event.text)
    }
    if (session.status !== 'running') {
      const exitLabel = session.exitCode === null ? session.signal ?? session.status : `exit ${session.exitCode}`
      lines.push(ensureTerminalLine(`[${exitLabel}]`))
    }
  }

  const liveSession = [...agentSessions].reverse().find((session) => session.status === 'running') ?? null
  const latestSession = agentSessions.at(-1)
  return {
    status: liveSession ? 'live' : 'completed',
    sessionId: liveSession?.id ?? null,
    shell: latestSession?.shell ?? 'Shell',
    cwd: latestSession?.cwd ?? null,
    transcript: lines.join('').trimEnd(),
  }
}

function ensureTerminalLine(text: string): string {
  return text.endsWith('\n') || text.endsWith('\r') ? text : `${text}\n`
}

function terminalPrompt(shell: string, cwd: string | null): string {
  const name = shell.toLowerCase()
  if (name.includes('powershell') || name.includes('pwsh')) return `PS ${cwd ?? ''}>`
  if (name.includes('cmd')) return `${cwd ?? ''}>`
  return `${cwd ?? '$'} $`
}

function InspectorSummaryPanel({
  title,
  emptyText,
  items,
  total,
  onOpenGlobal,
}: {
  title: string
  emptyText: string
  items: Array<{ id: string; label: string; value: string; error: boolean; onClick?: () => void }>
  total: number
  onOpenGlobal: () => void
}) {
  const recentItems = items.slice(-3).reverse()
  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-900">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{title}</div>
            <div className="mt-1 text-[11px] text-slate-500">共 {total} 条 · 最近 {recentItems.length} 条</div>
          </div>
          <button
            type="button"
            onClick={onOpenGlobal}
            className="shrink-0 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            查看全局
          </button>
        </div>
      </section>
      {recentItems.length === 0 ? (
        <PanelEmpty icon={<Activity className="size-4" />} text={emptyText} />
      ) : (
        <div className="space-y-1.5">
          {recentItems.map((item) => {
            const content = (
              <>
                <span className="w-20 shrink-0 text-[10px] uppercase text-slate-400">{item.label}</span>
                <span className="min-w-0 flex-1 break-words font-mono text-[11px] leading-5">{item.value}</span>
              </>
            )
            return item.onClick ? (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className={cn('flex w-full items-start gap-2 rounded-md bg-slate-50 px-3 py-2 text-left text-xs hover:bg-blue-50/70 dark:bg-neutral-950/40 dark:hover:bg-blue-500/10', item.error && 'bg-rose-50 text-rose-700')}
              >
                {content}
              </button>
            ) : (
              <div key={item.id} className={cn('flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs dark:bg-neutral-950/40', item.error && 'bg-rose-50 text-rose-700')}>
                {content}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function InspectorVariablesSummary({ detail, onOpenGlobal }: { detail: AgentRunDebugDetail; onOpenGlobal: () => void }) {
  const snapshot = detail.snapshot
  if (!snapshot) {
    return (
      <InspectorSummaryPanel
        title="变量摘要"
        emptyText="旧 Run 没有上下文快照"
        items={[]}
        total={0}
        onOpenGlobal={onOpenGlobal}
      />
    )
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <PanelMetric label="工作区" value={snapshot.workspace.mode} />
        <PanelMetric label="工具" value={`${snapshot.tools.toolNames.length}`} />
        <PanelMetric label="历史" value={`${snapshot.context.historyMessageCount}`} />
        <PanelMetric label="记忆" value={`${snapshot.context.workspaceMemoryNoteCount}`} />
      </div>
      <button
        type="button"
        onClick={onOpenGlobal}
        className="inline-flex h-8 items-center rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
      >
        查看全局变量
      </button>
    </div>
  )
}

function EventTimelinePanel({
  detail,
  messages = [],
  runs = [],
  debugEvents,
  filter,
  onSelectDebugEvent,
  onSelectRun,
}: {
  detail: AgentRunDebugDetail | null
  messages?: MessageRecord[]
  runs?: AgentRunDebugListItem[]
  debugEvents: AgentRunDebugEventRecord[]
  filter: AgentRunTimelineFilter
  onSelectDebugEvent: (event: AgentRunDebugEventRecord) => void
  onSelectRun?: (runId: string) => void
}) {
  const rows = detail
    ? buildRunTimelineRows(detail, debugEvents, filter)
    : buildConversationTimelineRows(messages, runs, debugEvents, filter)
  const selectRow = (row: TimelineRow) => {
    if (row.debugEvent) onSelectDebugEvent(row.debugEvent)
    else if (row.runId) onSelectRun?.(row.runId)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
          <Clock3 className="size-3.5 text-[var(--agenthub-accent)]" />
          时间线
        </div>
      </div>
      {rows.length === 0 ? (
        <PanelEmpty icon={<Clock3 className="size-4" />} text="暂无事件记录" />
      ) : (
        <div className="relative min-h-0 flex-1 overflow-y-auto pl-5">
          <div className="absolute bottom-2 left-[6px] top-2 w-px bg-slate-200 dark:bg-white/10" />
          <div className="space-y-1.5">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onMouseDown={(event) => {
                  if (event.button === 0) selectRow(row)
                }}
                onClick={() => selectRow(row)}
                disabled={!row.debugEvent && !row.runId}
                className={cn(
                  'relative grid w-full grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-md px-1 py-0.5 text-left text-xs transition',
                  (row.debugEvent || row.runId) && 'hover:bg-blue-50/70 dark:hover:bg-blue-500/10',
                  !row.debugEvent && !row.runId && 'cursor-default',
                )}
              >
                <span className={cn('absolute -left-[18px] top-1.5 size-2.5 rounded-full border-2 border-white dark:border-neutral-900', timelineToneDotClass(row.tone))} />
                <span className="pt-0.5 font-mono text-[10px] text-slate-400">{row.time}</span>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="break-words font-medium text-slate-800 dark:text-slate-100">{row.label}</span>
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-white/10">{row.scope}</span>
                  </div>
                  <div className="mt-0.5 break-words text-[11px] text-slate-500 dark:text-slate-400">{row.detail}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RawEventStreamPanel({
  debugEvents,
  filter,
  onSelectDebugEvent,
}: {
  debugEvents: AgentRunDebugEventRecord[]
  filter: AgentRunTimelineFilter
  onSelectDebugEvent: (event: AgentRunDebugEventRecord) => void
}) {
  const rows = filterAgentRunDebugEvents(debugEvents, filter).slice(-80)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
          <FileCode2 className="size-3.5 text-[var(--agenthub-accent)]" />
          事件流
        </div>
      </div>
      {rows.length === 0 ? (
        <PanelEmpty icon={<FileCode2 className="size-4" />} text="暂无实时事件" />
      ) : (
        <div className="relative min-h-0 flex-1 overflow-y-auto pl-5">
          <div className="absolute bottom-2 left-[6px] top-2 w-px bg-slate-200 dark:bg-white/10" />
          <div className="space-y-1.5">
            {rows.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => onSelectDebugEvent(event)}
                className={cn(
                  'relative grid w-full grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-md px-1 py-0.5 text-left text-xs transition hover:bg-blue-50/70 dark:hover:bg-blue-500/10',
                  isFailedDebugEvent(event) && 'text-rose-700 dark:text-rose-300',
                )}
              >
                <span className={cn('absolute -left-[18px] top-1.5 size-2.5 rounded-full border-2 border-white dark:border-neutral-900', timelineToneDotClass(isFailedDebugEvent(event) ? 'danger' : event.status === 'running' ? 'info' : 'success'))} />
                <span className="pt-0.5 font-mono text-[10px] text-slate-400">{formatClockTime(event.createdAt)}</span>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="break-words font-medium text-slate-800 dark:text-slate-100">{describeAgentRunDebugEvent(event).label}</span>
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-white/10">{debugEventScope(event)}</span>
                  </div>
                  <div className="mt-0.5 break-words text-[11px] text-slate-500 dark:text-slate-400">{describeAgentRunDebugEvent(event).detail}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

type TimelineRow = {
  id: string
  time: string
  label: string
  scope: string
  detail: string
  tone: AgentRunBoardTone
  createdAt: number
  debugEvent: AgentRunDebugEventRecord | null
  runId: string | null
}

function buildRunTimelineRows(
  detail: AgentRunDebugDetail,
  debugEvents: AgentRunDebugEventRecord[],
  filter: AgentRunTimelineFilter,
): TimelineRow[] {
  const messageEvents = filterAgentRunTimeline(projectAgentRunTimeline(detail), filter)
  const runtimeEvents = filterAgentRunDebugEvents(debugEvents, filter)
  return [
    ...runtimeEvents.map((event): TimelineRow => ({
      id: event.id,
      time: formatClockTime(event.createdAt),
      label: describeAgentRunDebugEvent(event).label,
      scope: debugEventScope(event),
      detail: describeAgentRunDebugEvent(event).detail,
      tone: isFailedDebugEvent(event) ? 'danger' : event.status === 'running' ? 'info' : 'success',
      createdAt: event.createdAt,
      debugEvent: event,
      runId: event.runId,
    })),
    ...messageEvents.map((event): TimelineRow => ({
      id: event.id,
      time: `#${event.messageIndex + 1}`,
      label: event.label,
      scope: `${shortId(event.messageId)}:${event.partIndex}`,
      detail: event.detail,
      tone: event.status === 'error' ? 'danger' : event.status === 'pending' ? 'warning' : 'neutral',
      createdAt: detail.outputMessages[event.messageIndex]?.createdAt ?? detail.agentRun.startedAt,
      debugEvent: null,
      runId: null,
    })),
  ].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)).slice(-80)
}

function buildConversationTimelineRows(
  messages: MessageRecord[],
  runs: AgentRunDebugListItem[],
  debugEvents: AgentRunDebugEventRecord[],
  filter: AgentRunTimelineFilter,
): TimelineRow[] {
  const messageRows = messages
    .filter((message) => filter === 'all' || filter === 'agent' || (filter === 'errors' && message.status === 'error'))
    .map((message): TimelineRow => ({
      id: `session-message-${message.id}`,
      time: formatClockTime(message.createdAt),
      label: message.role === 'user' ? '用户发送消息' : message.role === 'agent' ? 'Agent 输出消息' : '系统消息',
      scope: `msg:${shortId(message.id)}`,
      detail: summarizeMessageForTimeline(message),
      tone: message.status === 'error' ? 'danger' : message.status === 'streaming' ? 'info' : 'neutral',
      createdAt: message.createdAt,
      debugEvent: null,
      runId: message.runId,
    }))
  const runRows = runs
    .filter((run) => {
      if (filter === 'all') return true
      if (filter === 'errors') return run.status === 'failed' || run.status === 'aborted'
      if (filter === 'agent') return true
      return false
    })
    .map((run): TimelineRow => ({
      id: `session-run-${run.id}`,
      time: formatClockTime(run.startedAt),
      label: run.parentRunId ? `${run.agentName ?? run.agentId} 开始执行` : 'Run 开始',
      scope: `${run.parentRunId ? 'child' : 'run'}:${shortId(run.id)}`,
      detail: run.triggerMessageId ? `触发消息 ${shortId(run.triggerMessageId)} · ${statusLabel(run.status)}` : statusLabel(run.status),
      tone: run.status === 'failed' || run.status === 'aborted' ? 'danger' : run.status === 'running' || run.status === 'queued' ? 'info' : 'success',
      createdAt: run.startedAt,
      debugEvent: null,
      runId: run.id,
    }))
  const runtimeRows = filterAgentRunDebugEvents(debugEvents, filter).map((event): TimelineRow => ({
    id: event.id,
    time: formatClockTime(event.createdAt),
    label: describeAgentRunDebugEvent(event).label,
    scope: debugEventScope(event),
    detail: describeAgentRunDebugEvent(event).detail,
    tone: isFailedDebugEvent(event) ? 'danger' : event.status === 'running' ? 'info' : 'success',
    createdAt: event.createdAt,
    debugEvent: event,
    runId: event.runId,
  }))

  return [...messageRows, ...runRows, ...runtimeRows]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .slice(-120)
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
        <PanelMetric label="状态" value={statusLabel(detail.agentRun.status)} tone={toneForRunStatus(detail.agentRun.status)} />
        <PanelMetric label="阶段" value={stage?.title ?? '未选择'} />
        <PanelMetric label="工具调用" value={`${toolTrace.length}`} />
        <PanelMetric label="Tokens" value={totalTokens === null ? '-' : totalTokens.toLocaleString()} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {artifacts.length > 0 ? artifacts.slice(0, 3).map((artifact) => (
          <div key={artifact.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-white/10 dark:bg-neutral-950/40">
            <FileCode2 className="size-3.5 text-[var(--agenthub-accent)]" />
            <span className="min-w-0 flex-1 break-words text-xs text-slate-700 dark:text-slate-200">{artifact.title ?? artifact.artifactId}</span>
            <span className="text-[10px] text-slate-400">{artifact.status ?? 'artifact'}</span>
          </div>
        )) : (
          <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-white/10">暂无产物输出</div>
        )}
      </div>
    </div>
  )
}

function ToolTracePanel({
  detail,
  debugEvents = [],
  onSelectToolCall,
}: {
  detail: AgentRunDebugDetail
  debugEvents?: AgentRunDebugEventRecord[]
  onSelectToolCall?: (callId: string) => void
}) {
  const items = projectAgentRunToolTrace(detail)
  const debugMetaByCallId = useMemo(() => getToolDebugMetaByCallId(debugEvents), [debugEvents])
  if (items.length === 0) return <PanelEmpty icon={<TerminalSquare className="size-4" />} text="当前 Run 没有工具调用" />
  return (
    <div className="relative max-w-4xl pl-6">
      <div className="absolute bottom-3 left-2.5 top-3 w-px bg-slate-200 dark:bg-white/10" />
      <div className="space-y-2">
        {items.map((item, index) => {
          const meta = debugMetaByCallId.get(item.callId)
          const status = meta?.status ?? (item.isError ? 'failed' : item.completed ? 'complete' : 'running')
          return (
            <details key={item.callId} className="group relative rounded-lg border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-neutral-950/40">
              <span className={cn(
                'absolute -left-[1.72rem] top-3 z-10 size-2.5 rounded-full border-2 border-white dark:border-neutral-900',
                item.isError || status === 'failed' || status === 'aborted' ? 'bg-rose-500' : item.completed ? 'bg-emerald-500' : 'bg-amber-400',
              )} />
              <summary
                className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs transition hover:bg-blue-50/70 dark:hover:bg-blue-500/10"
                onMouseDown={(event) => {
                  if (event.button === 0) onSelectToolCall?.(item.callId)
                }}
                onClick={() => onSelectToolCall?.(item.callId)}
              >
                <span className="w-6 shrink-0 font-mono text-[10px] text-slate-400">{String(index + 1).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1 break-words font-medium text-slate-700 dark:text-slate-200">{item.toolName}</span>
                {meta?.durationMs !== null && meta?.durationMs !== undefined && (
                  <span className="shrink-0 rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500 ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-white/10">
                    {formatDurationMs(meta.durationMs)}
                  </span>
                )}
                <span className="text-[10px] text-slate-400">{toolTraceStatusLabel(status)}</span>
              </summary>
              {onSelectToolCall && (
                <div className="border-t border-slate-200 px-3 py-2 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => onSelectToolCall(item.callId)}
                    className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2 text-[10px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:border-white/10 dark:bg-neutral-900 dark:hover:bg-white/5 dark:hover:text-slate-200"
                  >
                    查看 Agent
                  </button>
                </div>
              )}
              <div className="space-y-2 border-t border-slate-200 px-3 py-2 dark:border-white/10">
                <div className="grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-3">
                  <PanelMetric label="状态" value={toolTraceStatusLabel(status)} tone={status === 'failed' || status === 'aborted' ? 'danger' : status === 'complete' ? 'success' : 'warning'} />
                  <PanelMetric label="耗时" value={meta?.durationMs === null || meta?.durationMs === undefined ? '-' : formatDurationMs(meta.durationMs)} />
                  <PanelMetric label="Call ID" value={shortId(item.callId)} />
                </div>
                <CodeSnippet label="Input" value={summarizeAgentRunToolTraceArgs(item)} />
                {item.completed && <CodeSnippet label="Output" value={summarizeAgentRunToolTraceResult(item)} />}
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}

function VariablesPanel({ detail }: { detail: AgentRunDebugDetail }) {
  const snapshot = detail.snapshot
  if (!snapshot) return <PanelEmpty icon={<GitBranch className="size-4" />} text="旧 Run 没有上下文快照" />
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <PanelMetric label="工作区" value={snapshot.workspace.mode} />
      <PanelMetric label="历史" value={`${snapshot.context.historyMessageCount} messages`} />
      <PanelMetric label="记忆" value={`${snapshot.context.workspaceMemoryNoteCount} notes`} />
      <PanelMetric label="工具" value={`${snapshot.tools.toolNames.length}`} />
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
          <span className="min-w-0 break-words font-mono text-[11px]">{row.value}</span>
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
            <span className="min-w-0 flex-1 break-words text-xs font-medium text-slate-700 dark:text-slate-200">{artifact.title ?? artifact.artifactId}</span>
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

function ConversationRail({
  conversations,
  selectedId,
  onSelect,
  runs,
  selectedRunId,
  loading,
}: {
  conversations: ConversationWithMeta[]
  selectedId: string | null
  onSelect: (id: string) => void
  runs: AgentRunDebugListItem[]
  selectedRunId: string | null
  loading: boolean
}) {
  const [query, setQuery] = useState('')
  const filteredConversations = conversations.filter((conversation) => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return [
      conversation.id,
      conversation.title,
      conversation.workspaceBoundPath,
      conversation.latestRunStatus ? statusLabel(conversation.latestRunStatus) : null,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle))
  })
  const selectedConversationRuns = selectedId
    ? runs.filter((run) => run.conversationId === selectedId)
    : []
  const topLevelRuns = selectedConversationRuns.filter((run) => run.parentRunId === null)
  const runningRuns = selectedConversationRuns.filter((run) => run.status === 'running' || run.status === 'queued').length
  const failedRuns = selectedConversationRuns.filter((run) => run.status === 'failed' || run.status === 'aborted').length

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col border-r border-[var(--agenthub-border)] bg-white dark:bg-neutral-900">
      <div className="shrink-0 border-b border-[var(--agenthub-border)] p-3">
        <div className="flex items-center gap-2">
          <Clock3 className="size-4 text-[var(--agenthub-accent)]" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">会话</h2>
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索会话 / 工作区"
            className="h-8 w-full rounded-md border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] pl-8 pr-2 text-xs text-slate-700 outline-none transition focus:border-[var(--agenthub-accent)] dark:text-slate-200"
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <PanelMetric label="Runs" value={String(selectedConversationRuns.length || (conversations.find((item) => item.id === selectedId)?.runCount ?? 0))} />
          <PanelMetric label="主 Run" value={String(topLevelRuns.length)} />
          <PanelMetric label="异常" value={String(failedRuns)} tone={failedRuns > 0 ? 'danger' : 'neutral'} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="mb-1 flex items-center justify-between gap-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          <span>Conversation</span>
          <span>{filteredConversations.length}</span>
        </div>
        {filteredConversations.length === 0 ? (
          <div className="px-2 py-8 text-center text-xs text-slate-500">没有匹配的会话</div>
        ) : (
          filteredConversations.map((conversation) => {
            const selected = conversation.id === selectedId
            const currentRuns = selected ? selectedConversationRuns : []
            const runCount = currentRuns.length || conversation.runCount || 0
            const latestRunAt = currentRuns[0]?.startedAt ?? conversation.latestRunAt ?? conversation.updatedAt
            const latestRunStatus = currentRuns[0]?.status ?? conversation.latestRunStatus ?? null
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation.id)}
                className={cn(
                  'mb-1 w-full rounded-lg border px-2.5 py-2 text-left transition',
                  selected
                    ? 'border-blue-200 bg-blue-50/80 shadow-sm dark:border-blue-400/30 dark:bg-blue-500/10'
                    : 'border-transparent hover:border-[var(--agenthub-border)] hover:bg-slate-50 dark:hover:bg-white/5',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn('size-2 shrink-0 rounded-full', latestRunStatus ? statusDotClass(latestRunStatus) : 'bg-slate-300')} />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{conversation.title}</span>
                  <span className="shrink-0 text-[10px] text-slate-400">{runCount} Runs</span>
                </div>
                <div className="mt-1 flex items-center gap-2 pl-4 text-[10px] text-slate-500">
                  <span>{latestRunStatus ? statusLabel(latestRunStatus) : '暂无运行'}</span>
                  <span className="ml-auto">{relativeTime(latestRunAt)}</span>
                </div>
                {selected && (
                  <div className="mt-1 flex items-center gap-2 pl-4 text-[10px] text-slate-400">
                    <span>{loading ? '正在加载会话图' : `${topLevelRuns.length} 轮消息关联`}</span>
                    {selectedRunId && <span className="ml-auto font-mono">{formatRunLabel(selectedRunId)}</span>}
                    {runningRuns > 0 && <span className="text-blue-500">{runningRuns} running</span>}
                  </div>
                )}
              </button>
            )
          })
        )}
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

function SegmentedFilter<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ id: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            'h-6 rounded-md border px-2 text-[10px] font-medium transition',
            value === option.id
              ? 'border-[var(--agenthub-accent)] bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]'
              : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function CodeSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-slate-400">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(value)}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-slate-200"
        >
          <Copy className="size-3" />
          复制
        </button>
      </div>
      <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-slate-900 px-2 py-1.5 font-mono text-[10px] leading-4 text-slate-100">{value}</pre>
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

function collectConversationDebugEvents(
  runs: AgentRunDebugListItem[],
  debugEventsByRun: Record<string, AgentRunDebugEventRecord[]>,
): AgentRunDebugEventRecord[] {
  const runIds = new Set(runs.map((run) => run.id))
  const events = Object.values(debugEventsByRun)
    .flat()
    .filter((event) => runIds.has(event.runId))
  return dedupeDebugEvents(events)
}

function setDebugEventsByRun(
  events: AgentRunDebugEventRecord[],
  setAgentRunDebugEvents: (runId: string, events: AgentRunDebugEventRecord[]) => void,
): void {
  const byRun = new Map<string, AgentRunDebugEventRecord[]>()
  for (const event of events) {
    const bucket = byRun.get(event.runId) ?? []
    bucket.push(event)
    byRun.set(event.runId, bucket)
  }
  for (const [runId, bucket] of byRun) {
    setAgentRunDebugEvents(runId, dedupeDebugEvents(bucket))
  }
}

function dedupeDebugEvents(events: AgentRunDebugEventRecord[]): AgentRunDebugEventRecord[] {
  const byId = new Map<string, AgentRunDebugEventRecord>()
  for (const event of events) byId.set(event.id, event)
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

function summarizeMessageForTimeline(message: MessageRecord): string {
  const text = message.parts
    .flatMap((part) => (part.type === 'text' || part.type === 'code' ? [part.content] : []))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text) return summarizeRunDisplayTitle(text)
  const toolCalls = message.parts.filter((part) => part.type === 'tool_use').length
  const artifacts = message.parts.filter((part) => part.type === 'artifact_ref').length
  return `${message.parts.length} parts · ${toolCalls} tools · ${artifacts} artifacts`
}

function statusDotClass(status: AgentRunBoardStageStatus | AgentRunDebugListItem['status']): string {
  if (status === 'complete') return 'bg-emerald-500'
  if (status === 'running') return 'bg-blue-500 animate-pulse'
  if (status === 'failed' || status === 'aborted') return 'bg-rose-500'
  if (status === 'pending' || status === 'queued') return 'bg-amber-400'
  return 'bg-slate-300'
}

function debuggerStatusDotClass(status: AgentRunDebuggerStatus): string {
  if (status === 'completed') return 'bg-emerald-500'
  if (status === 'running') return 'bg-blue-500 animate-pulse'
  if (status === 'failed' || status === 'aborted') return 'bg-rose-500'
  if (status === 'waiting' || status === 'blocked') return 'bg-amber-400'
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

function debuggerStatusLabel(status: AgentRunDebuggerStatus): string {
  if (status === 'completed') return '完成'
  if (status === 'running') return '运行中'
  if (status === 'failed') return '失败'
  if (status === 'aborted') return '中止'
  if (status === 'waiting') return '等待'
  if (status === 'blocked') return '阻塞'
  return '不可用'
}

function toneForRunStatus(status: AgentRunDebugListItem['status']): AgentRunBoardTone {
  if (status === 'complete') return 'success'
  if (status === 'running') return 'info'
  if (status === 'failed' || status === 'aborted') return 'danger'
  return 'warning'
}

function stageToDebuggerStatus(status: AgentRunBoardStageStatus): AgentRunDebuggerStatus {
  if (status === 'complete') return 'completed'
  if (status === 'pending') return 'waiting'
  return status
}

function toneTextClass(tone: AgentRunBoardStage['tone']): string {
  if (tone === 'success') return 'text-emerald-600 dark:text-emerald-300'
  if (tone === 'info') return 'text-blue-600 dark:text-blue-300'
  if (tone === 'warning') return 'text-amber-600 dark:text-amber-300'
  if (tone === 'danger') return 'text-rose-600 dark:text-rose-300'
  return 'text-slate-700 dark:text-slate-200'
}

function filterAgentRunDebugEvents(
  events: AgentRunDebugEventRecord[],
  filter: AgentRunTimelineFilter,
): AgentRunDebugEventRecord[] {
  if (filter === 'all') return events
  if (filter === 'tools') {
    return events.filter((event) => event.type.includes('.tool.') || event.type === 'run.debug.terminal.output')
  }
  if (filter === 'errors') return events.filter(isFailedDebugEvent)
  return events.filter((event) => event.type.includes('.step.'))
}

function isFailedDebugEvent(event: AgentRunDebugEventRecord): boolean {
  return event.status === 'failed' || event.status === 'aborted' || event.status === 'blocked'
}

function debugEventScope(event: AgentRunDebugEventRecord): string {
  return [
    event.taskId ? `task:${event.taskId}` : null,
    event.agentId ? `agent:${shortId(event.agentId)}` : null,
    event.toolCallId ? `call:${shortId(event.toolCallId)}` : null,
  ].filter(Boolean).join(' · ') || `run:${shortId(event.runId)}`
}

function getToolDebugMetaByCallId(events: AgentRunDebugEventRecord[]): Map<string, { status: AgentRunDebugEventRecord['status']; durationMs: number | null }> {
  const result = new Map<string, { status: AgentRunDebugEventRecord['status']; durationMs: number | null }>()
  for (const event of events) {
    if (!event.toolCallId || !event.type.includes('.tool.')) continue
    const existing = result.get(event.toolCallId)
    const durationMs = numberPayload(event, 'durationMs')
    result.set(event.toolCallId, {
      status: event.status ?? existing?.status ?? null,
      durationMs: durationMs ?? existing?.durationMs ?? null,
    })
  }
  return result
}

function toolTraceStatusLabel(status: AgentRunDebugEventRecord['status'] | 'running' | 'complete' | 'failed' | 'aborted'): string {
  if (status === 'complete') return '完成'
  if (status === 'running') return '进行中'
  if (status === 'failed') return '失败'
  if (status === 'aborted') return '中止'
  if (status === 'blocked') return '阻塞'
  if (status === 'queued') return '等待'
  if (status === 'skipped') return '跳过'
  return '未知'
}

function numberPayload(event: AgentRunDebugEventRecord, key: string): number | null {
  const value = event.payload[key]
  return typeof value === 'number' ? value : null
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

function formatDurationMs(value: number): string {
  if (value < 1000) return `${value}ms`
  const seconds = Math.floor(value / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`
}

function formatCompactNumber(value: number): string {
  if (value < 1000) return String(value)
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`
  return `${(value / 1_000_000).toFixed(1)}m`
}

function compactModelName(value: string): string {
  if (value.length <= 18) return value
  return value.replace(/^deepseek-/, 'ds-').slice(0, 18)
}

function formatRunLabel(id: string): string {
  const match = id.match(/(\d+)$/)
  return match ? `Run #${match[1]}` : `Run ${shortId(id)}`
}

function formatClockTime(value: number): string {
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function timelineToneDotClass(tone: AgentRunBoardTone): string {
  if (tone === 'success') return 'bg-emerald-500'
  if (tone === 'info') return 'bg-blue-500'
  if (tone === 'warning') return 'bg-amber-400'
  if (tone === 'danger') return 'bg-rose-500'
  return 'bg-slate-300'
}

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 10)}…` : id
}

function renderDebuggerNodeDescription(data: AgentRunDebuggerNodeData): string {
  if (data.kind === 'message' && data.message) {
    return `${data.message.role} · ${data.message.runIds.length} runs`
  }
  if (data.kind === 'summary') return '合并各 Agent 结果，生成最终输出'
  if (data.kind === 'run' && data.run) {
    return `${debuggerStatusLabel(data.run.status)} · ${data.run.modelId ?? 'unknown model'}`
  }
  if (data.kind === 'tool' && data.tool) {
    return `${data.tool.agentName ?? data.tool.agentId} · ${data.tool.toolName}`
  }
  if (data.kind === 'agent' && data.agent) {
    const role = data.agent.role === 'orchestrator' ? 'Orchestrator' : 'Agent'
    return `${role} · ${data.agent.taskIds.length} tasks · ${data.agent.toolCallCount} tools`
  }
  if (data.kind === 'task' && data.task) {
    return data.task.title
  }
  return debuggerStatusLabel(data.status)
}

function StatusPill({ status }: { status: AgentRunDebugListItem['status'] }) {
  const tone = status === 'complete' ? 'success' : status === 'running' ? 'info' : status === 'failed' || status === 'aborted' ? 'danger' : 'warning'
  return <span className={cn('agenthub-status-badge', `agenthub-status-${tone}`)}>{statusLabel(status)}</span>
}

function getPreferredInspectorTab(
  node: AgentRunDebuggerNode,
  detail: AgentRunDebugDetail,
  debugEvents: AgentRunDebugEventRecord[],
): InspectorTab {
  if (node.data.kind === 'message') return 'logs'
  if (node.data.kind === 'tool') return 'trace'
  if (node.data.kind === 'summary') return 'artifacts'
  if (node.data.kind === 'task') return 'logs'
  if (node.data.kind !== 'agent') return 'logs'

  const toolTrace = projectAgentRunToolTrace(detail)
  const operations = projectAgentRunOperations(toolTrace)
  const hasTerminalEvidence = operations.commands.length > 0 || debugEvents.some((event) => event.type === 'run.debug.terminal.output')
  if (hasTerminalEvidence) return 'terminal'
  if ((node.data.agent?.toolCallCount ?? 0) > 0 || toolTrace.length > 0 || (node.data.agent?.toolNames.length ?? 0) > 0) return 'trace'
  return 'logs'
}
