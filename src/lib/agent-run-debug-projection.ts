import type { AgentRunDebugDetail, AgentRunDebugListItem, DispatchPlanItem, MessageRecord, TaskResultReport } from '@/shared/types'

export interface AgentRunMessageSummary {
  messageId: string
  role: MessageRecord['role']
  status: MessageRecord['status']
  agentId: string | null
  runId: string | null
  createdAt: number
  partCount: number
  textChars: number
  thinkingChars: number
  toolUseCount: number
  toolResultCount: number
  artifactRefCount: number
  deployPartCount: number
  preview: string
}

export interface AgentRunRelationsSummary {
  current: AgentRunRelationItem
  parent: AgentRunRelationItem | null
  children: AgentRunRelationItem[]
  triggerMessage: AgentRunMessageSummary | null
  outputMessages: AgentRunMessageSummary[]
}

export interface AgentRunRelationItem {
  id: string
  agentId: string
  agentName: string | null
  adapterName: string | null
  modelId: string | null
  status: AgentRunDebugListItem['status']
  startedAt: number
  finishedAt: number | null
}

export interface AgentRunToolTraceItem {
  callId: string
  toolName: string
  messageId: string
  messageIndex: number
  partIndex: number
  args: unknown
  result: unknown | null
  isError: boolean
  completed: boolean
}

export type AgentRunToolTraceKind =
  | 'command'
  | 'file_change'
  | 'mcp'
  | 'web_search'
  | 'agenthub'
  | 'other'

export interface AgentRunDebugOperationSummary {
  files: AgentRunDebugFileOperation[]
  commands: AgentRunDebugCommandOperation[]
  network: AgentRunDebugNetworkOperation[]
}

export interface AgentRunDebugFileOperation {
  callId: string
  toolName: string
  kind: 'read' | 'write' | 'list' | 'change'
  path: string
  detail?: string
  isError: boolean
}

export interface AgentRunDebugCommandOperation {
  callId: string
  toolName: string
  command: string
  exitCode: number | null
  status: string | null
  isError: boolean
}

export interface AgentRunDebugNetworkOperation {
  callId: string
  toolName: string
  target: string
  kind: 'fetch' | 'search'
  status: string | null
  isError: boolean
}

export interface AgentRunAskUserInteraction {
  callId: string
  messageId: string
  questionCount: number
  questions: Array<{
    question: string
    header: string | null
    multiSelect: boolean
    options: string[]
    answer: string | null
  }>
  answered: boolean
  isError: boolean
}

export interface AgentRunTaskResultTrace {
  callId: string
  messageId: string
  status: TaskResultReport['status']
  summary: string
  acceptanceResults: TaskResultReport['acceptanceResults']
  filesChanged: TaskResultReport['filesChanged']
  commandsRun: TaskResultReport['commandsRun']
  tests: TaskResultReport['tests']
  blockers: TaskResultReport['blockers']
}

export interface AgentRunPlanDagNode {
  id: string
  agentId: string
  task: string
  taskKind: DispatchPlanItem['taskKind'] | null
  dependsOn: string[]
  missingDependsOn: string[]
  dependents: string[]
  layer: number
  isRoot: boolean
  isLeaf: boolean
  hasCycle: boolean
  dispatch: DispatchPlanItem
}

export interface AgentRunPlanDagEdge {
  from: string
  to: string
}

export interface AgentRunPlanDagProjection {
  nodes: AgentRunPlanDagNode[]
  edges: AgentRunPlanDagEdge[]
  layers: string[][]
  missingDependencyCount: number
  hasCycle: boolean
}

export interface AgentRunAgentTaskChain {
  agentId: string
  tasks: DispatchPlanItem[]
  taskResults: AgentRunTaskResultTrace[]
  commands: AgentRunDebugCommandOperation[]
}

export interface AgentRunTimelineItem {
  id: string
  messageId: string
  messageIndex: number
  partIndex: number
  kind: 'message' | 'thinking' | 'text' | 'tool_call' | 'tool_result' | 'artifact' | 'deploy'
  label: string
  detail: string
  status: 'done' | 'pending' | 'error'
}

export interface AgentRunArtifactDebugItem {
  id: string
  messageId: string
  messageIndex: number
  partIndex: number
  kind: 'artifact_ref' | 'deploy_status' | 'deploy_candidate'
  artifactId: string
  title: string | null
  version: number | null
  status: string | null
  previewPath: string | null
  detail: string
  isError: boolean
}

const AGENTHUB_TOOL_NAMES = new Set([
  'read_artifact',
  'write_artifact',
  'deploy_artifact',
  'deploy_workspace',
  'read_attachment',
  'plan_tasks',
  'ask_user',
  'report_task_result',
])

export function projectAgentRunRelations(detail: AgentRunDebugDetail): AgentRunRelationsSummary {
  return {
    current: toRelationItem(detail.agentRun),
    parent: detail.parentRun ? toRelationItem(detail.parentRun) : null,
    children: detail.childrenRuns.map(toRelationItem),
    triggerMessage: detail.triggerMessage ? summarizeMessageRecord(detail.triggerMessage) : null,
    outputMessages: detail.outputMessages.map(summarizeMessageRecord),
  }
}

export function summarizeMessageRecord(message: MessageRecord): AgentRunMessageSummary {
  let textChars = 0
  let thinkingChars = 0
  let toolUseCount = 0
  let toolResultCount = 0
  let artifactRefCount = 0
  let deployPartCount = 0
  const previewParts: string[] = []

  for (const part of message.parts) {
    if (part.type === 'text' || part.type === 'code') {
      textChars += part.content.length
      if (previewParts.length < 2) previewParts.push(part.content)
      continue
    }
    if (part.type === 'thinking') {
      thinkingChars += part.content.length
      continue
    }
    if (part.type === 'tool_use') {
      toolUseCount++
      continue
    }
    if (part.type === 'tool_result') {
      toolResultCount++
      continue
    }
    if (part.type === 'artifact_ref') {
      artifactRefCount++
      continue
    }
    if (part.type === 'deploy_status' || part.type === 'deploy_candidates') {
      deployPartCount++
    }
  }

  return {
    messageId: message.id,
    role: message.role,
    status: message.status,
    agentId: message.agentId,
    runId: message.runId,
    createdAt: message.createdAt,
    partCount: message.parts.length,
    textChars,
    thinkingChars,
    toolUseCount,
    toolResultCount,
    artifactRefCount,
    deployPartCount,
    preview: previewParts.length > 0 ? truncate(previewParts.join('\n'), 160) : '-',
  }
}

export function projectAgentRunToolTrace(detail: AgentRunDebugDetail): AgentRunToolTraceItem[] {
  const byCallId = new Map<string, AgentRunToolTraceItem>()

  detail.outputMessages.forEach((message, messageIndex) => {
    message.parts.forEach((part, partIndex) => {
      if (part.type === 'tool_use') {
        const existing = byCallId.get(part.callId)
        byCallId.set(part.callId, {
          callId: part.callId,
          toolName: part.toolName,
          messageId: message.id,
          messageIndex,
          partIndex,
          args: part.args,
          result: existing?.result ?? null,
          isError: existing?.isError ?? false,
          completed: existing?.completed ?? false,
        })
        return
      }

      if (part.type === 'tool_result') {
        const existing = byCallId.get(part.callId)
        if (existing) {
          existing.result = part.result
          existing.isError = part.isError
          existing.completed = true
          return
        }

        byCallId.set(part.callId, {
          callId: part.callId,
          toolName: 'unknown_tool',
          messageId: message.id,
          messageIndex,
          partIndex,
          args: null,
          result: part.result,
          isError: part.isError,
          completed: true,
        })
      }
    })
  })

  return [...byCallId.values()].sort(
    (a, b) => a.messageIndex - b.messageIndex || a.partIndex - b.partIndex,
  )
}

export function projectAgentRunArtifacts(detail: AgentRunDebugDetail): AgentRunArtifactDebugItem[] {
  const artifacts: AgentRunArtifactDebugItem[] = []

  detail.outputMessages.forEach((message, messageIndex) => {
    message.parts.forEach((part, partIndex) => {
      if (part.type === 'artifact_ref') {
        artifacts.push({
          id: `${message.id}:${partIndex}:artifact_ref`,
          messageId: message.id,
          messageIndex,
          partIndex,
          kind: 'artifact_ref',
          artifactId: part.artifactId,
          title: null,
          version: null,
          status: null,
          previewPath: null,
          detail: part.artifactId,
          isError: false,
        })
        return
      }
      if (part.type === 'deploy_status') {
        artifacts.push({
          id: `${message.id}:${partIndex}:deploy_status`,
          messageId: message.id,
          messageIndex,
          partIndex,
          kind: 'deploy_status',
          artifactId: part.deployment.artifactId,
          title: part.deployment.title,
          version: part.deployment.version,
          status: part.deployment.status,
          previewPath: part.deployment.previewPath,
          detail: part.deployment.error ?? part.deployment.publicUrl ?? part.deployment.previewPath,
          isError: part.deployment.status === 'failed',
        })
        return
      }
      if (part.type === 'deploy_candidates') {
        part.candidates.forEach((candidate, candidateIndex) => {
          artifacts.push({
            id: `${message.id}:${partIndex}:deploy_candidate:${candidateIndex}`,
            messageId: message.id,
            messageIndex,
            partIndex,
            kind: 'deploy_candidate',
            artifactId: candidate.artifactId,
            title: candidate.title,
            version: candidate.version,
            status: null,
            previewPath: null,
            detail: `candidate by ${candidate.createdByAgentId}`,
            isError: false,
          })
        })
      }
    })
  })

  return artifacts
}

export function projectAgentRunTimeline(detail: AgentRunDebugDetail): AgentRunTimelineItem[] {
  const traceByCallId = new Map(projectAgentRunToolTrace(detail).map((item) => [item.callId, item]))
  const items: AgentRunTimelineItem[] = []

  detail.outputMessages.forEach((message, messageIndex) => {
    items.push({
      id: `${message.id}:message`,
      messageId: message.id,
      messageIndex,
      partIndex: -1,
      kind: 'message',
      label: `${message.role} message`,
      detail: `${message.parts.length} parts · ${message.status}`,
      status: message.status === 'error' ? 'error' : message.status === 'streaming' ? 'pending' : 'done',
    })

    message.parts.forEach((part, partIndex) => {
      if (part.type === 'thinking') {
        items.push(buildTimelineItem(message.id, messageIndex, partIndex, 'thinking', 'thinking', `${part.content.length} chars`, 'done'))
        return
      }
      if (part.type === 'text' || part.type === 'code') {
        items.push(buildTimelineItem(message.id, messageIndex, partIndex, 'text', part.type, truncate(part.content, 120), 'done'))
        return
      }
      if (part.type === 'tool_use') {
        const trace = traceByCallId.get(part.callId)
        items.push(buildTimelineItem(
          message.id,
          messageIndex,
          partIndex,
          'tool_call',
          part.toolName,
          summarizeAgentRunToolTraceArgs(trace ?? {
            callId: part.callId,
            toolName: part.toolName,
            messageId: message.id,
            messageIndex,
            partIndex,
            args: part.args,
            result: null,
            isError: false,
            completed: false,
          }),
          trace?.isError ? 'error' : trace?.completed ? 'done' : 'pending',
        ))
        return
      }
      if (part.type === 'tool_result') {
        const trace = traceByCallId.get(part.callId)
        items.push(buildTimelineItem(
          message.id,
          messageIndex,
          partIndex,
          'tool_result',
          `result ${shortTraceId(part.callId)}`,
          trace ? summarizeAgentRunToolTraceResult(trace) : summarizeUnknown(part.result),
          part.isError ? 'error' : 'done',
        ))
        return
      }
      if (part.type === 'artifact_ref') {
        items.push(buildTimelineItem(message.id, messageIndex, partIndex, 'artifact', 'artifact_ref', part.artifactId, 'done'))
        return
      }
      if (part.type === 'deploy_status') {
        items.push(buildTimelineItem(message.id, messageIndex, partIndex, 'deploy', 'deploy_status', `${part.deployment.status}:${part.deployment.previewPath}`, part.deployment.status === 'failed' ? 'error' : 'done'))
        return
      }
      if (part.type === 'deploy_candidates') {
        items.push(buildTimelineItem(message.id, messageIndex, partIndex, 'deploy', 'deploy_candidates', `${part.candidates.length} candidates`, 'done'))
      }
    })
  })

  return items
}

export function projectAgentRunPlanTasks(items: readonly AgentRunToolTraceItem[]): DispatchPlanItem[] {
  for (const item of items) {
    const args = unwrapAgentHubMcpArguments(item.args)
    if (!isPlanTasksToolName(item.toolName) || !isRecord(args) || !Array.isArray(args.tasks)) continue
    return args.tasks.map((task, index) => normalizePlanTask(task, index)).filter((task): task is DispatchPlanItem => task !== null)
  }
  return []
}

export function projectAgentRunPlanDag(tasks: readonly DispatchPlanItem[]): AgentRunPlanDagProjection {
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const dependentsById = new Map<string, string[]>()
  const validDependsById = new Map<string, string[]>()
  const missingDependsById = new Map<string, string[]>()
  const edges: AgentRunPlanDagEdge[] = []

  for (const task of tasks) {
    dependentsById.set(task.id, [])
  }

  for (const task of tasks) {
    const dependsOn = task.dependsOn ?? []
    const validDepends: string[] = []
    const missingDepends: string[] = []
    for (const depId of dependsOn) {
      if (!taskById.has(depId)) {
        missingDepends.push(depId)
        continue
      }
      validDepends.push(depId)
      edges.push({ from: depId, to: task.id })
      dependentsById.get(depId)?.push(task.id)
    }
    validDependsById.set(task.id, validDepends)
    missingDependsById.set(task.id, missingDepends)
  }

  const layersById = new Map<string, number>()
  const visiting = new Set<string>()
  const cyclicIds = new Set<string>()

  const resolveLayer = (taskId: string): number => {
    const cached = layersById.get(taskId)
    if (cached !== undefined) return cached
    if (visiting.has(taskId)) {
      for (const id of visiting) cyclicIds.add(id)
      cyclicIds.add(taskId)
      layersById.set(taskId, 0)
      return 0
    }
    visiting.add(taskId)
    const dependsOn = validDependsById.get(taskId) ?? []
    const layer = dependsOn.length === 0
      ? 0
      : Math.max(...dependsOn.map((depId) => resolveLayer(depId))) + 1
    visiting.delete(taskId)
    layersById.set(taskId, layer)
    return layer
  }

  for (const task of tasks) resolveLayer(task.id)

  const nodes = tasks.map((task) => {
    const dependsOn = validDependsById.get(task.id) ?? []
    const missingDependsOn = missingDependsById.get(task.id) ?? []
    const dependents = dependentsById.get(task.id) ?? []
    return {
      id: task.id,
      agentId: task.agentId,
      task: task.task,
      taskKind: task.taskKind ?? null,
      dependsOn,
      missingDependsOn,
      dependents,
      layer: layersById.get(task.id) ?? 0,
      isRoot: dependsOn.length === 0,
      isLeaf: dependents.length === 0,
      hasCycle: cyclicIds.has(task.id),
      dispatch: task,
    }
  }).sort(comparePlanDagNodes)

  const maxLayer = Math.max(-1, ...nodes.map((node) => node.layer))
  const layers = Array.from({ length: maxLayer + 1 }, (_, layer) => (
    nodes.filter((node) => node.layer === layer).map((node) => node.id)
  ))

  return {
    nodes,
    edges,
    layers,
    missingDependencyCount: [...missingDependsById.values()].reduce((total, ids) => total + ids.length, 0),
    hasCycle: cyclicIds.size > 0,
  }
}

export function projectAgentRunAgentTaskChains(
  tasks: readonly DispatchPlanItem[],
  taskResults: readonly AgentRunTaskResultTrace[],
  operations: AgentRunDebugOperationSummary,
): AgentRunAgentTaskChain[] {
  const agentIds = new Set<string>()
  tasks.forEach((task) => agentIds.add(task.agentId))
  operations.commands.forEach((command) => {
    const agentId = readAgentIdFromCommand(command.command)
    if (agentId) agentIds.add(agentId)
  })

  return [...agentIds].sort().map((agentId) => ({
    agentId,
    tasks: tasks.filter((task) => task.agentId === agentId),
    taskResults: taskResults.filter((result) => result.summary.includes(agentId)),
    commands: operations.commands.filter((command) => readAgentIdFromCommand(command.command) === agentId),
  }))
}

export function projectAgentRunAskUserInteractions(items: readonly AgentRunToolTraceItem[]): AgentRunAskUserInteraction[] {
  return items.flatMap((item) => {
    const args = unwrapAgentHubMcpArguments(item.args)
    if (!isAskUserToolName(item.toolName) || !isRecord(args) || !Array.isArray(args.questions)) return []
    const answers = readAskUserAnswers(item.result)
    const questions = args.questions.flatMap((question) => {
      if (!isRecord(question)) return []
      const text = stringProp(question, 'question')
      if (!text) return []
      return [{
        question: text,
        header: stringProp(question, 'header'),
        multiSelect: booleanProp(question, 'multiSelect') ?? false,
        options: readAskUserOptions(question),
        answer: answers?.[text] ?? null,
      }]
    })
    if (questions.length === 0) return []
    return [{
      callId: item.callId,
      messageId: item.messageId,
      questionCount: questions.length,
      questions,
      answered: questions.some((question) => question.answer !== null),
      isError: item.isError,
    }]
  })
}

export function projectAgentRunTaskResults(items: readonly AgentRunToolTraceItem[]): AgentRunTaskResultTrace[] {
  return items.flatMap((item) => {
    if (!isReportTaskResultToolName(item.toolName)) return []
    const report = readTaskResultReport(item.result) ?? readTaskResultReport(unwrapAgentHubMcpArguments(item.args))
    if (!report) return []
    return [{
      callId: item.callId,
      messageId: item.messageId,
      status: report.status,
      summary: report.summary,
      acceptanceResults: report.acceptanceResults,
      filesChanged: report.filesChanged,
      commandsRun: report.commandsRun,
      tests: report.tests,
      blockers: report.blockers,
    }]
  })
}

export function projectAgentRunOperations(items: readonly AgentRunToolTraceItem[]): AgentRunDebugOperationSummary {
  const files: AgentRunDebugFileOperation[] = []
  const commands: AgentRunDebugCommandOperation[] = []
  const network: AgentRunDebugNetworkOperation[] = []

  for (const item of items) {
    const kind = getAgentRunToolTraceKind(item.toolName)
    if (kind === 'command') {
      const command = stringProp(item.args, 'command') ?? stringProp(item.result, 'command')
      if (command) {
        commands.push({
          callId: item.callId,
          toolName: item.toolName,
          command,
          exitCode: numberProp(item.result, 'exitCode'),
          status: stringProp(item.result, 'status'),
          isError: item.isError,
        })
      }
    }

    if (kind === 'web_search') {
      const target = stringProp(item.args, 'url') ?? stringProp(item.args, 'query')
      if (target) {
        network.push({
          callId: item.callId,
          toolName: item.toolName,
          target,
          kind: stringProp(item.args, 'url') ? 'fetch' : 'search',
          status: stringProp(item.result, 'status'),
          isError: item.isError,
        })
      }
    }

    if (item.toolName === 'fs_read' || item.toolName === 'fs_write' || item.toolName === 'fs_list') {
      const path = stringProp(item.args, 'path')
      if (path) {
        files.push({
          callId: item.callId,
          toolName: item.toolName,
          kind: item.toolName === 'fs_read' ? 'read' : item.toolName === 'fs_list' ? 'list' : 'write',
          path,
          isError: item.isError,
        })
      }
    }

    if (item.toolName === 'codex_file_change') {
      for (const fileChange of readFileChanges(item.result) ?? readFileChanges(item.args) ?? []) {
        files.push({
          callId: item.callId,
          toolName: item.toolName,
          kind: 'change',
          path: fileChange.path,
          detail: fileChange.kind,
          isError: item.isError,
        })
      }
    }
  }

  return { files, commands, network }
}

export function getAgentRunToolTraceKind(toolName: string): AgentRunToolTraceKind {
  if (toolName === 'codex_command' || toolName === 'bash' || toolName === 'Bash') return 'command'
  if (
    toolName === 'codex_file_change' ||
    toolName === 'fs_write' ||
    toolName === 'fs_read' ||
    toolName === 'fs_list'
  ) {
    return 'file_change'
  }
  if (toolName.startsWith('codex_mcp_') || toolName.startsWith('mcp_')) return 'mcp'
  if (toolName === 'codex_web_search' || toolName === 'web_fetch') return 'web_search'
  if (AGENTHUB_TOOL_NAMES.has(toolName)) return 'agenthub'
  return 'other'
}

export function summarizeAgentRunToolTraceArgs(item: AgentRunToolTraceItem): string {
  const kind = getAgentRunToolTraceKind(item.toolName)
  if (kind === 'command') return stringProp(item.args, 'command') ?? summarizeUnknown(item.args)
  if (kind === 'web_search') {
    return stringProp(item.args, 'url') ?? stringProp(item.args, 'query') ?? summarizeUnknown(item.args)
  }
  if (kind === 'mcp') return summarizeMcpArgs(item.args)
  if (kind === 'file_change') return summarizeFileChanges(item.args)
  return summarizeUnknown(item.args)
}

export function summarizeAgentRunToolTraceResult(item: AgentRunToolTraceItem): string {
  if (!item.completed) return '-'
  const status = stringProp(item.result, 'status')
  const exitCode = numberProp(item.result, 'exitCode')
  const error = stringProp(item.result, 'error')
  const output = stringProp(item.result, 'output')
  const result = prop(item.result, 'result')
  const parts: string[] = []

  if (status) parts.push(`status=${status}`)
  if (exitCode !== null) parts.push(`exitCode=${exitCode}`)
  if (error) parts.push(`error=${truncate(error)}`)
  if (output) parts.push(`output=${truncate(output)}`)
  if (result !== undefined) parts.push(`result=${summarizeUnknown(result)}`)

  return parts.length > 0 ? parts.join(' · ') : summarizeUnknown(item.result)
}

export function summarizeUnknown(value: unknown, maxLength = 240): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'string') return truncate(value, maxLength)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return truncate(JSON.stringify(value), maxLength)
  } catch {
    return '[unserializable]'
  }
}

function comparePlanDagNodes(a: AgentRunPlanDagNode, b: AgentRunPlanDagNode): number {
  return a.layer - b.layer || a.dependsOn.length - b.dependsOn.length || a.agentId.localeCompare(b.agentId) || a.id.localeCompare(b.id)
}

function readAgentIdFromCommand(command: string): string | null {
  const match = command.match(/(?:--agent(?:Id|-id)?\s+|agent[_-]id=)([\w.-]+)/i)
  return match?.[1] ?? null
}

function buildTimelineItem(
  messageId: string,
  messageIndex: number,
  partIndex: number,
  kind: AgentRunTimelineItem['kind'],
  label: string,
  detail: string,
  status: AgentRunTimelineItem['status'],
): AgentRunTimelineItem {
  return {
    id: `${messageId}:${partIndex}:${kind}`,
    messageId,
    messageIndex,
    partIndex,
    kind,
    label,
    detail,
    status,
  }
}

function shortTraceId(id: string): string {
  return id.length > 10 ? id.slice(0, 10) : id
}

function toRelationItem(run: AgentRunDebugListItem): AgentRunRelationItem {
  return {
    id: run.id,
    agentId: run.agentId,
    agentName: run.agentName,
    adapterName: run.adapterName,
    modelId: run.modelId,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  }
}

function isPlanTasksToolName(toolName: string): boolean {
  return toolName === 'plan_tasks' || toolName.endsWith('__plan_tasks') || toolName.endsWith('_plan_tasks')
}

function isAskUserToolName(toolName: string): boolean {
  return toolName === 'ask_user' || toolName.endsWith('__ask_user') || toolName.endsWith('_ask_user')
}

function isReportTaskResultToolName(toolName: string): boolean {
  return toolName === 'report_task_result' || toolName.endsWith('__report_task_result') || toolName.endsWith('_report_task_result')
}

function unwrapAgentHubMcpArguments(value: unknown): unknown {
  if (!isRecord(value)) return value
  const args = value.arguments
  return args === undefined ? value : args
}

function readAskUserAnswers(value: unknown): Record<string, string> | null {
  const candidate = readNestedProp(value, ['answers']) ?? readNestedProp(value, ['value', 'answers']) ?? readNestedProp(value, ['result', 'answers'])
  if (!isRecord(candidate)) return null
  const answers: Record<string, string> = {}
  for (const [key, answer] of Object.entries(candidate)) {
    if (typeof answer === 'string') answers[key] = answer
  }
  return answers
}

function readAskUserOptions(value: Record<string, unknown>): string[] {
  const options = arrayProp(value, 'options') ?? []
  return options.flatMap((option) => {
    if (!isRecord(option)) return []
    const label = stringProp(option, 'label')
    return label ? [label] : []
  })
}

function readTaskResultReport(value: unknown): TaskResultReport | null {
  const direct = normalizeTaskResultReportCandidate(value)
  if (direct) return direct
  if (typeof value === 'string') {
    try {
      return readTaskResultReport(JSON.parse(value))
    } catch {
      return null
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readTaskResultReport(item)
      if (parsed) return parsed
    }
    return null
  }
  if (!isRecord(value)) return null
  if (typeof value.text === 'string') {
    const parsed = readTaskResultReport(value.text)
    if (parsed) return parsed
  }
  for (const key of ['structuredContent', 'structured_content', 'result', 'value', 'content']) {
    const parsed = readTaskResultReport(value[key])
    if (parsed) return parsed
  }
  return null
}

function normalizeTaskResultReportCandidate(value: unknown): TaskResultReport | null {
  if (!isRecord(value)) return null
  const status = stringProp(value, 'status')
  const summary = stringProp(value, 'summary')
  const acceptanceResults = arrayProp(value, 'acceptanceResults') as TaskResultReport['acceptanceResults'] | null
  const filesChanged = arrayProp(value, 'filesChanged') as TaskResultReport['filesChanged'] | null
  const commandsRun = arrayProp(value, 'commandsRun') as TaskResultReport['commandsRun'] | null
  const tests = arrayProp(value, 'tests') as TaskResultReport['tests'] | null
  const blockers = stringArrayProp(value, 'blockers')
  if (status !== 'complete' && status !== 'failed' && status !== 'blocked') return null
  if (!summary) return null
  return {
    status,
    summary,
    ...(acceptanceResults ? { acceptanceResults } : {}),
    ...(filesChanged ? { filesChanged } : {}),
    ...(commandsRun ? { commandsRun } : {}),
    ...(tests ? { tests } : {}),
    ...(blockers ? { blockers } : {}),
  }
}

function normalizePlanTask(value: unknown, index: number): DispatchPlanItem | null {
  if (!isRecord(value)) return null
  const id = stringProp(value, 'id') ?? `task_${index + 1}`
  const agentId = stringProp(value, 'agentId') ?? '-'
  const task = stringProp(value, 'task') ?? ''
  const taskKind = stringProp(value, 'taskKind') as DispatchPlanItem['taskKind'] | null
  const dependsOn = stringArrayProp(value, 'dependsOn')
  const expectedOutputs = arrayProp(value, 'expectedOutputs') as DispatchPlanItem['expectedOutputs'] | null
  const inputs = arrayProp(value, 'inputs') as DispatchPlanItem['inputs'] | null
  const acceptanceCriteria = stringArrayProp(value, 'acceptanceCriteria')
  const targetPaths = stringArrayProp(value, 'targetPaths')
  const expectedWorkspaceChanges = stringArrayProp(value, 'expectedWorkspaceChanges')
  const requiredCommands = arrayProp(value, 'requiredCommands') as DispatchPlanItem['requiredCommands'] | null
  const requiredEvidence = stringArrayProp(value, 'requiredEvidence')
  if (!task) return null
  return {
    id,
    agentId,
    task,
    ...(taskKind ? { taskKind } : {}),
    ...(dependsOn ? { dependsOn } : {}),
    ...(expectedOutputs ? { expectedOutputs } : {}),
    ...(inputs ? { inputs } : {}),
    ...(acceptanceCriteria ? { acceptanceCriteria } : {}),
    ...(targetPaths ? { targetPaths } : {}),
    ...(expectedWorkspaceChanges ? { expectedWorkspaceChanges } : {}),
    ...(requiredCommands ? { requiredCommands } : {}),
    ...(requiredEvidence ? { requiredEvidence } : {}),
  }
}

function summarizeMcpArgs(value: unknown): string {
  const server = stringProp(value, 'server')
  const tool = stringProp(value, 'tool')
  const args = prop(value, 'arguments')
  const label = [server, tool].filter(Boolean).join(' / ')
  const argsSummary = args === undefined ? '' : ` args=${summarizeUnknown(args)}`
  return label ? `${label}${argsSummary}` : summarizeUnknown(value)
}

function summarizeFileChanges(value: unknown): string {
  const changes = readFileChanges(value)
  if (!changes) return summarizeUnknown(value)
  const shown = changes.slice(0, 5).map((change) => `${change.kind}:${change.path}`).join(', ')
  const suffix = changes.length > 5 ? `, +${changes.length - 5}` : ''
  return `${changes.length} changes${shown ? `: ${shown}${suffix}` : ''}`
}

function readFileChanges(value: unknown): Array<{ path: string; kind: string }> | null {
  const changes = arrayProp(value, 'changes')
  if (!changes) return null
  return changes.flatMap((change) => {
    const path = stringProp(change, 'path')
    if (!path) return []
    return [{ path, kind: stringProp(change, 'kind') ?? 'change' }]
  })
}

function truncate(value: string, maxLength = 240): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}

function stringProp(value: unknown, key: string): string | null {
  const found = prop(value, key)
  return typeof found === 'string' && found.length > 0 ? found : null
}

function numberProp(value: unknown, key: string): number | null {
  const found = prop(value, key)
  return typeof found === 'number' && Number.isFinite(found) ? found : null
}

function stringArrayProp(value: unknown, key: string): string[] | null {
  const found = arrayProp(value, key)
  if (!found) return null
  const strings = found.filter((item): item is string => typeof item === 'string')
  return strings.length === found.length ? strings : null
}

function arrayProp(value: unknown, key: string): unknown[] | null {
  const found = prop(value, key)
  return Array.isArray(found) ? found : null
}

function booleanProp(value: unknown, key: string): boolean | null {
  const found = prop(value, key)
  return typeof found === 'boolean' ? found : null
}

function readNestedProp(value: unknown, keys: string[]): unknown {
  let current = value
  for (const key of keys) {
    current = prop(current, key)
  }
  return current
}

function prop(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined
  return value[key]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
