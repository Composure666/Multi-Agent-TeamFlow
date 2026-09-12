import type { Edge, Node } from '@xyflow/react'

import type { AgentRunRow } from '@/db/schema'

import type {
  AgentRunDebugDetail,
  AgentRunDebugEventRecord,
  AgentRunDebugListItem,
  AgentRunDebugSnapshot,
  DispatchPlanItem,
  MessageRecord,
} from '@/shared/types'

import {
  projectAgentRunArtifacts,
  getAgentRunToolTraceKind,
  projectAgentRunPlanTasks,
  projectAgentRunTaskResults,
  projectAgentRunToolTrace,
  summarizeAgentRunToolTraceArgs,
  summarizeAgentRunToolTraceResult,
  type AgentRunToolTraceItem,
} from './agent-run-debug-projection'

export type AgentRunBoardStageId = 'trigger' | 'context' | 'plan' | 'execute' | 'output'
export type AgentRunBoardPanelTab = 'terminal' | 'output' | 'trace' | 'variables' | 'logs' | 'artifacts' | 'history'
export type AgentRunDebuggerCanvasView = 'graph' | 'timeline' | 'events' | 'terminal'
export type AgentRunBoardStageStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'failed'
  | 'aborted'
  | 'unavailable'
export type AgentRunBoardTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface AgentRunBoardStage {
  id: AgentRunBoardStageId
  title: string
  description: string
  metric: string
  status: AgentRunBoardStageStatus
  tone: AgentRunBoardTone
}

export interface AgentRunBoardNodeData extends Record<string, unknown> {
  stage: AgentRunBoardStage
}

export type AgentRunBoardNode = Node<AgentRunBoardNodeData, 'runBoardStage'>

export interface AgentRunBoardGraph {
  nodes: AgentRunBoardNode[]
  edges: Edge[]
}

export type AgentRunDebuggerNodeKind = 'message' | 'run' | 'agent' | 'task' | 'tool' | 'summary'
export type AgentRunDebuggerGraphFocus = 'all' | 'agent' | 'tools' | 'errors'
export type AgentRunDebuggerStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface AgentRunDebuggerRunNode {
  id: string
  title: string
  status: AgentRunDebuggerStatus
  durationMs: number | null
  tokenTotal: number | null
  modelId: string | null
}

export interface AgentRunDebuggerMessageNode {
  id: string
  role: MessageRecord['role']
  status: MessageRecord['status']
  preview: string
  createdAt: number
  runIds: string[]
}

export interface AgentRunDebuggerAgentNode {
  agentId: string
  name: string
  role: 'orchestrator' | 'worker'
  status: AgentRunDebuggerStatus
  runId: string | null
  taskIds: string[]
  taskTitles: string[]
  steps: AgentRunDebuggerStep[]
  durationMs: number | null
  tokenTotal: number | null
  toolCallCount: number
  toolNames: string[]
  source: 'current_run' | 'child_run' | 'plan_tasks'
}

export interface AgentRunDebuggerStep {
  id: string
  title: string
  status: AgentRunDebuggerStatus
  dependsOn: string[]
  toolNames: string[]
}

export interface AgentRunDebuggerTaskNode {
  id: string
  title: string
  agentId: string
  dependsOn: string[]
  status: AgentRunDebuggerStatus
  toolNames: string[]
  source: 'plan_tasks' | 'child_run' | 'inferred'
}

export interface AgentRunDebuggerToolNode {
  callId: string
  toolName: string
  messageId: string
  runId: string
  agentId: string
  agentName: string | null
  status: AgentRunDebuggerStatus
  summary: string
}

export interface AgentRunDebuggerNodeData extends Record<string, unknown> {
  kind: AgentRunDebuggerNodeKind
  label: string
  status: AgentRunDebuggerStatus
  tone: AgentRunBoardTone
  emphasis?: 'normal' | 'muted'
  message?: AgentRunDebuggerMessageNode
  run?: AgentRunDebuggerRunNode
  agent?: AgentRunDebuggerAgentNode
  task?: AgentRunDebuggerTaskNode
  tool?: AgentRunDebuggerToolNode
}

export type AgentRunDebuggerNode = Node<AgentRunDebuggerNodeData, 'runDebuggerNode'>

export interface AgentRunDebuggerGraph {
  nodes: AgentRunDebuggerNode[]
  edges: Edge[]
}

export interface AgentRunTerminalSegment {
  callId: string
  command: string
  output: string
  cwd: string | null
  shell: string
  exitCode: number | null
  status: string | null
  truncated: boolean
  timedOut: boolean
  isError: boolean
}

export interface AgentRunTerminalOutput {
  title: 'Terminal Output'
  shell: string
  cwd: string | null
  status: 'live' | 'completed' | 'empty'
  commandCount: number
  segments: AgentRunTerminalSegment[]
  transcript: string
}

export interface AgentRunInspectorMetric {
  label: string
  value: string | number | null
}

export interface AgentRunInspectorField {
  label: string
  value: string
}

export interface AgentRunInspectorTask {
  title: string
  stepTitle: string | null
  stepIndex: number
  stepTotal: number
  status: AgentRunDebuggerStatus
}

export interface AgentRunInspectorViewModel {
  kind: Exclude<AgentRunDebuggerNodeKind, 'tool'> | 'empty'
  kicker: string
  title: string
  subtitle: string
  status: AgentRunDebuggerStatus
  metrics: AgentRunInspectorMetric[]
  fields: AgentRunInspectorField[]
  currentTask: AgentRunInspectorTask | null
  messageContent: string | null
}

export interface AgentRunToolInspectorViewModel {
  kind: 'tool'
  kicker: 'TOOL INSPECTOR'
  title: string
  subtitle: string
  status: AgentRunDebuggerStatus
  metrics: AgentRunInspectorMetric[]
  fields: AgentRunInspectorField[]
  input: string
  output: string
  callId: string
  agentName: string | null
}

export interface BuildAgentRunSessionDebuggerGraphArgs {
  messages: readonly MessageRecord[]
  runs: readonly AgentRunDebugListItem[]
  currentDetail: AgentRunDebugDetail | null
  expandedRunIds?: readonly string[]
}

export function projectAgentRunBoardStages(detail: AgentRunDebugDetail): AgentRunBoardStage[] {
  const toolTrace = projectAgentRunToolTrace(detail)
  const planTasks = projectAgentRunPlanTasks(toolTrace)
  const artifacts = projectAgentRunArtifacts(detail)
  const taskResults = projectAgentRunTaskResults(toolTrace)
  const contextCount = detail.snapshot ? countInjectedContext(detail.snapshot) : 0
  const childCount = detail.childrenRuns.length
  const runStatus = detail.agentRun.status

  // 进展阶段数据是否存在（plan / execute / output）
  const planReached = planTasks.length > 0 || detail.childrenRuns.length > 0
  const executeReached = toolTrace.length > 0 || detail.childrenRuns.length > 0
  const outputReached = artifacts.length > 0 || taskResults.length > 0
  // 失败/中止的 run：把"当前阶段"标记为 failed/aborted。
  // 当前阶段 = 进展路径上"最深"的有数据阶段（lastReachedIndex）。
  const progressionHasData = [planReached, executeReached, outputReached]
  const lastReachedIndex = progressionHasData.lastIndexOf(true)
  const isCurrentStage = (index: number) =>
    (runStatus === 'failed' || runStatus === 'aborted') && index === lastReachedIndex
  const progressionStages: AgentRunBoardStage[] = [
    {
      id: 'plan',
      title: '规划',
      description: planTasks.length > 0 ? '任务已拆分并进入协作链路' : '当前 run 没有可识别的拆分计划',
      metric: planTasks.length > 0 ? `${planTasks.length} 个任务` : '无拆分计划',
      status: deriveProgressionStatus(runStatus, planReached, isCurrentStage(0)),
      tone: deriveStageTone(runStatus, planReached, 'info', isCurrentStage(0)),
    },
    {
      id: 'execute',
      title: '执行',
      description: toolTrace.length > 0 ? '工具调用和子 Agent 正在推进' : '当前 run 尚未产生可识别执行轨迹',
      metric: `${toolTrace.length} 次调用 · ${childCount} 个子 Agent`,
      status: deriveProgressionStatus(runStatus, executeReached, isCurrentStage(1)),
      tone: deriveStageTone(runStatus, executeReached, 'info', isCurrentStage(1)),
    },
    {
      id: 'output',
      title: '产出',
      description: artifacts.length > 0 || taskResults.length > 0
        ? '产物和任务结果正在汇总'
        : '当前 run 尚未产生可识别产出',
      metric: `${artifacts.length} 个产物`,
      status: deriveProgressionStatus(runStatus, outputReached, isCurrentStage(2)),
      tone: deriveStageTone(runStatus, outputReached, 'success', isCurrentStage(2)),
    },
  ]

  return [
    {
      id: 'trigger',
      title: '触发',
      description: detail.triggerMessage ? '用户消息已进入当前 run' : '当前 run 没有关联触发消息',
      metric: detail.triggerMessage ? '1 条触发消息' : '触发消息不可用',
      // 触发是前置条件：run 非 queued 即视为 complete；旧 run 无 triggerMessage 时 unavailable
      status: derivePreconditionStatus(runStatus, Boolean(detail.triggerMessage)),
      tone: detail.triggerMessage && runStatus !== 'queued' ? 'success' : 'neutral',
    },
    {
      id: 'context',
      title: '上下文',
      description: detail.snapshot ? '运行时上下文快照已加载' : '旧 run 没有运行时上下文快照',
      metric: detail.snapshot ? `${contextCount} 类上下文` : '快照不可用',
      status: derivePreconditionStatus(runStatus, Boolean(detail.snapshot)),
      tone: deriveStageTone(runStatus, Boolean(detail.snapshot), detail.snapshot ? 'success' : 'warning'),
    },
    ...progressionStages,
  ]
}

/**
 * 前置条件阶段（trigger / context）：run 一旦非 queued 就视为完成。
 * 旧 run 没有相应数据时显示 unavailable。
 */
function derivePreconditionStatus(
  runStatus: AgentRunDebugListItem['status'],
  hasData: boolean,
): AgentRunBoardStageStatus {
  if (runStatus === 'queued') return 'pending'
  if (!hasData) return 'unavailable'
  return 'complete'
}

/**
 * 进展阶段（plan / execute / output）状态推导。
 * @param isCurrentStage 仅在 failed/aborted 时用——表示这是进展路径上"唯一有数据"的最后阶段，标记为 failed/aborted。
 *   其余有数据的进展阶段保持 complete，无数据的 unavailable。
 */
function deriveProgressionStatus(
  runStatus: AgentRunDebugListItem['status'],
  hasData: boolean,
  isCurrentStage: boolean,
): AgentRunBoardStageStatus {
  if (runStatus === 'complete') return 'complete'
  if (runStatus === 'failed') {
    if (hasData && isCurrentStage) return 'failed'
    if (hasData) return 'complete'
    return 'unavailable'
  }
  if (runStatus === 'aborted') {
    if (hasData && isCurrentStage) return 'aborted'
    if (hasData) return 'complete'
    return 'unavailable'
  }
  if (runStatus === 'queued') return 'pending'
  // running
  return hasData ? 'running' : 'pending'
}

function deriveStageTone(
  runStatus: AgentRunDebugListItem['status'],
  hasData: boolean,
  baseTone: AgentRunBoardTone,
  isCurrentFailedStage = false,
): AgentRunBoardTone {
  if (runStatus === 'failed') return hasData ? (isCurrentFailedStage ? 'danger' : 'success') : 'warning'
  if (runStatus === 'aborted') return hasData ? (isCurrentFailedStage ? 'warning' : 'success') : 'neutral'
  if (hasData) return 'success'
  return baseTone
}

export function buildAgentRunBoardGraph(stages: readonly AgentRunBoardStage[]): AgentRunBoardGraph {
  const nodes = stages.map((stage, index) => ({
    id: `stage-${stage.id}`,
    type: 'runBoardStage' as const,
    position: { x: index * 180, y: 80 },
    data: { stage },
    draggable: false,
    selectable: true,
  }))

  const edges = stages.slice(0, -1).map((stage, index) => {
    const next = stages[index + 1]
    const active = stage.status === 'running' || next.status === 'running'
    const stroke = stage.status === 'failed' || next.status === 'failed'
      ? '#ef4444'
      : active
        ? '#2563eb'
        : stage.status === 'complete' && next.status === 'complete'
          ? '#10b981'
          : '#cbd5e1'
    return {
      id: `edge-${stage.id}-${next.id}`,
      source: `stage-${stage.id}`,
      target: `stage-${next.id}`,
      animated: active,
      style: { stroke, strokeWidth: active ? 3 : 2 },
    }
  })

  return { nodes, edges }
}

export function buildAgentRunDebuggerGraph(detail: AgentRunDebugDetail): AgentRunDebuggerGraph {
  const toolTrace = projectAgentRunToolTrace(detail)
  const planTasks = projectAgentRunPlanTasks(toolTrace)
  const childRunsByAgent = groupRunsByAgent(detail.childrenRuns)
  const taskIdsByAgent = groupTaskIdsByAgent(planTasks)
  const nodes: AgentRunDebuggerNode[] = []
  const edges: Edge[] = []
  const currentAgentId = detail.snapshot?.agent.id ?? detail.agentRun.agentId
  const currentAgentName = detail.snapshot?.agent.name ?? detail.agentRun.agentName ?? detail.agentRun.agentId
  const currentIsOrchestrator = detail.snapshot?.agent.isOrchestrator === true || planTasks.length > 0 || detail.childrenRuns.length > 0
  const runNodeId = `run-${detail.agentRun.id}`
  const orchestratorNodeId = `agent-${currentAgentId}`
  const summaryNodeId = 'summary-output'
  const agentNodePositions = new Map<string, { x: number; y: number }>()
  const workerAgentIds = [
    ...new Set([
      ...planTasks.map((task) => task.agentId),
      ...detail.childrenRuns.map((run) => run.agentId),
    ]),
  ]
  const centerX = 360
  // 新自动布局：层级（Run → Orchestrator → Workers 网格 → Tools 网格 → Summary），
  // workers 超过 5 个自动换行；tools 超过 6 个自动换行；所有横向布局基于列宽自适应。
  const workerMaxCols = 5
  const workerColWidth = 280
  const workerRowHeight = 260
  const workerGridTopY = 360
  const toolGridTopGap = 200
  const toolColWidth = 210
  const toolRowHeight = 130
  const toolMaxCols = 6
  const summaryGap = 220
  const hasOutputEvidence = detail.outputMessages.length > 0
    || projectAgentRunArtifacts(detail).length > 0
    || projectAgentRunTaskResults(toolTrace).length > 0

  nodes.push({
    id: runNodeId,
    type: 'runDebuggerNode',
    position: { x: centerX, y: 0 },
    draggable: false,
    selectable: true,
    data: {
      kind: 'run',
      label: rootTaskLabel(detail, [currentAgentName, currentAgentId, ...detail.childrenRuns.flatMap((run) => [run.agentName, run.agentId])]),
      status: mapRunStatus(detail.agentRun.status),
      tone: toneForDebuggerStatus(mapRunStatus(detail.agentRun.status)),
      run: {
        id: detail.agentRun.id,
        title: `Run ${shortGraphId(detail.agentRun.id)}`,
        status: mapRunStatus(detail.agentRun.status),
        durationMs: durationMs(detail.agentRun),
        tokenTotal: tokenTotal(detail.agentRun),
        modelId: detail.snapshot?.agent.modelId ?? detail.agentRun.modelId ?? detail.agentRun.usage?.model ?? null,
      },
    },
  })

  nodes.push({
    id: orchestratorNodeId,
    type: 'runDebuggerNode',
    position: { x: centerX, y: 170 },
    draggable: false,
    selectable: true,
    data: {
      kind: 'agent',
      label: currentAgentName,
      status: mapRunStatus(detail.agentRun.status),
      tone: toneForDebuggerStatus(mapRunStatus(detail.agentRun.status)),
      agent: {
        agentId: currentAgentId,
        name: currentAgentName,
        role: currentIsOrchestrator ? 'orchestrator' : 'worker',
        status: mapRunStatus(detail.agentRun.status),
        runId: detail.agentRun.id,
        taskIds: currentIsOrchestrator ? planTasks.map((task) => task.id) : taskIdsByAgent.get(currentAgentId) ?? [],
        taskTitles: planTasks.map((task) => task.task),
        steps: planTasks.map((task) => toStep(task, statusForTask(task, childRunsByAgent.get(task.agentId) ?? [], detail.agentRun.status))),
        durationMs: durationMs(detail.agentRun),
        tokenTotal: tokenTotal(detail.agentRun),
        toolCallCount: toolTrace.length,
        toolNames: uniqueToolNames(toolTrace),
        source: 'current_run',
      },
    },
  })
  agentNodePositions.set(currentAgentId, { x: centerX, y: 170 })
  edges.push(buildDebuggerEdge(runNodeId, orchestratorNodeId, mapRunStatus(detail.agentRun.status)))

  if (workerAgentIds.length === 0) {
    if (hasOutputEvidence) {
      const outputStatus = getOutputNodeStatus(detail.agentRun, hasOutputEvidence)
      nodes.push(buildSummaryNode(summaryNodeId, detail, outputStatus, { x: centerX, y: workerGridTopY }))
      edges.push(buildDebuggerEdge(orchestratorNodeId, summaryNodeId, outputStatus))
    }
    return { nodes, edges }
  }

  workerAgentIds.forEach((agentId, index) => {
    const tasksForAgent = planTasks.filter((task) => task.agentId === agentId)
    const childRuns = childRunsByAgent.get(agentId) ?? []
    const primaryRun = childRuns[0] ?? null
    const agentStatus = statusForAgent(primaryRun, tasksForAgent, detail.agentRun.status)
    const hasTasksForAgent = tasksForAgent.length > 0
    const agentSteps = hasTasksForAgent
      ? tasksForAgent.map((task) => toStep(task, statusForTask(task, childRuns, detail.agentRun.status)))
      : childRuns.map((run, stepIndex) => ({
          id: `${run.id}-step-${stepIndex}`,
          title: run.agentName ?? run.agentId,
          status: mapRunStatus(run.status),
          dependsOn: [],
          toolNames: uniqueToolNamesForAgent(toolTrace, agentId),
        }))
    const agentNodeId = `agent-${agentId}`
    const workerCols = Math.min(workerMaxCols, Math.max(1, workerAgentIds.length))
    const workerCol = index % workerCols
    const workerRow = Math.floor(index / workerCols)
    const workersTotalRowWidth = workerCols * workerColWidth
    const workerRowStartX = Math.round(centerX - (workersTotalRowWidth - workerColWidth) / 2)
    const workerX = workerRowStartX + workerCol * workerColWidth
    const workerY = workerGridTopY + workerRow * workerRowHeight
    nodes.push({
      id: agentNodeId,
      type: 'runDebuggerNode',
      position: { x: workerX, y: workerY },
      draggable: false,
      selectable: true,
      data: {
        kind: 'agent',
        label: primaryRun?.agentName ?? agentId,
        status: agentStatus,
        tone: toneForDebuggerStatus(agentStatus),
        agent: {
          agentId,
          name: primaryRun?.agentName ?? agentId,
          role: 'worker',
          status: agentStatus,
          runId: primaryRun?.id ?? null,
          taskIds: hasTasksForAgent ? tasksForAgent.map((task) => task.id) : childRuns.map((run) => run.id),
          taskTitles: hasTasksForAgent ? tasksForAgent.map((task) => task.task) : childRuns.map((run) => run.agentName ?? run.agentId),
          steps: agentSteps,
          durationMs: primaryRun ? durationMs(primaryRun) : null,
          tokenTotal: primaryRun ? tokenTotal(primaryRun) : null,
          toolCallCount: countToolsForAgent(toolTrace, agentId),
          toolNames: hasTasksForAgent ? uniqueTaskToolNames(tasksForAgent) : uniqueToolNamesForAgent(toolTrace, agentId),
          source: primaryRun ? 'child_run' : 'plan_tasks',
        },
      },
    })
    agentNodePositions.set(agentId, { x: workerX, y: workerY })
    edges.push(buildDebuggerEdge(orchestratorNodeId, agentNodeId, agentStatus))
  })

  // 计算 worker 网格的最底端 y，供工具网格起始位置使用。
  const workerRows = Math.max(1, Math.ceil(workerAgentIds.length / workerMaxCols))
  const workerGridBottomY = workerAgentIds.length === 0
    ? workerGridTopY
    : workerGridTopY + (workerRows - 1) * workerRowHeight
  const toolGridOriginY = workerGridBottomY + toolGridTopGap

  const toolLayout = buildAgentRunToolDebuggerGraph({
    detail,
    toolTrace,
    planTasks,
    childRunsByAgent,
    currentAgentId,
    currentAgentName,
    agentNodePositions,
    centerX,
    toolGridOriginY,
    toolColWidth,
    toolRowHeight,
    toolMaxCols,
  })
  nodes.push(...toolLayout.nodes)
  edges.push(...toolLayout.edges)

  const summaryPositionY = toolLayout.maxY === null
    ? (workerAgentIds.length === 0 ? toolGridOriginY - toolGridTopGap : workerGridBottomY + summaryGap)
    : Math.max(toolGridOriginY, toolLayout.maxY + summaryGap)
  const outputStatus = getOutputNodeStatus(detail.agentRun, hasOutputEvidence || toolLayout.nodes.length > 0)
  nodes.push(buildSummaryNode(summaryNodeId, detail, outputStatus, { x: centerX, y: summaryPositionY }))
  edges.push(buildDebuggerEdge(orchestratorNodeId, summaryNodeId, outputStatus))
  for (const agentId of workerAgentIds) {
    edges.push(buildDebuggerEdge(`agent-${agentId}`, summaryNodeId, outputStatus))
  }
  for (const tailNodeId of toolLayout.tailNodeIds) {
    edges.push(buildDebuggerEdge(tailNodeId, summaryNodeId, outputStatus))
  }

  return { nodes, edges }
}

function buildAgentRunToolDebuggerGraph(args: {
  detail: AgentRunDebugDetail
  toolTrace: readonly AgentRunToolTraceItem[]
  planTasks: readonly DispatchPlanItem[]
  childRunsByAgent: Map<string, AgentRunDebugListItem[]>
  currentAgentId: string
  currentAgentName: string
  agentNodePositions: Map<string, { x: number; y: number }>
  centerX: number
  toolGridOriginY: number
  toolColWidth: number
  toolRowHeight: number
  toolMaxCols: number
}): { nodes: AgentRunDebuggerNode[]; edges: Edge[]; tailNodeIds: string[]; maxY: number | null } {
  if (args.toolTrace.length === 0) {
    return { nodes: [], edges: [], tailNodeIds: [], maxY: null }
  }

  const nodes: AgentRunDebuggerNode[] = []
  const edges: Edge[] = []
  const tailNodeIds: string[] = []
  const nodesByAgent = new Map<string, AgentRunDebuggerToolNode[]>()
  let maxY: number | null = null

  for (const item of args.toolTrace) {
    const agentId = resolveToolTraceOwnerAgentId(args.detail, item, args.planTasks, args.childRunsByAgent, args.currentAgentId)
    const agentName = resolveToolTraceOwnerAgentName(args.detail, item, args.planTasks, args.childRunsByAgent, agentId, args.currentAgentName)
    const status = item.completed ? (item.isError ? 'failed' : 'completed') : 'running'
    const ownerList = nodesByAgent.get(agentId) ?? []
    ownerList.push({
      callId: item.callId,
      toolName: item.toolName,
      messageId: item.messageId,
      runId: args.detail.agentRun.id,
      agentId,
      agentName,
      status,
      summary: summarizeAgentRunToolTraceArgs(item),
    })
    nodesByAgent.set(agentId, ownerList)
  }

  // 将所有 tool 按「每个 agent 的 owner 节点 + 该 agent 下全部 tool」扁平化为一个
  // 顺序列表，在 worker 行下方用统一网格（maxCols=6）展开，避免单列纵向堆积。
  // 每个 tool 节点仍连回所属 agent 节点（横向第一条线是 owner → 第一行第一个 tool），
  // 同 agent 的后续 tool 串接成水平网格（同行右→左移动），不再纵向堆叠。
  const flattened: Array<{ toolNode: AgentRunDebuggerToolNode; ownerNodeId: string; ownerPosition: { x: number; y: number } }> = []
  for (const [agentId, items] of nodesByAgent) {
    const ownerNodeId = `agent-${agentId}`
    const ownerPosition = args.agentNodePositions.get(agentId) ?? { x: args.centerX, y: args.toolGridOriginY }
    for (const toolNode of items) {
      flattened.push({ toolNode, ownerNodeId, ownerPosition })
    }
  }

  const toolMaxCols = Math.max(1, args.toolMaxCols)
  const totalToolCols = Math.min(toolMaxCols, Math.max(1, flattened.length))
  const toolRowTotalWidth = totalToolCols * args.toolColWidth
  const toolRowStartX = Math.round(args.centerX - (toolRowTotalWidth - args.toolColWidth) / 2)

  const previousNodeIdByAgent = new Map<string, string>()
  flattened.forEach((entry, index) => {
    const toolNode = entry.toolNode
    const nodeId = `tool-${toolNode.callId}`
    const col = index % toolMaxCols
    const row = Math.floor(index / toolMaxCols)
    const x = toolRowStartX + col * args.toolColWidth
    const y = args.toolGridOriginY + row * args.toolRowHeight
    nodes.push({
      id: nodeId,
      type: 'runDebuggerNode',
      position: { x, y },
      draggable: false,
      selectable: true,
      data: {
        kind: 'tool',
        label: toolNode.toolName,
        status: toolNode.status,
        tone: toneForDebuggerStatus(toolNode.status),
        tool: toolNode,
      },
    })
    const prev = previousNodeIdByAgent.get(entry.ownerNodeId) ?? entry.ownerNodeId
    edges.push(buildDebuggerEdge(prev, nodeId, toolNode.status))
    previousNodeIdByAgent.set(entry.ownerNodeId, nodeId)
    maxY = maxY === null ? y : Math.max(maxY, y)
  })

  // tail 节点：每个 agent 的最后一个 tool 节点
  // （若该 agent 只有 1 个 tool，则连接回 agent 自身节点也合理，
  //  此处选 last-tool，使下游 summary 收口更加清晰）。
  for (const [ownerNodeId, lastToolNodeId] of previousNodeIdByAgent) {
    if (ownerNodeId === lastToolNodeId) {
      // agent 没产生 tool 调用 —— 跳过
      continue
    }
    tailNodeIds.push(lastToolNodeId)
  }

  return { nodes, edges, tailNodeIds, maxY }
}

export function buildAgentRunSessionDebuggerGraph({
  messages,
  runs,
  currentDetail,
  expandedRunIds,
}: BuildAgentRunSessionDebuggerGraphArgs): AgentRunDebuggerGraph {
  const orderedMessages = [...messages].sort((a, b) => a.createdAt - b.createdAt)
  const orderedTopLevelRuns = [...runs]
    .filter((run) => run.parentRunId === null)
    .sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))
  const runsByTriggerMessage = groupRunsByTriggerMessage(orderedTopLevelRuns)
  const messageById = new Map(orderedMessages.map((message) => [message.id, message]))
  const hasRunBackedGraph = orderedTopLevelRuns.length > 0
  const currentRunId = currentDetail?.agentRun.id ?? null
  const expandedRunIdSet = new Set(expandedRunIds ?? (currentRunId ? [currentRunId] : []))
  const expandedRunGraph = currentDetail ? buildAgentRunDebuggerGraph(currentDetail) : null
  const expandedRunNodeIds = new Set(expandedRunGraph?.nodes.map((node) => node.id) ?? [])
  const expandedRunEdges = expandedRunGraph?.edges ?? []
  const nodes: AgentRunDebuggerNode[] = []
  const edges: Edge[] = []
  const rowGap = 250
  const centerX = 360
  let row = 0
  let previousTerminalNodeId: string | null = null

  for (const message of orderedMessages) {
    const linkedRuns = runsForSessionMessage(message, runsByTriggerMessage, currentDetail)
    if (linkedRuns.length === 0 && hasRunBackedGraph) continue
    if (message.role !== 'user' && linkedRuns.length === 0) continue
    const messageNodeId = `message-${message.id}`
    const messageY = row * rowGap
    nodes.push({
      id: messageNodeId,
      type: 'runDebuggerNode',
      position: { x: centerX, y: messageY },
      draggable: false,
      selectable: true,
      data: {
        kind: 'message',
        label: message.role === 'user' ? '用户消息' : 'Agent 消息',
        status: mapMessageStatus(message.status),
        tone: toneForDebuggerStatus(mapMessageStatus(message.status)),
        message: {
          id: message.id,
          role: message.role,
          status: message.status,
          preview: summarizeMessagePreview(message),
          createdAt: message.createdAt,
          runIds: linkedRuns.map((run) => run.id),
        },
      },
    })
    if (previousTerminalNodeId) {
      edges.push(buildDebuggerEdge(previousTerminalNodeId, messageNodeId, mapMessageStatus(message.status)))
    }

    let groupTerminalNodeId = messageNodeId
    if (linkedRuns.length > 0) {
      const runStartX = Math.round(centerX - ((linkedRuns.length - 1) * 330) / 2)
      linkedRuns.forEach((run, index) => {
        if (run.id === currentRunId && expandedRunGraph && expandedRunIdSet.has(run.id)) {
          const offsetX = runStartX + index * 330 - centerX
          const offsetY = messageY + 130
          for (const node of expandedRunGraph.nodes) {
            nodes.push({
              ...node,
              position: {
                x: node.position.x + offsetX,
                y: node.position.y + offsetY,
              },
            })
          }
          edges.push(...expandedRunEdges)
          edges.push(buildDebuggerEdge(messageNodeId, `run-${run.id}`, mapRunStatus(run.status)))
          groupTerminalNodeId = 'summary-output'
          return
        }

        const runNodeId = `run-${run.id}`
        nodes.push({
          id: runNodeId,
          type: 'runDebuggerNode',
          position: { x: runStartX + index * 330, y: messageY + 130 },
          draggable: false,
          selectable: true,
          data: {
            kind: 'run',
            label: runTitleForSessionGraph(run, messageById),
            status: mapRunStatus(run.status),
            tone: toneForDebuggerStatus(mapRunStatus(run.status)),
            run: {
              id: run.id,
              title: `Run ${shortGraphId(run.id)}`,
              status: mapRunStatus(run.status),
              durationMs: durationMs(run),
              tokenTotal: tokenTotal(run),
              modelId: run.modelId ?? run.usage?.model ?? null,
            },
          },
        })
        edges.push(buildDebuggerEdge(messageNodeId, runNodeId, mapRunStatus(run.status)))
        groupTerminalNodeId = runNodeId
      })
    }

    previousTerminalNodeId = groupTerminalNodeId
    row += linkedRuns.some((run) => run.id === currentRunId && expandedRunIdSet.has(run.id)) && expandedRunGraph ? 4 : 1
  }

  const orphanRuns = orderedTopLevelRuns.filter((run) => run.triggerMessageId === null || !messageById.has(run.triggerMessageId))
  for (const run of orphanRuns) {
    if (expandedRunNodeIds.has(`run-${run.id}`)) continue
    const runNodeId = `run-${run.id}`
    nodes.push({
      id: runNodeId,
      type: 'runDebuggerNode',
      position: { x: centerX, y: row * rowGap },
      draggable: false,
      selectable: true,
      data: {
        kind: 'run',
        label: runTitleForSessionGraph(run, messageById),
        status: mapRunStatus(run.status),
        tone: toneForDebuggerStatus(mapRunStatus(run.status)),
        run: {
          id: run.id,
          title: `Run ${shortGraphId(run.id)}`,
          status: mapRunStatus(run.status),
          durationMs: durationMs(run),
          tokenTotal: tokenTotal(run),
          modelId: run.modelId ?? run.usage?.model ?? null,
        },
      },
    })
    if (previousTerminalNodeId) edges.push(buildDebuggerEdge(previousTerminalNodeId, runNodeId, mapRunStatus(run.status)))
    previousTerminalNodeId = runNodeId
    row += 1
  }

  return {
    nodes: focusAgentRunDebuggerGraph({ nodes, edges }, 'all').nodes,
    edges,
  }
}

function runsForSessionMessage(
  message: MessageRecord,
  runsByTriggerMessage: Map<string, AgentRunDebugListItem[]>,
  currentDetail: AgentRunDebugDetail | null,
): AgentRunDebugListItem[] {
  const linkedRuns = runsByTriggerMessage.get(message.id) ?? []
  const currentRun = currentDetail?.triggerMessage?.id === message.id ? currentDetail.agentRun : null
  if (!currentRun || linkedRuns.some((run) => run.id === currentRun.id)) return linkedRuns
  return [...linkedRuns, currentRun].sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))
}

function buildSummaryNode(
  id: string,
  detail: AgentRunDebugDetail,
  status: AgentRunDebuggerStatus,
  position: { x: number; y: number },
): AgentRunDebuggerNode {
  return {
    id,
    type: 'runDebuggerNode',
    position,
    draggable: false,
    selectable: true,
    data: {
      kind: 'summary',
      label: '汇总结果',
      status,
      tone: toneForDebuggerStatus(status),
      run: {
        id: detail.agentRun.id,
        title: '汇总结果',
        status,
        durationMs: durationMs(detail.agentRun),
        tokenTotal: tokenTotal(detail.agentRun),
        modelId: detail.snapshot?.agent.modelId ?? detail.agentRun.modelId ?? detail.agentRun.usage?.model ?? null,
      },
    },
  }
}

export function focusAgentRunDebuggerGraph(
  graph: AgentRunDebuggerGraph,
  focus: AgentRunDebuggerGraphFocus,
): AgentRunDebuggerGraph {
  if (focus === 'all') {
    return {
      nodes: graph.nodes.map((node) => ({ ...node, data: { ...node.data, emphasis: 'normal' } })),
      edges: graph.edges.map((edge) => ({ ...edge, style: { ...edge.style, opacity: 1 } })),
    }
  }

  const nextNodes = graph.nodes.map((node) => {
    const matched = nodeMatchesGraphFocus(node, focus)
    return {
      ...node,
      data: {
        ...node.data,
        emphasis: matched ? 'normal' as const : 'muted' as const,
      },
    }
  })
  const emphasisById = new Map(nextNodes.map((node) => [node.id, node.data.emphasis]))

  return {
    nodes: nextNodes,
    edges: graph.edges.map((edge) => {
      const sourceMuted = emphasisById.get(edge.source) === 'muted'
      const targetMuted = emphasisById.get(edge.target) === 'muted'
      return {
        ...edge,
        style: {
          ...edge.style,
          opacity: sourceMuted && targetMuted ? 0.22 : sourceMuted || targetMuted ? 0.45 : 1,
        },
      }
    }),
  }
}

export function getDebuggerNodeIdForDebugEvent(
  graph: AgentRunDebuggerGraph,
  event: Pick<AgentRunDebugEventRecord, 'agentId' | 'taskId' | 'toolCallId'>,
): string | null {
  if (event.toolCallId) {
    const toolNode = graph.nodes.find((node) => node.data.kind === 'tool' && node.data.tool?.callId === event.toolCallId)
    if (toolNode) return toolNode.id
  }
  if (event.agentId) {
    const agentNode = graph.nodes.find((node) => node.data.kind === 'agent' && node.data.agent?.agentId === event.agentId)
    if (agentNode) return agentNode.id
  }
  if (event.taskId) {
    const taskAgentNode = graph.nodes.find((node) => (
      node.data.kind === 'agent' && node.data.agent?.steps.some((step) => step.id === event.taskId)
    ))
    if (taskAgentNode) return taskAgentNode.id
  }
  return null
}

export function shouldInitializeDebuggerSelection(args: {
  inspectorOpen: boolean
  selectedNodeId: string | null
  graph: AgentRunDebuggerGraph
}): boolean {
  if (!args.inspectorOpen) return false
  if (args.selectedNodeId === null) return args.graph.nodes.length > 0
  return !args.graph.nodes.some((node) => node.id === args.selectedNodeId)
}

export function buildAgentRunInspectorViewModel(
  detail: AgentRunDebugDetail,
  selectedNode: AgentRunDebuggerNode | null,
  toolTrace: readonly AgentRunToolTraceItem[],
): AgentRunInspectorViewModel | AgentRunToolInspectorViewModel {
  const node = selectedNode?.data ?? null
  if (!node) {
    const status = mapRunStatus(detail.agentRun.status)
    return {
      kind: 'empty',
      kicker: 'RUN INSPECTOR',
      title: detail.agentRun.agentName ?? shortGraphId(detail.agentRun.id),
      subtitle: '选择一个 Message、Run、Agent 或 Tool 查看对应详情',
      status,
      metrics: runMetrics(detail.agentRun, detail.snapshot?.agent.modelId ?? detail.agentRun.modelId ?? detail.agentRun.usage?.model ?? null, toolTrace.length),
      fields: [],
      currentTask: null,
      messageContent: null,
    }
  }

  if (node.kind === 'message' && node.message) {
    const linkedRunIds = node.message.runIds
    const associatedAgent = linkedRunIds.includes(detail.agentRun.id)
      ? detail.snapshot?.agent.name ?? detail.agentRun.agentName ?? detail.agentRun.agentId
      : null
    return {
      kind: 'message',
      kicker: 'MESSAGE INSPECTOR',
      title: node.message.role === 'user' ? '用户消息' : 'Agent 消息',
      subtitle: linkedRunIds.length > 0 ? `${linkedRunIds.length} 个关联 Run` : '暂无关联 Run',
      status: node.status,
      metrics: [],
      fields: [
        { label: '发送时间', value: String(node.message.createdAt) },
        { label: '关联 Run', value: linkedRunIds.length > 0 ? linkedRunIds.map((id) => `Run ${shortGraphId(id)}`).join(', ') : '-' },
        { label: '触发 Agent', value: associatedAgent ?? '-' },
      ],
      currentTask: null,
      messageContent: node.message.preview || '-',
    }
  }

  if (node.kind === 'agent' && node.agent) {
    return {
      kind: 'agent',
      kicker: 'AGENT INSPECTOR',
      title: node.agent.name,
      subtitle: `${node.agent.taskIds.length} 个任务 · ${node.agent.toolCallCount} 个工具`,
      status: node.agent.status,
      metrics: [
        { label: '耗时', value: node.agent.durationMs },
        { label: 'Token', value: node.agent.tokenTotal },
        { label: '工具调用', value: node.agent.toolCallCount },
        { label: '模型', value: detail.snapshot?.agent.modelId ?? detail.agentRun.modelId ?? detail.agentRun.usage?.model ?? null },
      ],
      fields: [],
      currentTask: agentCurrentTask(node.agent),
      messageContent: null,
    }
  }

  if (node.kind === 'tool' && node.tool) {
    return buildAgentRunToolInspectorViewModel(detail, toolTrace, [], node.tool.callId) ?? {
      kind: 'empty',
      kicker: 'RUN INSPECTOR',
      title: detail.agentRun.agentName ?? shortGraphId(detail.agentRun.id),
      subtitle: '选择一个 Message、Run、Agent 或 Tool 查看对应详情',
      status: mapRunStatus(detail.agentRun.status),
      metrics: runMetrics(detail.agentRun, detail.snapshot?.agent.modelId ?? detail.agentRun.modelId ?? detail.agentRun.usage?.model ?? null, toolTrace.length),
      fields: [],
      currentTask: null,
      messageContent: null,
    }
  }

  if (node.kind === 'task' && node.task) {
    return {
      kind: 'task',
      kicker: 'TASK INSPECTOR',
      title: node.task.title,
      subtitle: `${node.task.toolNames.length} 个工具 · ${node.task.dependsOn.length} 个依赖`,
      status: node.task.status,
      metrics: [
        { label: '工具调用', value: node.task.toolNames.length },
        { label: '依赖', value: node.task.dependsOn.length },
      ],
      fields: [
        { label: '负责 Agent', value: node.task.agentId },
        { label: '来源', value: node.task.source },
      ],
      currentTask: {
        title: node.task.title,
        stepTitle: null,
        stepIndex: 1,
        stepTotal: 1,
        status: node.task.status,
      },
      messageContent: null,
    }
  }

  return {
    kind: node.kind === 'summary' ? 'summary' : 'empty',
    kicker: node.kind === 'summary' ? 'RUN INSPECTOR' : 'RUN INSPECTOR',
    title: node.run?.title ?? node.label,
    subtitle: node.kind === 'summary' ? '汇总结果' : node.label,
    status: node.status,
    metrics: runMetrics(detail.agentRun, node.run?.modelId ?? detail.snapshot?.agent.modelId ?? detail.agentRun.modelId ?? detail.agentRun.usage?.model ?? null, toolTrace.length),
    fields: node.run ? [{ label: 'Run ID', value: node.run.id }] : [],
    currentTask: null,
    messageContent: null,
  }
}

export function buildAgentRunToolInspectorViewModel(
  detail: AgentRunDebugDetail,
  toolTrace: readonly AgentRunToolTraceItem[],
  debugEvents: readonly AgentRunDebugEventRecord[],
  callId: string | null,
): AgentRunToolInspectorViewModel | null {
  if (!callId) return null
  const item = toolTrace.find((traceItem) => traceItem.callId === callId)
  if (!item) return null
  const meta = getToolTraceMetaByCallId(debugEvents).get(callId) ?? null
  const agentName = resolveToolTraceAgentName(detail, item, debugEvents)
  const status = mapToolEventStatus(meta?.status, item)
  const input = summarizeAgentRunToolTraceArgs(item)
  const output = item.completed ? summarizeAgentRunToolTraceResult(item) : '-'
  return {
    kind: 'tool',
    kicker: 'TOOL INSPECTOR',
    title: item.toolName,
    subtitle: `${toolTraceStatusLabel(status)} · ${agentName ?? '未识别 Agent'}`,
    status,
    metrics: [
      { label: '状态', value: toolTraceStatusLabel(status) },
      { label: '耗时', value: meta?.durationMs ?? null },
      { label: 'Call ID', value: callId },
      { label: 'Agent', value: agentName },
    ],
    fields: [
      { label: 'Call ID', value: callId },
      { label: '状态', value: toolTraceStatusLabel(status) },
      { label: '工具', value: item.toolName },
      { label: '消息', value: item.messageId },
      { label: '完成', value: item.completed ? '是' : '否' },
    ],
    input,
    output,
    callId,
    agentName,
  }
}

function mapToolEventStatus(
  status: AgentRunDebugEventRecord['status'] | null | undefined,
  item: AgentRunToolTraceItem,
): AgentRunDebuggerStatus {
  if (status === 'complete') return 'completed'
  if (status === 'running') return 'running'
  if (status === 'failed') return 'failed'
  if (status === 'aborted') return 'cancelled'
  if (status === 'blocked') return 'pending'
  if (status === 'queued') return 'pending'
  return item.isError ? 'failed' : item.completed ? 'completed' : 'running'
}

export function getVisibleAgentDebuggerSteps(
  steps: readonly AgentRunDebuggerStep[],
  expanded: boolean,
): { steps: AgentRunDebuggerStep[]; hiddenCount: number } {
  const visibleSteps = expanded ? [...steps] : steps.slice(0, 3)
  return {
    steps: visibleSteps,
    hiddenCount: Math.max(0, steps.length - visibleSteps.length),
  }
}

export function describeAgentRunDebugEvent(event: Pick<AgentRunDebugEventRecord, 'type' | 'status' | 'payload'>): { label: string; detail: string } {
  const toolName = stringPayload(event, 'toolName')
  if (event.type === 'run.debug.step.started') {
    if (hasTaskAssignmentPayload(event)) {
      return {
        label: '分配任务给 Agent',
        detail: stringPayload(event, 'task'),
      }
    }
    return { label: 'Agent 开始运行', detail: stringPayload(event, 'label') }
  }
  if (event.type === 'run.debug.step.completed') {
    if (hasTaskAssignmentPayload(event)) {
      return {
        label: 'Agent 完成任务',
        detail: stringPayload(event, 'error') !== '-' ? stringPayload(event, 'error') : stringPayload(event, 'task'),
      }
    }
    return { label: 'Agent 运行结束', detail: summarizeDebugEventDetail(event) }
  }
  if (event.type === 'run.debug.tool.started') {
    return {
      label: toolName === '-' ? '工具调用开始' : `调用 ${toolName}`,
      detail: stringPayload(event, 'argsSummary'),
    }
  }
  if (event.type === 'run.debug.tool.completed') {
    return {
      label: toolName === '-' ? '工具调用完成' : `${toolName} 完成`,
      detail: summarizeDebugEventDetail(event),
    }
  }
  if (event.type === 'run.debug.terminal.output') {
    return {
      label: `Terminal ${stringPayload(event, 'stream')}`,
      detail: summarizeDebugEventDetail(event),
    }
  }
  const payloadLabel = event.payload.label
  if (typeof payloadLabel === 'string' && payloadLabel.trim()) {
    return {
      label: payloadLabel,
      detail: summarizeDebugEventDetail(event),
    }
  }
  return {
    label: event.type,
    detail: summarizeDebugEventDetail(event),
  }
}

function nodeMatchesGraphFocus(
  node: AgentRunDebuggerNode,
  focus: Exclude<AgentRunDebuggerGraphFocus, 'all'>,
): boolean {
  if (focus === 'agent') return node.data.kind === 'agent'
  if (focus === 'tools') {
    if (node.data.kind === 'tool' && node.data.tool) return true
    if (node.data.kind === 'agent' && node.data.agent) {
      return node.data.agent.toolCallCount > 0 || node.data.agent.toolNames.length > 0
    }
    if (node.data.kind === 'task' && node.data.task) return node.data.task.toolNames.length > 0
    return false
  }
  return node.data.status === 'failed' || node.data.status === 'cancelled'
}

export function getAgentRunBoardStageStatus(
  runStatus: AgentRunDebugListItem['status'],
  hasData: boolean,
): AgentRunBoardStageStatus {
  if (!hasData && runStatus === 'running') return 'pending'
  if (runStatus === 'failed') return 'failed'
  if (runStatus === 'aborted') return 'aborted'
  if (runStatus === 'running') return 'running'
  if (runStatus === 'queued') return 'pending'
  return 'complete'
}

export function getBoardPanelTabForStage(stageId: AgentRunBoardStageId): AgentRunBoardPanelTab {
  if (stageId === 'execute') return 'trace'
  if (stageId === 'context' || stageId === 'plan') return 'variables'
  if (stageId === 'trigger') return 'history'
  return 'output'
}

export function getBoardPanelTabForDebuggerNode(kind: AgentRunDebuggerNodeKind): AgentRunBoardPanelTab {
  if (kind === 'summary') return 'output'
  if (kind === 'task') return 'variables'
  if (kind === 'tool') return 'trace'
  if (kind === 'agent') return 'trace'
  if (kind === 'message') return 'history'
  return 'output'
}

export function getBoardPanelTabForCanvasView(view: AgentRunDebuggerCanvasView): AgentRunBoardPanelTab {
  if (view === 'timeline' || view === 'events') return 'logs'
  return 'trace'
}

export function projectAgentRunTerminalOutput(
  detail: AgentRunDebugDetail,
  debugEvents: readonly AgentRunDebugEventRecord[],
  agentId = detail.agentRun.agentId,
): AgentRunTerminalOutput {
  const terminalEvents = debugEvents.filter((event) => (
    event.type === 'run.debug.terminal.output'
    && event.runId === detail.agentRun.id
    && (event.agentId === null || event.agentId === agentId)
  ))
  const ownerByCallId = getDebugEventOwnerByCallId(debugEvents, detail.agentRun.id)
  const eventsByCallId = groupTerminalEventsByCallId(terminalEvents)
  const segments = projectAgentRunToolTrace(detail)
    .filter((item) => getAgentRunToolTraceKind(item.toolName) === 'command')
    .filter((item) => {
      const owner = ownerByCallId.get(item.callId)
      return owner === undefined || owner === null || owner === agentId
    })
    .flatMap((item): AgentRunTerminalSegment[] => {
      const command = stringProp(item.args, 'command') ?? stringProp(item.result, 'command')
      if (!command) return []
      const matchingEvents = eventsByCallId.get(item.callId) ?? []
      const cwd = stringProp(item.result, 'cwd') ?? stringProp(item.args, 'cwd') ?? detail.snapshot?.workspace.effectiveCwd ?? null
      const output = stringProp(item.result, 'output')
        ?? readCliToolResultOutputText(item.result)
        ?? matchingEvents.map((event) => stringProp(event.payload, 'text') ?? '').filter(Boolean).join('\n')
      const shell = inferTerminalShell({
        command,
        cwd,
        toolName: item.toolName,
        shell: stringProp(item.result, 'shell') ?? firstStringPayload(matchingEvents, 'shell'),
      })
      return [{
        callId: item.callId,
        command,
        output,
        cwd,
        shell,
        exitCode: numberProp(item.result, 'exitCode'),
        status: stringProp(item.result, 'status') ?? matchingEvents.at(-1)?.status ?? null,
        truncated: booleanProp(item.result, 'truncated') ?? false,
        timedOut: booleanProp(item.result, 'timedOut') ?? false,
        isError: item.isError,
      }]
    })

  const fallbackSegments = segments.length > 0 ? [] : terminalEvents.flatMap((event): AgentRunTerminalSegment[] => {
    const text = stringProp(event.payload, 'text')
    if (!text) return []
    return [{
      callId: event.toolCallId ?? event.id,
      command: stringProp(event.payload, 'command') ?? 'Terminal output',
      output: text,
      cwd: stringProp(event.payload, 'cwd') ?? detail.snapshot?.workspace.effectiveCwd ?? null,
      shell: inferTerminalShell({
        command: stringProp(event.payload, 'command') ?? '',
        cwd: stringProp(event.payload, 'cwd') ?? detail.snapshot?.workspace.effectiveCwd ?? null,
        toolName: 'terminal',
        shell: stringProp(event.payload, 'shell'),
      }),
      exitCode: numberProp(event.payload, 'exitCode'),
      status: event.status,
      truncated: booleanProp(event.payload, 'truncated') ?? false,
      timedOut: booleanProp(event.payload, 'timedOut') ?? false,
      isError: event.status === 'failed',
    }]
  })

  const allSegments = [...segments, ...fallbackSegments]
  const shell = allSegments[0]?.shell ?? 'Shell'
  const cwd = allSegments.find((segment) => segment.cwd)?.cwd ?? null
  // 只有 run 还在运行时，无状态命令段才视为 live；已完成的 run 不能因为 CLI 结果缺 exitCode 而永远显示「运行中」
  const runRunning = detail.agentRun.status === 'running'
  const status = allSegments.length === 0
    ? 'empty'
    : runRunning && allSegments.some((segment) => segment.status === 'running' || (segment.status === null && segment.exitCode === null))
      ? 'live'
      : 'completed'

  return {
    title: 'Terminal Output',
    shell,
    cwd,
    status,
    commandCount: allSegments.length,
    segments: allSegments,
    transcript: allSegments.map(formatTerminalSegment).join('\n\n'),
  }
}

function runMetrics(
  run: AgentRunDebugListItem,
  model: string | null,
  toolCount: number,
): AgentRunInspectorMetric[] {
  return [
    { label: '耗时', value: durationMs(run) },
    { label: 'Token', value: tokenTotal(run) },
    { label: '工具调用', value: toolCount },
    { label: '模型', value: model },
  ]
}

function agentCurrentTask(agent: AgentRunDebuggerAgentNode): AgentRunInspectorTask | null {
  const currentStepIndex = agent.steps.findIndex((step) => step.status === 'running')
  const fallbackStepIndex = agent.steps.findIndex((step) => step.status === 'pending')
  const stepIndex = currentStepIndex >= 0 ? currentStepIndex : fallbackStepIndex >= 0 ? fallbackStepIndex : 0
  const step = agent.steps[stepIndex] ?? null
  const firstTask = agent.taskTitles[0] ?? step?.title ?? null
  if (!firstTask) return null
  return {
    title: firstTask,
    stepTitle: step?.title ?? null,
    stepIndex: agent.steps.length > 0 ? stepIndex + 1 : 0,
    stepTotal: agent.steps.length,
    status: step?.status ?? agent.status,
  }
}

export function toneForDebuggerStatus(status: AgentRunDebuggerStatus): AgentRunBoardTone {
  if (status === 'completed') return 'success'
  if (status === 'running') return 'info'
  if (status === 'pending') return 'warning'
  if (status === 'failed' || status === 'cancelled') return 'danger'
  return 'neutral'
}

function countInjectedContext(snapshot: AgentRunDebugSnapshot): number {
  return [
    snapshot.context.summaryInjected,
    snapshot.context.workspaceMemoryInjected,
    snapshot.context.historyInjected,
  ].filter(Boolean).length
}

function hasTaskAssignmentPayload(event: Pick<AgentRunDebugEventRecord, 'payload'>): boolean {
  return stringPayload(event, 'task') !== '-' && stringPayload(event, 'childRunId') !== '-'
}

function stringPayload(event: Pick<AgentRunDebugEventRecord, 'payload'>, key: string): string {
  const value = event.payload[key]
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return '-'
}

function summarizeDebugEventDetail(event: Pick<AgentRunDebugEventRecord, 'payload'>): string {
  const error = stringPayload(event, 'error')
  if (error !== '-') return error
  const output = stringPayload(event, 'outputSummary')
  if (output !== '-') return output
  const args = stringPayload(event, 'argsSummary')
  if (args !== '-') return args
  const text = stringPayload(event, 'text')
  if (text !== '-') return text
  return '-'
}

function groupTerminalEventsByCallId(events: readonly AgentRunDebugEventRecord[]): Map<string, AgentRunDebugEventRecord[]> {
  const grouped = new Map<string, AgentRunDebugEventRecord[]>()
  for (const event of events) {
    const key = event.toolCallId ?? event.id
    const current = grouped.get(key) ?? []
    current.push(event)
    grouped.set(key, current)
  }
  for (const current of grouped.values()) current.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  return grouped
}

function getDebugEventOwnerByCallId(
  events: readonly AgentRunDebugEventRecord[],
  runId: string,
): Map<string, string | null> {
  const owners = new Map<string, string | null>()
  for (const event of events) {
    if (event.runId !== runId || !event.toolCallId) continue
    const current = owners.get(event.toolCallId)
    if (current && current !== event.agentId) continue
    owners.set(event.toolCallId, event.agentId)
  }
  return owners
}

function firstStringPayload(events: readonly AgentRunDebugEventRecord[], key: string): string | null {
  for (const event of events) {
    const value = stringProp(event.payload, key)
    if (value) return value
  }
  return null
}

function resolveToolTraceOwnerAgentId(
  detail: AgentRunDebugDetail,
  item: AgentRunToolTraceItem,
  planTasks: readonly DispatchPlanItem[],
  childRunsByAgent: Map<string, AgentRunDebugListItem[]>,
  fallbackAgentId: string,
): string {
  const serialized = `${safeStringify(item.args)} ${safeStringify(item.result)}`
  for (const [agentId] of childRunsByAgent) {
    if (serialized.includes(agentId)) return agentId
  }
  for (const task of planTasks) {
    if (serialized.includes(task.id)) return task.agentId
  }
  if (serialized.includes(detail.agentRun.agentId) || serialized.includes(detail.agentRun.agentName ?? '')) return detail.agentRun.agentId
  const inferred = readAgentIdFromValue(item.args) ?? readAgentIdFromValue(item.result)
  if (inferred) return inferred
  return fallbackAgentId
}

function resolveToolTraceOwnerAgentName(
  detail: AgentRunDebugDetail,
  item: AgentRunToolTraceItem,
  planTasks: readonly DispatchPlanItem[],
  childRunsByAgent: Map<string, AgentRunDebugListItem[]>,
  agentId: string,
  fallbackAgentName: string,
): string | null {
  const childRun = childRunsByAgent.get(agentId)?.[0] ?? null
  if (childRun) return childRun.agentName ?? childRun.agentId
  if (agentId === detail.agentRun.agentId) return detail.snapshot?.agent.name ?? detail.agentRun.agentName ?? detail.agentRun.agentId
  const matchedTask = planTasks.find((task) => task.agentId === agentId)
  if (matchedTask) return detail.childrenRuns.find((run) => run.agentId === matchedTask.agentId)?.agentName ?? matchedTask.agentId
  const inferred = readAgentIdFromValue(item.args) ?? readAgentIdFromValue(item.result)
  if (inferred) {
    const inferredRun = detail.childrenRuns.find((run) => run.agentId === inferred)
    if (inferredRun) return inferredRun.agentName ?? inferredRun.agentId
    return inferred
  }
  return fallbackAgentName
}

function resolveToolTraceAgentName(
  detail: AgentRunDebugDetail,
  item: AgentRunToolTraceItem,
  debugEvents: readonly AgentRunDebugEventRecord[],
): string | null {
  const ownerByCallId = getDebugEventOwnerByCallId(debugEvents, detail.agentRun.id)
  const ownerAgentId = ownerByCallId.get(item.callId) ?? null
  if (ownerAgentId === detail.agentRun.agentId) return detail.snapshot?.agent.name ?? detail.agentRun.agentName ?? detail.agentRun.agentId
  const childRun = detail.childrenRuns.find((run) => run.agentId === ownerAgentId || run.agentName === ownerAgentId)
  if (childRun) return childRun.agentName ?? childRun.agentId
  if (ownerAgentId) return ownerAgentId
  const inferredAgentId = readAgentIdFromValue(item.args) ?? readAgentIdFromValue(item.result)
  if (inferredAgentId) {
    const inferredRun = detail.childrenRuns.find((run) => run.agentId === inferredAgentId)
    return inferredRun?.agentName ?? inferredRun?.agentId ?? inferredAgentId
  }
  return detail.snapshot?.agent.name ?? detail.agentRun.agentName ?? detail.agentRun.agentId
}

function readAgentIdFromValue(value: unknown): string | null {
  const serialized = safeStringify(value)
  const match = serialized.match(/(?:agentId|agent_id|agent)=["']?([\w.-]+)["']?/i)
  return match?.[1] ?? null
}

function toolTraceStatusLabel(status: AgentRunDebuggerStatus): string {
  if (status === 'completed') return '完成'
  if (status === 'running') return '进行中'
  if (status === 'failed') return '失败'
  if (status === 'cancelled') return '已取消'
  if (status === 'pending') return '等待'
  return '等待'
}

function getToolTraceMetaByCallId(events: readonly AgentRunDebugEventRecord[]): Map<string, { status: AgentRunDebugEventRecord['status']; durationMs: number | null }> {
  const result = new Map<string, { status: AgentRunDebugEventRecord['status']; durationMs: number | null }>()
  for (const event of events) {
    if (!event.toolCallId || !event.type.includes('.tool.')) continue
    const existing = result.get(event.toolCallId)
    const durationMs = numberProp(event.payload, 'durationMs')
    result.set(event.toolCallId, {
      status: event.status ?? existing?.status ?? null,
      durationMs: durationMs ?? existing?.durationMs ?? null,
    })
  }
  return result
}

function formatTerminalSegment(segment: AgentRunTerminalSegment): string {
  const prompt = terminalPrompt(segment.shell, segment.cwd)
  const output = segment.output.trimEnd()
  const exitLine = segment.exitCode === null ? '' : `\n[exit ${segment.exitCode}]`
  const notes = [
    segment.truncated ? '[output truncated by backend]' : '',
    segment.timedOut ? '[command timed out]' : '',
  ].filter(Boolean)
  return `${prompt}\n${segment.command}${output ? `\n${output}` : ''}${exitLine}${notes.length ? `\n${notes.join('\n')}` : ''}`
}

function terminalPrompt(shell: string, cwd: string | null): string {
  if (shell === 'PowerShell') return `PS ${cwd ?? ''}>`.replace('  ', ' ')
  if (shell === 'cmd') return `${cwd ?? ''}>`.replace(/^>/, '>')
  return `${cwd ? `${cwd} ` : ''}$`
}

function inferTerminalShell(args: { command: string; cwd: string | null; toolName: string; shell: string | null }): string {
  if (args.shell) return normalizeShellName(args.shell)
  if (isWindowsPath(args.cwd) || /\b(Get|Set|Select|Where|ForEach|New|Remove|Copy|Move|Test)-[A-Za-z]+\b|powershell(?:\.exe)?|\bpwsh\b|\.ps1\b/i.test(args.command)) return 'PowerShell'
  if (/\bcmd(?:\.exe)?\b|(?:^|\s)(dir|copy|del|type)\s+/i.test(args.command)) return 'cmd'
  if (args.toolName === 'Bash') return 'bash'
  if (/\b(?:bash|zsh|sh)\b/.test(args.command) || /^\s*(?:ls|grep|cat|sed|awk|chmod|pnpm|npm|node|git)\b/.test(args.command)) return 'Shell'
  return 'Shell'
}

function normalizeShellName(value: string): string {
  const normalized = value.toLowerCase()
  if (normalized.includes('powershell') || normalized.includes('pwsh')) return 'PowerShell'
  if (normalized.includes('cmd')) return 'cmd'
  if (normalized.includes('bash')) return 'bash'
  if (normalized.includes('zsh')) return 'zsh'
  if (normalized === 'sh' || normalized.endsWith('/sh')) return 'sh'
  return value
}

function isWindowsPath(value: string | null): boolean {
  return typeof value === 'string' && /^[a-z]:[\\/]/i.test(value)
}

function prop(source: unknown, key: string): unknown {
  if (!source || typeof source !== 'object') return undefined
  return (source as Record<string, unknown>)[key]
}

function stringProp(source: unknown, key: string): string | null {
  const value = prop(source, key)
  return typeof value === 'string' && value.length > 0 ? value : null
}

// Claude CLI 的 tool_result 可能是纯字符串或 [{ type: 'text', text }] 块数组 —— 从中提取终端输出
function readCliToolResultOutputText(result: unknown): string | null {
  if (typeof result === 'string') return result.length > 0 ? result : null
  if (Array.isArray(result)) {
    const text = result
      .map((block) => stringProp(block, 'text') ?? '')
      .join('')
    return text.length > 0 ? text : null
  }
  return null
}

function numberProp(source: unknown, key: string): number | null {
  const value = prop(source, key)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function booleanProp(source: unknown, key: string): boolean | null {
  const value = prop(source, key)
  return typeof value === 'boolean' ? value : null
}

function buildDebuggerEdge(source: string, target: string, status: AgentRunDebuggerStatus): Edge {
  const tone = toneForDebuggerStatus(status)
  return {
    id: `edge-${source}-${target}`,
    source,
    target,
    type: 'smoothstep',
    animated: status === 'running',
    style: {
      stroke: tone === 'danger' ? '#ef4444' : tone === 'info' ? '#2563eb' : tone === 'success' ? '#10b981' : '#cbd5e1',
      strokeWidth: status === 'running' ? 3 : 2,
    },
  }
}

function groupRunsByAgent(runs: readonly AgentRunDebugListItem[]): Map<string, AgentRunDebugListItem[]> {
  const grouped = new Map<string, AgentRunDebugListItem[]>()
  for (const run of runs) {
    const current = grouped.get(run.agentId) ?? []
    current.push(run)
    grouped.set(run.agentId, current)
  }
  for (const group of grouped.values()) {
    group.sort((a, b) => b.startedAt - a.startedAt)
  }
  return grouped
}

function groupTaskIdsByAgent(tasks: readonly DispatchPlanItem[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>()
  for (const task of tasks) {
    const current = grouped.get(task.agentId) ?? []
    current.push(task.id)
    grouped.set(task.agentId, current)
  }
  return grouped
}

function statusForAgent(
  run: AgentRunDebugListItem | null,
  tasks: readonly DispatchPlanItem[],
  parentStatus: AgentRunDebugListItem['status'],
): AgentRunDebuggerStatus {
  if (run) return mapRunStatus(run.status)
  if (parentStatus === 'failed') return 'failed'
  if (parentStatus === 'aborted') return 'cancelled'
  if (parentStatus === 'running' || parentStatus === 'queued') return 'pending'
  return tasks.length > 0 ? 'pending' : 'completed'
}

function statusForTask(
  task: DispatchPlanItem,
  childRuns: readonly AgentRunDebugListItem[],
  parentStatus: AgentRunDebugListItem['status'],
): AgentRunDebuggerStatus {
  if (childRuns.some((run) => run.status === 'failed')) return 'failed'
  if (childRuns.some((run) => run.status === 'aborted')) return 'cancelled'
  if (childRuns.some((run) => run.status === 'running' || run.status === 'queued')) return 'running'
  if (childRuns.some((run) => run.status === 'complete')) return 'completed'
  if (parentStatus === 'running' || parentStatus === 'queued') return task.dependsOn?.length ? 'pending' : 'running'
  if (parentStatus === 'failed') return 'failed'
  if (parentStatus === 'aborted') return 'cancelled'
  return 'pending'
}

function mapRunStatus(status: AgentRunDebugListItem['status']): AgentRunDebuggerStatus {
  if (status === 'complete') return 'completed'
  if (status === 'running') return 'running'
  if (status === 'failed') return 'failed'
  if (status === 'aborted') return 'cancelled'
  return 'pending'
}

function mapMessageStatus(status: MessageRecord['status']): AgentRunDebuggerStatus {
  if (status === 'complete') return 'completed'
  if (status === 'streaming') return 'running'
  if (status === 'error') return 'failed'
  if (status === 'aborted') return 'cancelled'
  return 'pending'
}

function getOutputNodeStatus(
  run: AgentRunDebugListItem,
  hasData: boolean,
): AgentRunDebuggerStatus {
  if (!hasData && run.status !== 'running') return 'pending'
  return mapRunStatus(run.status)
}

function groupRunsByTriggerMessage(runs: readonly AgentRunDebugListItem[]): Map<string, AgentRunDebugListItem[]> {
  const grouped = new Map<string, AgentRunDebugListItem[]>()
  for (const run of runs) {
    if (!run.triggerMessageId) continue
    const bucket = grouped.get(run.triggerMessageId) ?? []
    bucket.push(run)
    grouped.set(run.triggerMessageId, bucket)
  }
  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))
  }
  return grouped
}

function summarizeMessagePreview(message: MessageRecord): string {
  const text = message.parts
    .flatMap((part) => (part.type === 'text' || part.type === 'code' ? [part.content] : []))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text) return summarizeRunDisplayTitle(text)
  return `${message.parts.length} parts`
}

function runTitleForSessionGraph(
  run: AgentRunDebugListItem,
  messageById: Map<string, MessageRecord>,
): string {
  const triggerMessage = run.triggerMessageId ? messageById.get(run.triggerMessageId) : null
  if (triggerMessage) return summarizeMessagePreview(triggerMessage)
  return run.agentName ?? `Run ${shortGraphId(run.id)}`
}

function durationMs(run: Pick<AgentRunDebugListItem, 'startedAt' | 'finishedAt'>): number | null {
  if (run.finishedAt === null) return null
  return Math.max(0, run.finishedAt - run.startedAt)
}

function tokenTotal(run: Pick<AgentRunDebugListItem, 'usage'>): number | null {
  if (!run.usage) return null
  return run.usage.inputTokens + run.usage.outputTokens + run.usage.cacheCreationTokens + run.usage.cacheReadTokens
}

function countToolsForAgent(toolTrace: readonly AgentRunToolTraceItem[], agentId: string): number {
  return toolTrace.filter((item) => {
    const serialized = safeStringify(item.args)
    return serialized.includes(agentId)
  }).length
}

function uniqueToolNames(toolTrace: readonly AgentRunToolTraceItem[]): string[] {
  return [...new Set(toolTrace.map((item) => item.toolName))].slice(0, 4)
}

function uniqueTaskToolNames(tasks: readonly DispatchPlanItem[]): string[] {
  return [...new Set(tasks.flatMap(taskToolNames))].slice(0, 4)
}

function uniqueToolNamesForAgent(toolTrace: readonly AgentRunToolTraceItem[], agentId: string): string[] {
  return [...new Set(toolTrace.filter((item) => safeStringify(item.args).includes(agentId)).map((item) => item.toolName))].slice(0, 4)
}

function taskToolNames(task: DispatchPlanItem): string[] {
  const tools = new Set<string>()
  if ((task.requiredCommands?.length ?? 0) > 0) tools.add('bash')
  for (const output of task.expectedOutputs ?? []) {
    if (output.type === 'project') tools.add('fs_write')
    if (output.type === 'web_app') tools.add('write_artifact')
  }
  if (tools.size === 0) tools.add(task.taskKind ?? 'task')
  return [...tools]
}

function toStep(task: DispatchPlanItem, status: AgentRunDebuggerStatus): AgentRunDebuggerStep {
  return {
    id: task.id,
    title: task.task,
    status,
    dependsOn: task.dependsOn ?? [],
    toolNames: taskToolNames(task),
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return ''
  }
}

function shortGraphId(id: string): string {
  return id.length > 14 ? id.slice(0, 10) : id
}

export function rootTaskLabel(detail: AgentRunDebugDetail, agentNames: Array<string | null | undefined> = []): string {
  const text = detail.triggerMessage?.parts
    .flatMap((part) => (part.type === 'text' || part.type === 'code' ? [part.content] : []))
    .join(' ')
    .trim()
  if (text) {
    const cleanText = stripLeadingAgentMentions(text, agentNames)
    return summarizeRunDisplayTitle(cleanText)
  }
  return detail.snapshot?.agent.name ?? detail.agentRun.agentName ?? shortGraphId(detail.agentRun.id)
}

export function summarizeRunDisplayTitle(value: string): string {
  const cleaned = stripLeadingAgentMentions(value, [])
  const sentence = cleaned
    .split(/[\n\r]+|[。！？!?；;]/)
    .map((part) => part.trim())
    .find(Boolean) ?? cleaned.trim()
  const clause = sentence.split(/[,，、]/).map((part) => part.trim()).find(Boolean) ?? sentence
  const normalized = clause.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 28) return normalized
  return `${normalized.slice(0, 27)}…`
}

function stripLeadingAgentMentions(value: string, agentNames: Array<string | null | undefined>): string {
  let result = value.trim()
  const mentionNames = [...new Set(agentNames.filter((name): name is string => Boolean(name?.trim())).map((name) => name.trim()))]
    .sort((a, b) => b.length - a.length)
  for (const name of mentionNames) {
    const pattern = new RegExp(`^@${escapeRegExp(name)}(?:\\s+|[：:，,、/]+)?`)
    while (pattern.test(result)) {
      result = result.replace(pattern, '').trim()
    }
  }
  result = result.replace(/^@[\p{L}\p{N}_\-.]+(?:\s+|[：:，,、/]+)?/u, '').trim()
  return result || value.trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 将 SSE 实时 live runs 的状态、结束时间、usage 叠加到 cachedDetail 上。
 * 当 SSE 推送 `run.end` 让子 run 提前进入 complete 时，
 * 不再需要 1.8s 的轮询兜底 → 流程图、阶段条、Inspector 立即反映完成状态。
 *
 * 若 live runs 中没有 agentRun（极少见，detail 是从外部传入 + runs 还没到），
 * 直接返回 cachedDetail 走原有路径，调用方 useMemo 不会触发额外刷新。
 *
 * 若叠加结果完全等于 cachedDetail（live 与 cached 同 status、同 finishedAt、同 usage），
 * 也返回原对象，避免下游 useMemo 误判「需要刷新」。
 */
export function mergeDetailWithLiveStatus(
  cachedDetail: AgentRunDebugDetail,
  runs: readonly AgentRunDebugListItem[],
): AgentRunDebugDetail {
  const runsById = new Map(runs.map((run) => [run.id, run]))
  const agentRun = runsById.get(cachedDetail.agentRun.id)
  if (!agentRun) return cachedDetail
  const nextAgentRun =
    agentRun.status === cachedDetail.agentRun.status &&
    agentRun.finishedAt === cachedDetail.agentRun.finishedAt &&
    agentRun.usage === cachedDetail.agentRun.usage
      ? cachedDetail.agentRun
      : {
          ...cachedDetail.agentRun,
          status: agentRun.status,
          finishedAt: agentRun.finishedAt,
          usage: agentRun.usage ?? cachedDetail.agentRun.usage,
        }
  let nextChildrenRuns = cachedDetail.childrenRuns
  let mutatedChildren = false
  for (let i = 0; i < cachedDetail.childrenRuns.length; i += 1) {
    const child = cachedDetail.childrenRuns[i]
    const liveChild = runsById.get(child.id)
    if (!liveChild || liveChild.status === child.status) continue
    if (!mutatedChildren) {
      nextChildrenRuns = cachedDetail.childrenRuns.slice()
      mutatedChildren = true
    }
    nextChildrenRuns[i] = {
      ...child,
      status: liveChild.status,
      finishedAt: liveChild.finishedAt,
      usage: liveChild.usage ?? child.usage,
    }
  }
  if (nextAgentRun === cachedDetail.agentRun && nextChildrenRuns === cachedDetail.childrenRuns) {
    return cachedDetail
  }
  return { ...cachedDetail, agentRun: nextAgentRun, childrenRuns: nextChildrenRuns }
}

/**
 * 把 cached runs 列表叠加 live runs 的最新字段，并按 startedAt 倒序返回。
 *
 * - 已存在的 id：spliced（保留 cachedDetail 中的 agentName / adapterName / modelId / hasDebugSnapshot 等本地派生字段）。
 * - 未在 cached 中但 live 有的 id（如刚推送、新出现的任务）追加到列表。
 * - live runs 为 undefined 时按 cachedRuns 倒序返回，避免调用方 useMemo 误判 null。
 */
export function mergeLiveRuns(
  cachedRuns: AgentRunDebugListItem[],
  liveRuns: Record<string, AgentRunRow> | undefined,
  agents: Record<string, { name: string }>,
): AgentRunDebugListItem[] {
  const merged = cachedRuns.map((run) => {
    const live = liveRuns?.[run.id]
    return live
      ? {
          ...run,
          status: live.status,
          error: live.error ?? run.error,
          usage: live.usage ?? run.usage,
          finishedAt: live.finishedAt ?? run.finishedAt,
        }
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
