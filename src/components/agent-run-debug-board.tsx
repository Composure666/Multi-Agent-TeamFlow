'use client'

import {
  Activity,
  AlertTriangle,
  ArrowDown,
  Bot,
  ChevronDown,
  ChevronRight,
  Check,
  Clock3,
  Copy,
  Cpu,
  Database,
  Eraser,
  FileCode2,
  GitBranch,
  BookOpen,
  Loader2,
  Maximize2,
  MessageSquare,
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
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
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
  triggerExperienceReflection,
} from '@/lib/api'
import {
  projectAgentRunArtifacts,
  projectAgentRunLifecycle,
  projectAgentRunOperations,
  projectAgentRunToolTrace,
  projectRunsLifecycle,
  summarizeAgentRunToolTraceArgs,
  summarizeAgentRunToolTraceResult,
  type AgentRunLifecycleItem,
  type AgentRunToolTraceItem,
} from '@/lib/agent-run-debug-projection'
import {
  buildAgentRunDebuggerGraph,
  buildAgentRunInspectorViewModel,
  buildAgentRunToolInspectorViewModel,
  buildAgentRunSessionDebuggerGraph,
  describeAgentRunDebugEvent,
  focusAgentRunDebuggerGraph,
  getDebuggerNodeIdForDebugEvent,
  getVisibleAgentDebuggerSteps,
  mergeDetailWithLiveStatus,
  mergeLiveRuns,
  projectAgentRunTerminalOutput,
  shouldInitializeDebuggerSelection,
  projectAgentRunBoardStages,
  rootTaskLabel,
  summarizeRunDisplayTitle,
  type AgentRunDebuggerNodeData,
  type AgentRunDebuggerGraph,
  type AgentRunDebuggerNode,
  type AgentRunDebuggerStep,
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
  type AgentRunTimelineFilter,
} from '@/lib/agent-run-debug-view'
import { cn } from '@/lib/utils'
import type { ConversationWithMeta } from '@/db/schema'
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
import type { AgentRunDebugDetail, AgentRunDebugEventRecord, AgentRunDebugListItem, TerminalEventRecord, TerminalSessionRecord } from '@/shared/types'

const nodeTypes: NodeTypes = {
  runDebuggerNode: DebuggerNode,
}

type InspectorTab = 'overview' | 'terminal' | 'logs' | 'trace' | 'variables' | 'artifacts'
type CanvasGraphScope = 'session' | 'run'

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
  const openConversation = useAppStore((state) => state.openConversation)
  const setActiveConversation = useAppStore((state) => state.setActiveConversation)
  const agents = useAppStore((state) => state.agents)
  const [conversationId, setConversationId] = useState<string | null>(targetConversationId ?? activeConversationId ?? conversations[0]?.id ?? null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedStageId, setSelectedStageId] = useState<AgentRunBoardStage['id'] | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [inspectorRunId, setInspectorRunId] = useState<string | null>(null)
  const [selectedToolCallId, setSelectedToolCallId] = useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [leftRailCollapsed, setLeftRailCollapsed] = useState(false)
  const [pendingInspectorEvent, setPendingInspectorEvent] = useState<AgentRunDebugEventRecord | null>(null)
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [pausingRun, setPausingRun] = useState(false)
  const [rerunningRun, setRerunningRun] = useState(false)
  const [reflectingRun, setReflectingRun] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview')
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
  const addNotification = useAppStore((state) => state.addNotification)

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
  // P1 修复：currentDetail 不再是 cachedDetail 的原样副本。
  // SSE 实时更新 runs[i].status，但 cached detail 里 agentRun/childrenRuns 的 status 字段
  // 只有 loadDetail 时拉一次。为避免 "时间线已完成但流程图还在 running" 的撕裂，
  // 在这里把 cachedDetail 上叠加当前 live status 派生一个新 detail 供下游使用。
  const currentDetail = useMemo(() => {
    if (!selectedDetail || !selectedRun || selectedDetail.agentRun.id !== selectedRun.id) return null
    return mergeDetailWithLiveStatus(selectedDetail, runs)
  }, [selectedDetail, selectedRun, runs])
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
  // 重新运行仅作用于会话最后一条 user 消息（与聊天面板语义一致），
  // 因此只要 selectedRun 是顶层 Run（任何顶层 Run）且不在 running 状态，即可触发。
  const canRerunSelected = Boolean(
    selectedRun && selectedRun.parentRunId === null && selectedRun.status !== 'running',
  )
  const selectedNode = selectedNodeId ? activeGraph.nodes.find((node) => node.id === selectedNodeId) ?? null : null
  const inspectorDetailRaw = inspectorRunId && selectedInspectorDetail?.agentRun.id === inspectorRunId
    ? selectedInspectorDetail
    : currentDetail
  // Inspector 用 currentDetail 时已经派生过；若 inspectorRunId 指向子 run，
  // 也用 cachedDetail + live runs 派生一份。
  const inspectorDetail = useMemo(() => {
    if (!inspectorDetailRaw) return null
    if (inspectorDetailRaw === currentDetail) return inspectorDetailRaw
    return mergeDetailWithLiveStatus(inspectorDetailRaw, runs)
  }, [inspectorDetailRaw, currentDetail, runs])
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
      // 跳过 SSE 已写入的 sessions —— 避免 fetchTerminalSessionsForRun 慢响应或返回空覆盖本地状态。
      const haveSseSessions = useAppStore.getState().terminalSessionsByRun[runId]?.length
      const [detail, events, terminalSessions] = await Promise.all([
        fetchAgentRunDebugDetail(targetConversationId, runId),
        fetchAgentRunDebugEvents(targetConversationId, runId),
        haveSseSessions ? Promise.resolve([] as TerminalSessionRecord[]) : fetchTerminalSessionsForRun(targetConversationId, runId),
      ])
      setAgentRunDebugDetail(runId, detail)
      setAgentRunDebugEvents(runId, events)
      if (!haveSseSessions) {
        setTerminalSessionsForRun(runId, terminalSessions)
      }
      // 始终补全每个 session 的 events —— SSE 漏掉的事件可在此补回。
      // 若 SSE 已经写过 events，dedupeAndSortTerminalEvents 会保证唯一性。
      const sessionsToFetchEventsFor = haveSseSessions
        ? useAppStore.getState().terminalSessionsByRun[runId] ?? []
        : terminalSessions
      await Promise.all(sessionsToFetchEventsFor.map(async (session) => {
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
    setInspectorTab('overview')
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
    setInspectorTab('overview')
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

  // 兜底：SSE run.end 后立即多 fetch 1 次 detail，把 finishedAt / usage / error / childrenRuns
  // 的最终状态从后端拉回，覆盖 cached detail。
  useEffect(() => {
    if (!conversationId || !selectedRun?.id) return
    if (selectedRun.status === 'running' || selectedRun.status === 'queued') return
    const runId = selectedRun.id
    const handle = window.setTimeout(() => {
      void loadDetail(conversationId, runId)
    }, 200)
    return () => window.clearTimeout(handle)
  }, [conversationId, loadDetail, selectedRun?.id, selectedRun?.status])

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
    setInspectorTab('overview')
    setCanvasView('graph')
    setCanvasGraphScope('session')
    setExpandedSessionRunIds([runId])
  }

  const selectTimelineRun = (runId: string) => {
    selectRun(runId)
    setInspectorOpen(true)
    setInspectorTab('overview')
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
      addNotification({
        id: `rerun-${nextRunId ?? Date.now()}`,
        title: '重新运行已发起',
        body: '将以会话最后一条提问重新生成，新 Run 已自动选中。',
        level: 'info',
        source: 'agent_run',
        createdAt: Date.now(),
        runId: nextRunId ?? undefined,
        conversationId,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      addNotification({
        id: `rerun-error-${Date.now()}`,
        title: '重新运行失败',
        body: err instanceof Error ? err.message : String(err),
        level: 'error',
        source: 'agent_run',
        createdAt: Date.now(),
        conversationId,
      })
    } finally {
      setRerunningRun(false)
    }
  }

  const reflectSelectedRun = async () => {
    if (!selectedRun || reflectingRun) return
    setReflectingRun(true)
    try {
      const result = await triggerExperienceReflection(selectedRun.id)
      addNotification({
        id: `reflect-${Date.now()}`,
        title: result.saved > 0 ? `已沉淀 ${result.saved} 条经验` : '未沉淀经验',
        body:
          result.saved > 0
            ? '已写入经验库，可在侧栏「资产」查看。'
            : '该 Run 没有提炼出可沉淀的经验（可能不满足提取条件）。',
        level: 'info',
        source: 'agent_run',
        createdAt: Date.now(),
        runId: selectedRun.id,
        conversationId: conversationId ?? undefined,
      })
    } catch (err) {
      console.error('[DebugBoard] reflect failed', err)
      addNotification({
        id: `reflect-error-${Date.now()}`,
        title: '沉淀经验失败',
        body: err instanceof Error ? err.message : String(err),
        level: 'error',
        source: 'agent_run',
        createdAt: Date.now(),
        conversationId: conversationId ?? undefined,
      })
    } finally {
      setReflectingRun(false)
    }
  }

  const selectStage = (stageId: AgentRunBoardStage['id']) => {
    setSelectedStageId(stageId)
    setInspectorOpen(true)
    setInspectorTab('logs')
  }

  const backToConversation = () => {
    if (!conversationId) return
    clearRunBoardTarget()
    openConversation(conversationId)
  }

  const selectCanvasView = (view: AgentRunDebuggerCanvasView) => {
    setCanvasView(view)
  }

  const selectCanvasGraphScope = (scope: CanvasGraphScope) => {
    setCanvasGraphScope(scope)
    setCanvasView('graph')
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
    setInspectorTab(defaultNode && currentDetail ? getPreferredInspectorTab(defaultNode, currentDetail, selectedDebugEvents) : 'overview')
  }, [activeGraph, currentDetail, inspectorOpen, selectedDebugEvents, selectedNodeId])

  useEffect(() => {
    if (!pendingInspectorEvent || !currentDetail || pendingInspectorEvent.runId !== currentDetail.agentRun.id) return
    const nodeId = getDebuggerNodeIdForDebugEvent(activeGraph, pendingInspectorEvent)
    if (nodeId && activeGraph.nodes.some((node) => node.id === nodeId)) setSelectedNodeId(nodeId)
    setInspectorRunId(null)
    setInspectorOpen(true)
    setInspectorTab(pendingInspectorEvent.type.includes('.tool.') ? 'trace' : 'logs')
    setPendingInspectorEvent(null)
  }, [activeGraph, currentDetail, pendingInspectorEvent])

  const selectGraphNode = (nodeId: string) => {
    const node = activeGraph.nodes.find((item) => item.id === nodeId)
    if (!node) return
    if (node.data.kind === 'run' && node.data.run?.id && node.data.run.id !== selectedRunId) {
      selectRun(node.data.run.id)
      setSelectedNodeId(nodeId)
      setInspectorOpen(true)
      setInspectorTab('overview')
      setSelectedToolCallId(null)
      if (canvasGraphScope === 'session') {
        setExpandedSessionRunIds([node.data.run.id])
      }
      return
    }
    setSelectedNodeId(nodeId)
    setInspectorOpen(true)
    setInspectorTab(currentDetail ? getPreferredInspectorTab(node, currentDetail, selectedDebugEvents) : 'overview')
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
      setInspectorTab(event.type.includes('.tool.') ? 'trace' : 'logs')
      setSelectedToolCallId(event.toolCallId ?? null)
      return
    }
    const nodeId = getDebuggerNodeIdForDebugEvent(activeGraph, event)
    if (nodeId) {
      setCanvasView('graph')
      selectGraphNode(nodeId)
    }
    else setInspectorOpen(true)
    if (event.type.includes('.tool.')) setInspectorTab('trace')
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
      setInspectorTab('trace')
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
    setInspectorTab('trace')
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
              variant="outline"
              className="gap-1.5"
              disabled={!selectedRun || reflectingRun}
              title="对选中的 Run 立即执行反思，提炼可复用经验写入资产库"
              onClick={() => void reflectSelectedRun()}
            >
              {reflectingRun ? <Loader2 className="size-3.5 animate-spin" /> : <BookOpen className="size-3.5" />}
              沉淀经验
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!conversationId}
              title="打开当前正在查看的会话"
              onClick={backToConversation}
            >
              <MessageSquare className="size-3.5" />
              回到会话
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-[var(--agenthub-accent)] text-white hover:bg-[var(--agenthub-accent-hover)]"
              disabled={!canRerunSelected || rerunningRun}
              title={
                !canRerunSelected
                  ? selectedRun?.parentRunId !== null
                    ? '只能重新运行顶层 Run'
                    : selectedRun?.status === 'running'
                      ? '当前 Run 还在运行'
                      : '请先选择一个 Run'
                  : latestTopLevelRun && latestTopLevelRun.id !== selectedRun?.id
                    ? '将以会话最后一条提问重新生成（不是当前选中 Run 的复现）'
                    : '重新运行（删除当前回答，重新让 agent 回答最后一条提问）'
              }
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
        {!focusMode && currentDetail && (
          <div className="mt-2 flex h-12 shrink-0 items-center border-t border-[var(--agenthub-border)]">
            <RunStageProgress
              stages={stages}
              runStatus={currentDetail.agentRun.status}
              activeStageId={selectedStageId}
              onSelectStage={selectStage}
            />
          </div>
        )}
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
          ? 'grid-cols-1'
          : leftRailCollapsed
            ? showInspector
              ? 'md:grid-cols-[68px_minmax(0,1fr)_340px]'
              : 'md:grid-cols-[68px_minmax(0,1fr)]'
            : showInspector
              ? 'md:grid-cols-[228px_minmax(0,1fr)_340px] xl:grid-cols-[240px_minmax(0,1fr)_340px]'
              : 'md:grid-cols-[228px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]',
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
              collapsed={leftRailCollapsed}
              onToggleCollapsed={() => setLeftRailCollapsed((current) => !current)}
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
                        runs={runs}
                        filter={timelineFilter}
                        onSelectRun={selectTimelineRun}
                        onJumpToEvents={() => {
                          setCanvasGraphScope('run')
                          selectCanvasView('events')
                        }}
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
        </main>

        {!focusMode && visibleInspectorDetail && showInspector && (
          <aside className="hidden min-h-0 xl:block">
            <DetailsPanel
              detail={visibleInspectorDetail}
              selectedNode={selectedNode}
              tab={inspectorTab}
              onTabChange={setInspectorTab}
              onClose={closeInspector}
              debugEvents={inspectorDebugEvents}
              terminalSessions={inspectorTerminalSessions}
              terminalEventsBySession={terminalEventsBySession}
              onSelectToolCall={selectToolCall}
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
  const muted = data.status === 'pending' || data.status === 'cancelled'
  const focusMuted = data.emphasis === 'muted'
  const isRunning = data.status === 'running'
  return (
    <>
      <Handle type="target" position={Position.Top} className="!size-2 !border-0 !bg-slate-300" />
      <div
        className={cn(
          'relative rounded-lg border bg-white shadow-[0_16px_40px_rgba(31,55,86,.12)] transition dark:bg-neutral-900',
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
          isRunning && 'before:absolute before:inset-0 before:rounded-lg before:border before:border-blue-400/60 before:opacity-100 before:[animation:agenthub-pulse-ring_1.6s_ease-out_infinite]',
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
            <NodeAgentCurrentStep steps={data.agent.steps} fallbackItems={data.agent.taskTitles} status={data.status} expanded={expanded} />
            <NodeToolSummary tools={data.agent.toolNames} toolCount={data.agent.toolCallCount} expanded={expanded} />
          </>
        )}

        {data.kind === 'tool' && data.tool && (
          <div className="mt-3 rounded-md bg-slate-50 px-2.5 py-1.5 text-[10px] leading-5 text-slate-600 dark:bg-white/5 dark:text-slate-300">
            <div className="truncate font-medium text-slate-700 dark:text-slate-200">
              {data.tool.toolName}
              {data.tool.agentName ? <span className="ml-1 font-normal text-slate-500">· {data.tool.agentName}</span> : null}
            </div>
            <div className="mt-0.5 line-clamp-1 break-words">{data.tool.summary || '暂无输入摘要'}</div>
          </div>
        )}

        {data.kind === 'task' && data.task && (
          <>
            <div className="mt-3 line-clamp-2 text-[11px] leading-5 text-slate-600 dark:text-slate-300">
              {data.task.title}
            </div>
            <NodeToolSummary tools={data.task.toolNames} toolCount={data.task.toolNames.length} expanded />
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

function NodeAgentCurrentStep({
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
  // 折叠态只展示「当前步骤 + 总数」，展开态才展示完整步骤列表 —— 避免任务节点内部堆积。
  const runningIndex = steps.findIndex((step) => step.status === 'running')
  const currentIndex = runningIndex >= 0 ? runningIndex : status === 'running' ? 0 : -1
  const currentStep = currentIndex >= 0 ? steps[currentIndex] : null
  const currentTitle = currentStep?.title
    ?? (steps[0]?.title ?? null)
    ?? (fallbackItems[0] ?? null)
  const totalCount = steps.length || fallbackItems.length
  if (!currentTitle) return null

  if (!expanded) {
    return (
      <div className="mt-3 flex min-w-0 items-center gap-2 rounded-md border-t border-slate-100 pt-3 text-[11px] dark:border-white/10">
        <span className={cn(
          'flex size-3.5 shrink-0 items-center justify-center rounded-full border',
          currentStep?.status === 'running' || (status === 'running' && !currentStep)
            ? 'border-blue-300'
            : currentStep?.status === 'completed'
              ? 'border-emerald-300'
              : currentStep?.status === 'failed' || currentStep?.status === 'cancelled'
                ? 'border-rose-300'
                : 'border-slate-300',
        )}>
          <span className={cn(
            'size-1.5 rounded-full',
            currentStep?.status === 'running' || (status === 'running' && !currentStep)
              ? 'bg-blue-500 animate-pulse'
              : currentStep?.status === 'completed'
                ? 'bg-emerald-500'
                : currentStep?.status === 'failed' || currentStep?.status === 'cancelled'
                  ? 'bg-rose-500'
                  : 'bg-slate-300',
          )} />
        </span>
        <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{currentTitle}</span>
        <span className="shrink-0 text-[10px] text-slate-400">
          {currentIndex >= 0 && totalCount > 1 ? `${currentIndex + 1}/${totalCount}` : `共 ${totalCount}`}
        </span>
      </div>
    )
  }

  const { steps: visibleSteps, hiddenCount } = getVisibleAgentDebuggerSteps(steps, true)
  if (visibleSteps.length === 0) return null
  return (
    <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 dark:border-white/10">
      {visibleSteps.map((step, index) => {
        const isCurrent = index === currentIndex
        return (
          <div
            key={step.id}
            className={cn(
              'min-w-0 rounded-md px-1.5 py-1 text-[11px] text-slate-600 transition dark:text-slate-300',
              isCurrent && 'bg-blue-50/80 ring-1 ring-blue-200 dark:bg-blue-500/15 dark:ring-blue-400/30',
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn('size-2 shrink-0 rounded-full', debuggerStatusDotClass(step.status), isCurrent && 'animate-pulse')} />
              <span className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-200">{step.title}</span>
              {isCurrent && (
                <span className="shrink-0 rounded bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-medium text-blue-700 dark:text-blue-300">当前</span>
              )}
              {step.dependsOn.length > 0 && !isCurrent && (
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-500 dark:bg-white/10">
                  dep {step.dependsOn.length}
                </span>
              )}
            </div>
          </div>
        )
      })}
      {hiddenCount > 0 && (
        <div className="pl-4 text-[10px] text-slate-400">+{hiddenCount} 个步骤</div>
      )}
    </div>
  )
}

function NodeToolSummary({
  tools,
  toolCount,
  expanded = false,
}: {
  tools: string[]
  toolCount: number
  expanded?: boolean
}) {
  if (toolCount === 0 && tools.length === 0) return null
  // 折叠态：单行「Tools N · a, b, c」摘要，避免展开工具芯片堆叠。
  // 展开态：保留原本的芯片网格（外部仍可通过 NodeToolChips 调用，这里负责折叠态）。
  if (!expanded) {
    const preview = tools.slice(0, 3).join(' · ')
    return (
      <div className="mt-2 flex min-w-0 items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
        <Wrench className="size-3 shrink-0" />
        <span className="shrink-0 font-medium">Tools {toolCount}</span>
        {preview ? (
          <span className="min-w-0 truncate text-slate-400">· {preview}{tools.length > 3 ? ' …' : ''}</span>
        ) : null}
      </div>
    )
  }
  return <NodeToolChips tools={tools} expanded />
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
  if (status === 'failed' || status === 'cancelled') return 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
  return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
}

function DetailsPanel({
  detail,
  selectedNode,
  tab,
  onTabChange,
  onClose,
  debugEvents,
  terminalSessions,
  terminalEventsBySession,
  onSelectToolCall,
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
  onTerminalInput: (sessionId: string, input: string) => Promise<void>
  selectedToolCallId: string | null
}) {
  const selectedAgentId = detail.agentRun.agentId
  const toolTrace = projectAgentRunToolTrace(detail)
  const agentToolTrace = filterToolTraceForInspectorAgent(toolTrace, {
    detail,
    debugEvents,
    agent: null,
  })
  const terminalOutput = projectAgentRunTerminalOutput(detail, debugEvents, selectedAgentId)
  const realTerminal = projectRealAgentTerminalOutput(terminalSessions, terminalEventsBySession, selectedAgentId)
  const inspectorView = buildAgentRunInspectorViewModel(detail, selectedNode, agentToolTrace)
  const toolInspectorView = buildAgentRunToolInspectorViewModel(detail, agentToolTrace, debugEvents, selectedToolCallId)
  const tabs: Array<{ id: InspectorTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: '概览', icon: <Activity className="size-3" /> },
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
              {inspectorIcon(inspectorView.kind)}
              Details
            </div>
            <div className="mt-2 flex min-w-0 items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">
                {selectedNode?.data.label ?? detail.agentRun.agentName ?? '运行详情'}
              </h2>
              {selectedNode && (
                <span className={cn('size-2 shrink-0 rounded-full', debuggerStatusDotClass(selectedNode.data.status))} />
              )}
            </div>
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
              {selectedNode ? inspectorView.subtitle : '点击流程图中的节点查看完整详情'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="关闭详情">
            <X className="size-4" />
          </button>
        </div>
      </div>

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
        {tab === 'overview' ? (
          <DetailsOverview
            detail={detail}
            selectedNode={selectedNode}
            toolInspectorView={toolInspectorView}
            onJumpToTab={(next) => onTabChange(next)}
            onSelectToolCall={onSelectToolCall}
          />
        ) : tab === 'terminal' ? (
          <TerminalPanel
            terminal={terminalOutput}
            realTerminal={realTerminal}
            onInput={onTerminalInput}
            hasChildRuns={detail.childrenRuns.length > 0}
          />
        ) : tab === 'logs' ? (
          <LogsPanel detail={detail} debugEvents={debugEvents} />
        ) : tab === 'trace' ? (
          <ToolTracePanel detail={detail} debugEvents={debugEvents} onSelectToolCall={onSelectToolCall} />
        ) : tab === 'variables' ? (
          <VariablesPanel detail={detail} />
        ) : (
          <ArtifactsPanel detail={detail} />
        )}
      </div>
    </aside>
  )
}

function DetailsOverview({
  detail,
  selectedNode,
  toolInspectorView,
  onJumpToTab,
  onSelectToolCall,
}: {
  detail: AgentRunDebugDetail
  selectedNode: AgentRunDebuggerGraph['nodes'][number] | null
  toolInspectorView: AgentRunToolInspectorViewModel | null
  onJumpToTab: (tab: InspectorTab) => void
  onSelectToolCall: (callId: string) => void
}) {
  if (selectedNode?.data.kind === 'tool' && toolInspectorView) {
    return <ToolInspectorSummary view={toolInspectorView} onJumpToTools={() => onJumpToTab('trace')} />
  }
  const rawInspectorView = buildAgentRunInspectorViewModel(
    detail,
    selectedNode,
    projectAgentRunToolTrace(detail),
  )
  const inspectorView = rawInspectorView as AgentRunInspectorViewModel
  return (
    <div className="space-y-3">
      <section className="grid grid-cols-2 gap-2">
        {inspectorView.metrics.map((metric) => (
          <PanelMetric key={metric.label} label={metric.label} value={formatInspectorMetric(metric)} />
        ))}
      </section>
      <CurrentTaskSummary task={inspectorView.currentTask} />
      {inspectorView.fields.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-900">
          <div className="grid gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            {inspectorView.fields.map((field) => (
              <div key={field.label} className="flex items-center justify-between gap-2">
                <span>{field.label}</span>
                <span className="min-w-0 truncate font-mono text-slate-700 dark:text-slate-200">{field.value}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onJumpToTab('terminal')}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-200 dark:hover:bg-white/5"
        >
          <TerminalSquare className="size-3" />
          查看终端
        </button>
        <button
          type="button"
          onClick={() => onJumpToTab('trace')}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-200 dark:hover:bg-white/5"
        >
          <Activity className="size-3" />
          查看工具调用
        </button>
        <button
          type="button"
          onClick={() => onJumpToTab('logs')}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-200 dark:hover:bg-white/5"
        >
          <FileCode2 className="size-3" />
          查看日志
        </button>
      </section>
      {toolInspectorView && (
        <button
          type="button"
          onClick={() => onSelectToolCall(toolInspectorView.callId)}
          className="hidden"
          aria-hidden
        />
      )}
    </div>
  )
}

function ToolInspectorSummary({
  view,
  onJumpToTools,
}: {
  view: AgentRunToolInspectorViewModel
  onJumpToTools?: () => void
}) {
  return (
    <div className="space-y-2">
      <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-900">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">工具</div>
            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{view.title}</div>
          </div>
          <span className={cn('rounded px-1.5 py-0.5 text-[10px]', view.status === 'completed' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : view.status === 'running' ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300' : view.status === 'failed' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300')}>
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
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Output</div>
          {onJumpToTools && (
            <button
              type="button"
              onClick={onJumpToTools}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--agenthub-accent)] hover:bg-[var(--agenthub-accent-soft)]"
            >
              查看工具调用
            </button>
          )}
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-slate-900 dark:text-slate-100">{view.output || '-'}</p>
      </section>
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

type StageVisualState = 'done' | 'current' | 'todo'

// 三态模型：✓ 已完成（绿）/ ● 当前执行（蓝）/ ○ 未开始（灰）。
// run 完成时整条全绿（含旧 run 缺快照数据的前置阶段）。
// failed/aborted 的 run 把"最后到达"的阶段视作当前阶段，失败细节由头部状态徽标与悬停说明承载。
function stageVisualState(
  stage: AgentRunBoardStage,
  runStatus: AgentRunDebugListItem['status'],
): StageVisualState {
  if (runStatus === 'complete') return 'done'
  if (stage.status === 'complete') return 'done'
  if (stage.status === 'running' || stage.status === 'failed' || stage.status === 'aborted') return 'current'
  return 'todo'
}

function RunStageProgress({
  stages,
  runStatus,
  activeStageId,
  onSelectStage,
}: {
  stages: AgentRunBoardStage[]
  runStatus: AgentRunDebugListItem['status']
  activeStageId: AgentRunBoardStage['id'] | null
  onSelectStage: (stageId: AgentRunBoardStage['id']) => void
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center overflow-x-auto">
      {stages.map((stage, index) => {
        const visual = stageVisualState(stage, runStatus)
        return (
          <div key={stage.id} className="flex shrink-0 items-center">
            {index > 0 && (
              <div
                className={cn(
                  'h-px w-5 xl:w-8',
                  stageVisualState(stages[index - 1], runStatus) === 'done'
                    ? 'bg-emerald-500/70'
                    : 'bg-slate-200 dark:bg-white/10',
                )}
              />
            )}
            <button
              type="button"
              onClick={() => onSelectStage(stage.id)}
              title={`${stage.title} · ${stage.metric}\n${stage.description}`}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs transition hover:bg-slate-100 dark:hover:bg-white/5',
                visual === 'current' && 'bg-[var(--agenthub-accent-soft)]',
                activeStageId === stage.id && 'ring-1 ring-inset ring-[var(--agenthub-accent-border)]',
              )}
            >
              <StageStateDot state={visual} />
              <span className={stageLabelClass(visual)}>{stage.title}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

function StageStateDot({ state }: { state: StageVisualState }) {
  if (state === 'done') {
    return (
      <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Check className="size-2.5" strokeWidth={3} />
      </span>
    )
  }
  if (state === 'current') {
    return <span className="size-2.5 shrink-0 rounded-full bg-[var(--agenthub-accent)]" />
  }
  return <span className="size-2.5 shrink-0 rounded-full border-[1.5px] border-slate-300 dark:border-white/25" />
}

function stageLabelClass(state: StageVisualState): string {
  if (state === 'done') return 'text-emerald-600 dark:text-emerald-400'
  if (state === 'current') return 'font-semibold text-[var(--agenthub-accent)]'
  return 'text-slate-400 dark:text-slate-500'
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
  /** 仅 orphan events 回退路径下存在 —— 用于诊断 fallback 来源。 */
  latestAgentId?: string
}

function TerminalPanel({
  terminal,
  realTerminal,
  onInput,
  hasChildRuns,
}: {
  terminal: AgentRunTerminalOutput
  realTerminal: RealAgentTerminalOutput
  onInput: (sessionId: string, input: string) => Promise<void>
  hasChildRuns: boolean
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
    return (
      <PanelEmpty
        icon={<TerminalSquare className="size-4" />}
        text="该 Run 未执行终端命令"
        hint={hasChildRuns ? '子 Agent 的命令显示在对应节点中，点击图中 Agent 节点查看' : undefined}
      />
    )
  }
  return (
    <TerminalDisplay
      activeTerminal={activeTerminal}
      heightClassName="min-h-[300px] max-h-[640px]"
      inputSlot={
        canInput ? (
          <>
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
          </>
        ) : undefined
      }
    />
  )
}

/**
 * 只读终端展示 — Inspector 与底部 BottomPanel 复用。
 * 提供：
 *  - 等宽字体 + 12px 字号（Geist Mono via font-mono）
 *  - whitespace-pre 不换行 + 横向滚动（Windows 路径 / URL / 命令完整保留）
 *  - 自动滚动到底部，鼠标上滚后停跟，底部出现『↓ 回到底部』按钮
 *  - 头部：shell + cwd + 状态色 badge（运行中/已完成/等待输入/失败）+ 复制 + 清空
 */
function TerminalDisplay({
  activeTerminal,
  inputSlot,
  heightClassName,
}: {
  activeTerminal: { status: 'live' | 'complete' | 'completed' | 'failed' | 'waiting' | 'empty'; shell: string; cwd: string | null; transcript: string }
  inputSlot?: React.ReactNode
  heightClassName?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showJumpButton, setShowJumpButton] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const displayTranscript = cleared ? '' : activeTerminal.transcript

  // 跟随滚动逻辑：新内容到达时，若开启 auto-scroll，自动滚到底；
  // 否则保持当前位置并显示「↓ 回到底部」按钮。
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !autoScroll) return
    el.scrollTop = el.scrollHeight
  }, [displayTranscript, autoScroll])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    const distanceFromBottom = max - el.scrollTop
    const isAtBottom = distanceFromBottom <= 8
    setAutoScroll(isAtBottom)
    setShowJumpButton(!isAtBottom && displayTranscript.length > 0)
  }, [displayTranscript.length])

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    setAutoScroll(true)
    setShowJumpButton(false)
  }, [])

  const handleCopy = useCallback(async () => {
    if (!activeTerminal.transcript) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeTerminal.transcript)
      } else {
        const el = document.createElement('textarea')
        el.value = activeTerminal.transcript
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
      }
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1400)
    } catch {
      setCopyState('idle')
    }
  }, [activeTerminal.transcript])

  const normalizedStatus: 'live' | 'complete' | 'failed' | 'waiting' = (() => {
    if (activeTerminal.status === 'completed') return 'complete'
    if (activeTerminal.status === 'empty') return 'complete'
    return activeTerminal.status
  })()
  // 头部状态严格收口到规范三态：● 运行中 / ✓ 已完成 / ✕ 失败；另保留 ● 等待输入 以承载交互态。
  const statusBadge = (() => {
    if (normalizedStatus === 'live') {
      return { label: '● 运行中', cls: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30' }
    }
    if (normalizedStatus === 'waiting') {
      return { label: '● 等待输入', cls: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30' }
    }
    if (normalizedStatus === 'failed') {
      return { label: '✕ 失败', cls: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30' }
    }
    return { label: '✓ 已完成', cls: 'bg-white/10 text-slate-300' }
  })()

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-950 font-mono text-[12px] leading-6 text-slate-100 shadow-inner', heightClassName)}>
      <div className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-1.5 text-[11px] text-slate-400">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <TerminalSquare className="size-3.5 shrink-0 text-slate-500" />
            <span className="font-semibold text-slate-200">终端</span>
            <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px]', statusBadge.cls)}>{statusBadge.label}</span>
          </div>
          <div className="mt-0.5 truncate text-slate-500">{activeTerminal.shell}{activeTerminal.cwd ? ` · ${activeTerminal.cwd}` : ''}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setAutoScroll((current) => !current)}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] transition',
              autoScroll
                ? 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/30 hover:bg-blue-500/20'
                : 'hover:bg-white/10 hover:text-slate-200 text-slate-400',
            )}
            aria-label={autoScroll ? '关闭自动滚到底部' : '开启自动滚到底部'}
            title={autoScroll ? '自动滚动开启（点击关闭）' : '自动滚动关闭（点击开启）'}
          >
            <ArrowDown className="size-3" />
            {autoScroll ? '自动滚动' : '已暂停'}
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={!activeTerminal.transcript}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] hover:bg-white/10 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="复制终端输出"
          >
            <Copy className="size-3" />
            {copyState === 'copied' ? '已复制' : '复制'}
          </button>
          <button
            type="button"
            onClick={() => setCleared(true)}
            disabled={cleared || !activeTerminal.transcript}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] hover:bg-white/10 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="清空终端显示（不影响实际日志）"
          >
            <Eraser className="size-3" />
            清空
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-auto"
        >
          {/* 长行（路径 / URL / 报错堆栈）走 inline-block + min-w-full，让外层容器横向滚动，
              而不会撑开导致竖向出现滚动条 —— 符合"不强制换行 + 横向滚动优先"。 */}
          <div className="min-w-max px-4 py-3 whitespace-pre">
            {displayTranscript}
            {!displayTranscript && (
              <div className="whitespace-normal text-slate-500 italic">（暂无输出，等待终端产生内容…）</div>
            )}
          </div>
        </div>
        {showJumpButton && (
          <button
            type="button"
            onClick={jumpToBottom}
            className="absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-slate-900/95 px-3 py-1 text-[11px] text-slate-200 shadow-md backdrop-blur transition hover:bg-slate-800"
            aria-label="回到底部并开启自动滚动"
          >
            <ArrowDown className="size-3" />
            回到底部
          </button>
        )}
      </div>
      {inputSlot && <div className="shrink-0 border-t border-white/10">{inputSlot}</div>}
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

  // Orphan events 回退：sessions 还没回来（或被误清空），但 events 已经到达 SSE。
  // 此时不返回 empty —— 而是从 events 重建虚拟 session 元数据并拼接 transcript，
  // 避免再次进入 tab 时显示「暂无终端输出」丢历史。
  if (agentSessions.length === 0) {
    const orphanEvents: { sessionId: string; event: TerminalEventRecord }[] = []
    for (const [sessionId, list] of Object.entries(eventsBySession)) {
      if (!list?.length) continue
      for (const event of list) {
        if (agentId && event.agentId !== agentId) continue
        orphanEvents.push({ sessionId, event })
      }
    }
    if (orphanEvents.length === 0) {
      return {
        status: 'empty',
        sessionId: null,
        shell: 'Shell',
        cwd: null,
        transcript: '',
      }
    }

    // 按 sessionId 分组并按 seq 排序
    const bySession = new Map<string, TerminalEventRecord[]>()
    for (const { sessionId, event } of orphanEvents) {
      const arr = bySession.get(sessionId) ?? []
      arr.push(event)
      bySession.set(sessionId, arr)
    }
    for (const arr of bySession.values()) {
      arr.sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id))
    }

    // 取最近一个 sessionId 作为代表（带最新 event 的那个），保持稳定的 header 信息
    const latestSessionId = [...bySession.keys()].sort((a, b) => {
      const lastA = bySession.get(a)!.at(-1)!.createdAt
      const lastB = bySession.get(b)!.at(-1)!.createdAt
      return lastB - lastA
    })[0]
    const latestEvent = bySession.get(latestSessionId)!.at(-1)!

    const lines: string[] = []
    for (const [sessionId, events] of bySession) {
      for (const event of events) {
        if (!event.text) continue
        if (event.type === 'terminal.input') lines.push(ensureTerminalLine(event.text))
        else if (event.type === 'terminal.output' || event.type === 'terminal.error') lines.push(event.text)
      }
      void sessionId
    }

    return {
      status: 'completed',
      sessionId: null,
      shell: 'Shell',
      cwd: null,
      transcript: lines.join('').trimEnd(),
      latestAgentId: latestEvent.agentId,
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

function EventTimelinePanel({
  detail,
  runs,
  filter,
  onSelectRun,
  onJumpToEvents,
}: {
  detail: AgentRunDebugDetail | null
  runs: AgentRunDebugListItem[]
  filter: AgentRunTimelineFilter
  onSelectRun?: (runId: string) => void
  onJumpToEvents?: () => void
}) {
  const items = detail
    ? filterLifecycleItems(projectAgentRunLifecycle(detail), filter)
    : filterLifecycleItems(projectRunsLifecycle(runs), filter)
  const rows = lifecycleItemsToRows(items)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
          <Clock3 className="size-3.5 text-[var(--agenthub-accent)]" />
          时间线
        </div>
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400 dark:bg-white/10">Run / Agent 生命周期</span>
      </div>
      {rows.length === 0 ? (
        <PanelEmpty
          icon={<Clock3 className="size-4" />}
          text={filter === 'tools' ? '时间线不展示工具级明细' : '暂无生命周期记录'}
          hint={filter === 'tools' ? '工具调用、stdout 等底层事件请切换到「事件流」查看。' : 'Run 开始后，这里会按 Agent / Run 生命周期依次展开；工具级明细请到「事件流」。'}
        />
      ) : (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => {
                if (row.runId) onSelectRun?.(row.runId)
                onJumpToEvents?.()
              }}
              title={row.runId ? '选中对应 Run 并跳转到事件流' : undefined}
              className="grid w-full grid-cols-[64px_20px_minmax(0,1fr)] items-start gap-2 rounded-md px-1 py-1 text-left text-xs transition hover:bg-blue-50/70 dark:hover:bg-blue-500/10"
            >
              <span className="pt-1 font-mono text-[10px] text-slate-400">{row.time}</span>
              <span className="flex justify-center pt-0.5"><LifecycleMarker marker={row.marker} /></span>
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="break-words font-medium text-slate-800 dark:text-slate-100">{row.label}</span>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-white/10">{row.scope}</span>
                </span>
                {row.detail && <span className="mt-0.5 block break-words text-[11px] text-slate-500 dark:text-slate-400">{row.detail}</span>}
              </span>
            </button>
          ))}
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
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400 dark:bg-white/10">原始运行事件</span>
      </div>
      {rows.length === 0 ? (
        <PanelEmpty icon={<FileCode2 className="size-4" />} text="暂无实时事件" />
      ) : (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {rows.map((event) => {
            const desc = describeAgentRunDebugEvent(event)
            const failed = isFailedDebugEvent(event)
            const entries = debugEventPayloadEntries(event)
            return (
              <details
                key={event.id}
                className={cn(
                  'group rounded-md transition hover:bg-blue-50/70 dark:hover:bg-blue-500/10',
                  failed && 'text-rose-700 dark:text-rose-300',
                )}
              >
                <summary
                  onClick={() => onSelectDebugEvent(event)}
                  title="展开明细 / 在右侧打开详情"
                  className="grid w-full cursor-pointer list-none grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-md px-1 py-0.5 text-left text-xs"
                >
                  <span className="flex items-center gap-1.5 pt-0.5">
                    <span className={cn('size-2.5 shrink-0 rounded-full', timelineToneDotClass(failed ? 'danger' : event.status === 'running' ? 'info' : 'success'))} />
                    <span className="font-mono text-[10px] text-slate-400">{formatClockTime(event.createdAt)}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="break-words font-medium text-slate-800 dark:text-slate-100">{desc.label}</span>
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-white/10">{debugEventScope(event)}</span>
                    </span>
                    {desc.detail && <span className="mt-0.5 block break-words text-[11px] text-slate-500 dark:text-slate-400">{desc.detail}</span>}
                  </span>
                </summary>
                {entries.length > 0 && (
                  <div className="mb-1 ml-[76px] mt-0.5 space-y-1 rounded-md border-l-2 border-slate-100 bg-slate-50/70 px-2 py-1.5 dark:border-white/10 dark:bg-white/5">
                    {entries.map(([key, value]) => (
                      <div key={key} className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-[10px]">
                        <span className="shrink-0 text-slate-400">{key}</span>
                        <span className="break-all font-mono text-slate-600 dark:text-slate-300" title={value}>{value.length > 320 ? `${value.slice(0, 320)}…` : value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </details>
            )
          })}
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
  marker: 'start' | 'done' | 'error' | 'pending'
  createdAt: number
  runId: string | null
}

function lifecycleItemsToRows(items: readonly AgentRunLifecycleItem[]): TimelineRow[] {
  return items.map((item) => ({
    id: `lifecycle-${item.id}`,
    time: formatClockTime(item.time),
    label: item.label,
    scope: item.kind.startsWith('run') ? 'run' : 'agent',
    detail: item.detail,
    marker: item.kind.endsWith('_end')
      ? item.status === 'error'
        ? 'error'
        : 'done'
      : item.status === 'pending'
        ? 'pending'
        : 'start',
    createdAt: item.time,
    runId: item.runId,
  }))
}

function filterLifecycleItems(
  items: readonly AgentRunLifecycleItem[],
  filter: AgentRunTimelineFilter,
): AgentRunLifecycleItem[] {
  if (filter === 'tools') return []
  if (filter === 'errors') return items.filter((item) => item.status === 'error')
  return [...items]
}

function LifecycleMarker({ marker }: { marker: TimelineRow['marker'] }) {
  if (marker === 'done') {
    return (
      <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Check className="size-2.5" strokeWidth={3} />
      </span>
    )
  }
  if (marker === 'error') {
    return (
      <span className="flex size-4 items-center justify-center rounded-full bg-rose-500 text-white">
        <X className="size-2.5" strokeWidth={3} />
      </span>
    )
  }
  if (marker === 'pending') {
    return <span className="mt-0.5 size-2.5 rounded-full border-[1.5px] border-slate-300 dark:border-white/25" />
  }
  return <span className="mt-0.5 size-2.5 rounded-full bg-[var(--agenthub-accent)]" />
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
  if (items.length === 0) return <PanelEmpty icon={<TerminalSquare className="size-4" />} title="暂无工具调用" hint="Agent 调用工具后，时序与参数会在这里展开。" />
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
  if (!snapshot) return <PanelEmpty icon={<GitBranch className="size-4" />} title="暂无运行时变量" hint="本次 Run 未生成上下文快照，无法展示工作区与历史。" />
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <PanelMetric label="工作区" value={snapshot.workspace.mode} />
      <PanelMetric label="历史" value={`${snapshot.context.historyMessageCount} messages`} />
      <PanelMetric label="记忆" value={`${snapshot.context.workspaceMemoryNoteCount} notes`} />
      <PanelMetric label="经验" value={`${snapshot.context.experienceCount ?? 0} 条注入`} />
      <PanelMetric label="工具" value={`${snapshot.tools.toolNames.length}`} />
      <div className="sm:col-span-2 lg:col-span-4">
        <CodeSnippet label="Effective CWD" value={snapshot.workspace.effectiveCwd} />
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        <CodeSnippet
          label="注入的经验"
          value={snapshot.context.experiencesInjected?.length
            ? snapshot.context.experiencesInjected.join('\n')
            : '未注入经验（触发条件未命中 / 经验未启用 / 不在该 Agent 或全局范围内）'}
        />
      </div>
    </div>
  )
}

function LogsPanel({
  detail,
  debugEvents,
}: {
  detail: AgentRunDebugDetail
  debugEvents: readonly AgentRunDebugEventRecord[]
}) {
  const operations = projectAgentRunOperations(projectAgentRunToolTrace(detail))
  const rows = [
    ...operations.files.map((item) => ({ kind: item.kind, value: item.path, error: item.isError })),
    ...operations.commands.map((item) => ({ kind: item.exitCode === 0 ? 'command' : item.status ?? 'command', value: item.command, error: item.isError })),
    ...operations.network.map((item) => ({ kind: item.kind, value: item.target, error: item.isError })),
  ]
  const failedEvents = debugEvents.filter(isFailedDebugEvent)
  if (rows.length === 0 && failedEvents.length === 0) {
    return <PanelEmpty icon={<FileCode2 className="size-4" />} title="暂无运行日志" hint="文件读写、命令执行、网络请求和失败事件会按时间顺序汇总在这里。" />
  }
  return (
    <div className="space-y-3">
      {failedEvents.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">失败 / 错误事件</div>
          {failedEvents.map((event) => {
            const desc = describeAgentRunDebugEvent(event)
            return (
              <div key={event.id} className="rounded-md border border-rose-200/70 bg-rose-50/70 px-3 py-2 text-xs dark:border-rose-500/20 dark:bg-rose-500/10">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-rose-400">{formatClockTime(event.createdAt)}</span>
                  <span className="min-w-0 flex-1 break-words font-medium text-rose-700 dark:text-rose-300">{desc.label}</span>
                </div>
                {desc.detail && <p className="mt-1 break-words text-[11px] leading-5 text-rose-600/90 dark:text-rose-300/80">{desc.detail}</p>}
                {debugEventPayloadEntries(event).map(([key, value]) => (
                  <p key={key} className="mt-1 break-all font-mono text-[10px] text-rose-600/80 dark:text-rose-300/70">
                    {key}: {value.length > 320 ? `${value.slice(0, 320)}…` : value}
                  </p>
                ))}
              </div>
            )
          })}
        </div>
      )}
      {rows.length > 0 && (
        <div className="grid gap-1.5 md:grid-cols-2">
          {rows.map((row, index) => (
            <div key={`${row.kind}-${row.value}-${index}`} className={cn('flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs dark:bg-neutral-950/40', row.error && 'bg-rose-50 text-rose-700')}>
              <span className="w-16 shrink-0 text-[10px] uppercase text-slate-400">{row.kind}</span>
              <span className="min-w-0 break-words font-mono text-[11px]">{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ArtifactsPanel({ detail }: { detail: AgentRunDebugDetail }) {
  const artifacts = projectAgentRunArtifacts(detail)
  if (artifacts.length === 0) return <PanelEmpty icon={<PackageOpen className="size-4" />} title="暂无产物" hint="Run 产出文件或部署记录后，会以卡片形式陈列在这里。" />
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

function ConversationRail({
  conversations,
  selectedId,
  onSelect,
  runs,
  selectedRunId,
  loading,
  collapsed = false,
  onToggleCollapsed,
}: {
  conversations: ConversationWithMeta[]
  selectedId: string | null
  onSelect: (id: string) => void
  runs: AgentRunDebugListItem[]
  selectedRunId: string | null
  loading: boolean
  collapsed?: boolean
  onToggleCollapsed?: () => void
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
  const selectedRun = selectedRunId
    ? runs.find((run) => run.id === selectedRunId)
      ?? selectedConversationRuns.find((run) => run.id === selectedRunId)
      ?? null
    : null
  const selectedConversation = selectedId
    ? conversations.find((conversation) => conversation.id === selectedId)
    : null
  const collapsedIndicatorStatus = selectedRun?.status ?? selectedConversation?.latestRunStatus ?? null

  if (collapsed) {
    const toggleTitle = '展开会话列表'
    const conversationsLabel = `${conversations.length} 会话`
    return (
      <aside
        className="flex h-full min-h-0 w-full flex-col items-center border-r border-[var(--agenthub-border)] bg-white py-3 dark:bg-neutral-900"
        aria-label="会话侧栏（已折叠）"
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex size-9 items-center justify-center rounded-md border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] text-slate-500 transition hover:border-[var(--agenthub-accent)] hover:text-[var(--agenthub-accent)] dark:text-slate-300"
          aria-label={toggleTitle}
          title={toggleTitle}
        >
          <ChevronRight className="size-4" />
        </button>
        <div
          className={cn(
            'mt-3 flex size-9 items-center justify-center rounded-full border text-[10px] font-semibold uppercase',
            collapsedIndicatorStatus
              ? 'border-transparent text-white'
              : 'border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] text-slate-400',
          )}
          style={
            collapsedIndicatorStatus
              ? { backgroundColor: statusDotHex(collapsedIndicatorStatus) }
              : undefined
          }
          title={selectedRun
            ? `${selectedRun.agentName} · ${statusLabel(selectedRun.status)}`
            : selectedConversation
              ? `${selectedConversation.title} · ${collapsedIndicatorStatus ? statusLabel(collapsedIndicatorStatus) : '暂无运行'}`
              : '当前没有选中会话'}
        >
          {selectedRun ? formatRunLabel(selectedRun.id) : selectedConversation ? '会话' : '—'}
        </div>
        <div className="mt-2 px-1 text-center text-[10px] font-medium leading-4 text-slate-500">
          {conversationsLabel}
        </div>
        {failedRuns > 0 && (
          <div
            className="mt-2 flex size-6 items-center justify-center rounded-full bg-red-50 text-[10px] font-semibold text-red-600 dark:bg-red-500/15"
            title={`${failedRuns} 个异常 Run`}
          >
            {failedRuns}
          </div>
        )}
        {runningRuns > 0 && (
          <div
            className="mt-2 flex size-6 items-center justify-center rounded-full bg-blue-50 text-[10px] font-semibold text-[var(--agenthub-accent)] dark:bg-blue-500/15"
            title={`${runningRuns} 个运行中 Run`}
          >
            {runningRuns}
          </div>
        )}
      </aside>
    )
  }

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col border-r border-[var(--agenthub-border)] bg-white dark:bg-neutral-900">
      <div className="shrink-0 border-b border-[var(--agenthub-border)] p-3">
        <div className="flex items-center gap-2">
          <Clock3 className="size-4 text-[var(--agenthub-accent)]" />
          <h2 className="flex-1 text-sm font-semibold text-slate-900 dark:text-slate-100">会话</h2>
          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="flex size-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
              aria-label="折叠会话列表"
              title="折叠会话列表"
            >
              <ChevronRight className="size-4 rotate-180" />
            </button>
          )}
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

function statusDotClass(status: AgentRunBoardStageStatus | AgentRunDebugListItem['status']): string {
  if (status === 'complete') return 'bg-emerald-500'
  if (status === 'running') return 'bg-blue-500 animate-pulse'
  if (status === 'failed' || status === 'aborted') return 'bg-rose-500'
  if (status === 'pending' || status === 'queued') return 'bg-amber-400'
  return 'bg-slate-300'
}

function statusDotHex(status: AgentRunBoardStageStatus | AgentRunDebugListItem['status']): string {
  if (status === 'complete') return '#10b981'
  if (status === 'running') return '#3b82f6'
  if (status === 'failed' || status === 'aborted') return '#f43f5e'
  if (status === 'pending' || status === 'queued') return '#f59e0b'
  return '#cbd5e1'
}

function debuggerStatusDotClass(status: AgentRunDebuggerStatus): string {
  if (status === 'completed') return 'bg-emerald-500'
  if (status === 'running') return 'bg-blue-500 animate-pulse'
  if (status === 'failed' || status === 'cancelled') return 'bg-rose-500'
  return 'bg-amber-400'
}

function statusLabel(status: AgentRunBoardStageStatus | AgentRunDebugListItem['status']): string {
  if (status === 'complete') return '完成'
  if (status === 'running') return '运行中'
  if (status === 'failed') return '失败'
  if (status === 'aborted') return '已取消'
  if (status === 'pending' || status === 'queued') return '等待'
  return '不可用'
}

function debuggerStatusLabel(status: AgentRunDebuggerStatus): string {
  if (status === 'completed') return '完成'
  if (status === 'running') return '运行中'
  if (status === 'failed') return '失败'
  if (status === 'cancelled') return '已取消'
  return '等待'
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

function debugEventPayloadEntries(event: AgentRunDebugEventRecord): Array<[string, string]> {
  const preferredOrder = ['toolName', 'argsSummary', 'outputSummary', 'command', 'shell', 'cwd', 'sessionId', 'exitCode', 'error', 'stream', 'durationMs', 'task', 'label']
  const entries: Array<[string, string]> = []
  const seen = new Set<string>()
  const push = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === '' || value === '-') return
    seen.add(key)
    entries.push([key, typeof value === 'object' ? JSON.stringify(value) : String(value)])
  }
  for (const key of preferredOrder) push(key, event.payload[key])
  for (const [key, value] of Object.entries(event.payload)) {
    if (!seen.has(key)) push(key, value)
  }
  return entries
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
  if (status === 'aborted') return '已取消'
  if (status === 'queued' || status === 'blocked' || status === 'skipped') return '等待'
  return '等待'
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

function PanelMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'success' | 'info' | 'warning' | 'danger'
}) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-400/20 dark:bg-emerald-500/10'
      : tone === 'info'
        ? 'border-blue-200 bg-blue-50/60 dark:border-blue-400/20 dark:bg-blue-500/10'
        : tone === 'warning'
          ? 'border-amber-200 bg-amber-50/60 dark:border-amber-400/20 dark:bg-amber-500/10'
          : tone === 'danger'
            ? 'border-rose-200 bg-rose-50/60 dark:border-rose-400/20 dark:bg-rose-500/10'
            : 'border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] dark:bg-white/[0.03]'
  return (
    <div className={cn('rounded-lg border px-2.5 py-1.5', toneClass)}>
      <div className="truncate text-[10px] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-0.5 truncate font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">{value}</div>
    </div>
  )
}

function PanelEmpty({
  icon,
  text,
  title,
  hint,
}: {
  icon?: React.ReactNode
  text?: string
  title?: string
  hint?: string
}) {
  return (
    <div className="flex h-full items-center justify-center px-4 py-8 text-center">
      <div className="flex max-w-xs flex-col items-center gap-1.5">
        {icon && <div className="text-slate-400">{icon}</div>}
        <div className="flex items-center gap-2 text-slate-500">{title ?? text}</div>
        {hint && <div className="text-[11px] leading-relaxed text-slate-400">{hint}</div>}
      </div>
    </div>
  )
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
