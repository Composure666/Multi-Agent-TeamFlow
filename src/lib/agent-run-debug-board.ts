import type { Edge, Node } from '@xyflow/react'

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
  projectAgentRunPlanTasks,
  projectAgentRunTaskResults,
  projectAgentRunToolTrace,
  type AgentRunToolTraceItem,
} from './agent-run-debug-projection'

export type AgentRunBoardStageId = 'trigger' | 'context' | 'plan' | 'execute' | 'output'
export type AgentRunBoardPanelTab = 'timeline' | 'output' | 'trace' | 'variables' | 'logs' | 'artifacts' | 'history'
export type AgentRunDebuggerCanvasView = 'graph' | 'timeline' | 'events'
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

export type AgentRunDebuggerNodeKind = 'message' | 'run' | 'agent' | 'task' | 'summary'
export type AgentRunDebuggerGraphFocus = 'all' | 'agent' | 'tools' | 'errors'
export type AgentRunDebuggerStatus =
  | 'waiting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'aborted'
  | 'unavailable'

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
}

export type AgentRunDebuggerNode = Node<AgentRunDebuggerNodeData, 'runDebuggerNode'>

export interface AgentRunDebuggerGraph {
  nodes: AgentRunDebuggerNode[]
  edges: Edge[]
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

  return [
    {
      id: 'trigger',
      title: '触发',
      description: detail.triggerMessage ? '用户消息已进入当前 run' : '当前 run 没有关联触发消息',
      metric: detail.triggerMessage ? '1 条触发消息' : '触发消息不可用',
      status: detail.agentRun.status === 'queued' ? 'pending' : 'complete',
      tone: detail.triggerMessage ? 'info' : 'neutral',
    },
    {
      id: 'context',
      title: '上下文',
      description: detail.snapshot ? '运行时上下文快照已加载' : '旧 run 没有运行时上下文快照',
      metric: detail.snapshot ? `${contextCount} 类上下文` : '快照不可用',
      status: detail.snapshot ? 'complete' : 'unavailable',
      tone: detail.snapshot ? 'success' : 'warning',
    },
    {
      id: 'plan',
      title: '规划',
      description: planTasks.length > 0 ? '任务已拆分并进入协作链路' : '当前 run 没有可识别的拆分计划',
      metric: planTasks.length > 0 ? `${planTasks.length} 个任务` : '无拆分计划',
      status: planTasks.length > 0
        ? getPlanStageStatus(detail.childrenRuns, detail.agentRun.status)
        : 'unavailable',
      tone: planTasks.length > 0
        ? toneForStatus(getPlanStageStatus(detail.childrenRuns, detail.agentRun.status))
        : 'neutral',
    },
    {
      id: 'execute',
      title: '执行',
      description: toolTrace.length > 0 ? '工具调用和子 Agent 正在推进' : '当前 run 尚未产生可识别执行轨迹',
      metric: `${toolTrace.length} 次调用 · ${childCount} 个子 Agent`,
      status: getExecutionStageStatus(detail.agentRun, toolTrace.length + childCount > 0),
      tone: toneForStatus(getExecutionStageStatus(detail.agentRun, toolTrace.length + childCount > 0)),
    },
    {
      id: 'output',
      title: '产出',
      description: artifacts.length > 0 || taskResults.length > 0
        ? '产物和任务结果正在汇总'
        : '当前 run 尚未产生可识别产出',
      metric: `${artifacts.length} 个产物`,
      status: getOutputStageStatus(detail.agentRun, artifacts.length + taskResults.length > 0),
      tone: toneForStatus(getOutputStageStatus(detail.agentRun, artifacts.length + taskResults.length > 0)),
    },
  ]
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
  const workerAgentIds = [
    ...new Set([
      ...planTasks.map((task) => task.agentId),
      ...detail.childrenRuns.map((run) => run.agentId),
    ]),
  ]
  const workerY = 430
  const summaryY = 690
  const summaryFallbackY = 430
  const workerXGap = 305
  const centerX = 360
  const workerStartX = Math.round(centerX - ((Math.max(1, workerAgentIds.length) - 1) * workerXGap) / 2)
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
  edges.push(buildDebuggerEdge(runNodeId, orchestratorNodeId, mapRunStatus(detail.agentRun.status)))

  if (workerAgentIds.length === 0) {
    if (hasOutputEvidence) {
      const outputStatus = getOutputNodeStatus(detail.agentRun, hasOutputEvidence)
      nodes.push(buildSummaryNode(summaryNodeId, detail, outputStatus, { x: centerX, y: summaryFallbackY }))
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
    nodes.push({
      id: agentNodeId,
      type: 'runDebuggerNode',
      position: { x: workerStartX + index * workerXGap, y: workerY },
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
    edges.push(buildDebuggerEdge(orchestratorNodeId, agentNodeId, agentStatus))
  })

  const outputStatus = getOutputNodeStatus(detail.agentRun, hasOutputEvidence)
  nodes.push(buildSummaryNode(summaryNodeId, detail, outputStatus, { x: centerX, y: summaryY }))
  for (const agentId of workerAgentIds) {
    edges.push(buildDebuggerEdge(`agent-${agentId}`, summaryNodeId, outputStatus))
  }

  return { nodes, edges }
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
  event: Pick<AgentRunDebugEventRecord, 'agentId' | 'taskId'>,
): string | null {
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
    if (node.data.kind === 'agent' && node.data.agent) {
      return node.data.agent.toolCallCount > 0 || node.data.agent.toolNames.length > 0
    }
    if (node.data.kind === 'task' && node.data.task) return node.data.task.toolNames.length > 0
    return false
  }
  return node.data.status === 'failed' || node.data.status === 'aborted' || node.data.status === 'blocked'
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
  if (kind === 'agent') return 'trace'
  if (kind === 'message') return 'history'
  return 'output'
}

export function getBoardPanelTabForCanvasView(view: AgentRunDebuggerCanvasView): AgentRunBoardPanelTab {
  if (view === 'timeline' || view === 'events') return 'timeline'
  return 'trace'
}

function getExecutionStageStatus(
  run: AgentRunDebugListItem,
  hasData: boolean,
): AgentRunBoardStageStatus {
  if (!hasData && run.status !== 'running') return 'unavailable'
  return getAgentRunBoardStageStatus(run.status, hasData)
}

function getOutputStageStatus(
  run: AgentRunDebugListItem,
  hasData: boolean,
): AgentRunBoardStageStatus {
  if (!hasData && run.status !== 'running') return 'unavailable'
  return getAgentRunBoardStageStatus(run.status, hasData)
}

function getOutputNodeStatus(
  run: AgentRunDebugListItem,
  hasData: boolean,
): AgentRunDebuggerStatus {
  if (!hasData && run.status !== 'running') return 'unavailable'
  return mapRunStatus(run.status)
}

function getPlanStageStatus(
  childrenRuns: readonly AgentRunDebugListItem[],
  parentStatus: AgentRunDebugListItem['status'],
): AgentRunBoardStageStatus {
  if (childrenRuns.some((run) => run.status === 'failed')) return 'failed'
  if (childrenRuns.some((run) => run.status === 'aborted')) return 'aborted'
  if (childrenRuns.some((run) => run.status === 'running' || run.status === 'queued')) return 'running'
  return getAgentRunBoardStageStatus(parentStatus, childrenRuns.length > 0)
}

function toneForStatus(status: AgentRunBoardStageStatus): AgentRunBoardTone {
  if (status === 'complete') return 'success'
  if (status === 'running') return 'info'
  if (status === 'pending') return 'warning'
  if (status === 'failed' || status === 'aborted') return 'danger'
  return 'neutral'
}

export function toneForDebuggerStatus(status: AgentRunDebuggerStatus): AgentRunBoardTone {
  if (status === 'completed') return 'success'
  if (status === 'running') return 'info'
  if (status === 'waiting' || status === 'blocked') return 'warning'
  if (status === 'failed' || status === 'aborted') return 'danger'
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
  if (parentStatus === 'failed') return 'unavailable'
  if (parentStatus === 'aborted') return 'aborted'
  if (parentStatus === 'running' || parentStatus === 'queued') return 'waiting'
  return tasks.length > 0 ? 'unavailable' : 'completed'
}

function statusForTask(
  task: DispatchPlanItem,
  childRuns: readonly AgentRunDebugListItem[],
  parentStatus: AgentRunDebugListItem['status'],
): AgentRunDebuggerStatus {
  if (childRuns.some((run) => run.status === 'failed')) return 'failed'
  if (childRuns.some((run) => run.status === 'aborted')) return 'aborted'
  if (childRuns.some((run) => run.status === 'running' || run.status === 'queued')) return 'running'
  if (childRuns.some((run) => run.status === 'complete')) return 'completed'
  if (parentStatus === 'running' || parentStatus === 'queued') return task.dependsOn?.length ? 'waiting' : 'running'
  if (parentStatus === 'failed') return 'unavailable'
  if (parentStatus === 'aborted') return 'aborted'
  return 'unavailable'
}

function mapRunStatus(status: AgentRunDebugListItem['status']): AgentRunDebuggerStatus {
  if (status === 'complete') return 'completed'
  if (status === 'queued') return 'waiting'
  return status
}

function mapMessageStatus(status: MessageRecord['status']): AgentRunDebuggerStatus {
  if (status === 'complete') return 'completed'
  if (status === 'streaming') return 'running'
  if (status === 'error') return 'failed'
  return 'aborted'
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
