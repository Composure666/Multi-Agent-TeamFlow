import type { Edge, Node } from '@xyflow/react'

import type {
  AgentRunDebugDetail,
  AgentRunDebugListItem,
  AgentRunDebugSnapshot,
} from '@/shared/types'

import {
  projectAgentRunArtifacts,
  projectAgentRunPlanTasks,
  projectAgentRunTaskResults,
  projectAgentRunToolTrace,
} from './agent-run-debug-projection'

export type AgentRunBoardStageId = 'trigger' | 'context' | 'plan' | 'execute' | 'output'
export type AgentRunBoardPanelTab = 'output' | 'trace' | 'variables' | 'logs' | 'artifacts' | 'history'
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

function countInjectedContext(snapshot: AgentRunDebugSnapshot): number {
  return [
    snapshot.context.summaryInjected,
    snapshot.context.workspaceMemoryInjected,
    snapshot.context.historyInjected,
  ].filter(Boolean).length
}
