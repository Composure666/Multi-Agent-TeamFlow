import type {
  DispatchExpectedOutputType,
  DispatchExpectedOutput,
  DispatchPlanItem,
  DispatchTaskKind,
  StreamEvent,
  WritableArtifactType,
} from '@/shared/types'

/**
 * Orchestrator 派发计划的解析 + 校验 + 环检测。
 *
 * 从 agent-runner 抽出为纯模块（只 type-only 依赖，不牵入 DB / native），便于单测。
 * agent-runner 反向 import `parseDispatchPlanToolArgs` / `validateDispatchPlan`；
 * 真正的执行调度（executeDag，有副作用）仍留在 agent-runner。
 */

export interface CompileDispatchPlanResult {
  plan: DispatchPlanItem[]
  inferredDependencies: Array<{
    taskId: string
    dependsOn: string[]
    reason: string
  }>
}

export type DispatchPlanCompileValidationResult =
  | { ok: true; plan: DispatchPlanItem[] }
  | { ok: false; error: string }

type ArtifactTopic = 'prd' | 'ui_design' | 'frontend'

const WRITABLE_ARTIFACT_TYPES = new Set<WritableArtifactType>([
  'web_app',
  'document',
  'image',
  'ppt',
  'diagram',
])
const EXPECTED_OUTPUT_TYPES = new Set<DispatchExpectedOutputType>([
  ...WRITABLE_ARTIFACT_TYPES,
  'project',
])
const DISPATCH_TASK_KINDS = new Set<DispatchTaskKind>([
  'code',
  'test',
  'review',
  'design',
  'doc',
  'analysis',
])

export const CODE_TASK_PROJECT_OUTPUT_ID = 'project'
export const CODE_TASK_PROJECT_OUTPUT_DESCRIPTION =
  'Workspace project files written by this code task'
export const CODE_TASK_RUNNABLE_ACCEPTANCE_CRITERION =
  '项目构建/编译验证通过（至少一条非准备验证命令 exitCode=0）'
export const CODE_TASK_RUNNABLE_REQUIRED_EVIDENCE =
  '至少一条构建/编译/测试/类型检查命令 exitCode=0'
export const PLAN_TASKS_TOOL_NAME = 'plan_tasks'

type ToolCallEvent = Extract<StreamEvent, { type: 'tool.call' }>

export function extractPlanTasksToolArgs(event: Pick<ToolCallEvent, 'toolName' | 'args'>): unknown | null {
  if (event.toolName === PLAN_TASKS_TOOL_NAME) return event.args
  if (event.toolName === `mcp__agenthub__${PLAN_TASKS_TOOL_NAME}`) return event.args
  if (event.toolName === `codex_mcp_agenthub_${PLAN_TASKS_TOOL_NAME}`) {
    return readCodexMcpToolArguments(event.args)
  }
  if (
    event.toolName.endsWith(`__${PLAN_TASKS_TOOL_NAME}`) ||
    event.toolName.endsWith(`_${PLAN_TASKS_TOOL_NAME}`)
  ) {
    return event.args
  }
  return null
}

export function parseDispatchPlanToolArgs(args: unknown): DispatchPlanItem[] {
  if (!isRecord(args) || !Array.isArray(args.tasks)) {
    throw new Error('Invalid dispatch plan: plan_tasks args must include a tasks array')
  }

  return args.tasks.map((raw, index) => {
    if (!isRecord(raw)) {
      throw new Error(`Invalid dispatch plan: task at index ${index} must be an object`)
    }
    const id = readNonEmptyString(raw.id, `task at index ${index} id`)
    const agentId = readNonEmptyString(raw.agentId, `task "${id}" agentId`)
    const task = readNonEmptyString(raw.task, `task "${id}" instruction`)
    const taskKind = readOptionalTaskKind(raw.taskKind, `task "${id}" taskKind`)

    let dependsOn: string[] | undefined
    if (raw.dependsOn !== undefined) {
      if (!Array.isArray(raw.dependsOn)) {
        throw new Error(`Invalid dispatch plan: task "${id}" dependsOn must be an array`)
      }
      dependsOn = raw.dependsOn.map((dep, depIndex) =>
        readNonEmptyString(dep, `task "${id}" dependsOn[${depIndex}]`),
      )
    }

    let expectedOutputs: DispatchPlanItem['expectedOutputs']
    if (raw.expectedOutputs !== undefined) {
      if (!Array.isArray(raw.expectedOutputs)) {
        throw new Error(`Invalid dispatch plan: task "${id}" expectedOutputs must be an array`)
      }
      expectedOutputs = raw.expectedOutputs.map((output, outputIndex) => {
        if (!isRecord(output)) {
          throw new Error(
            `Invalid dispatch plan: task "${id}" expectedOutputs[${outputIndex}] must be an object`,
          )
        }
        const outputId = readNonEmptyString(
          output.id,
          `task "${id}" expectedOutputs[${outputIndex}].id`,
        )
        const type = readExpectedOutputType(
          output.type,
          `task "${id}" expectedOutputs[${outputIndex}].type`,
        )
        const required = readOptionalBoolean(
          output.required,
          `task "${id}" expectedOutputs[${outputIndex}].required`,
        )
        const description = readOptionalString(
          output.description,
          `task "${id}" expectedOutputs[${outputIndex}].description`,
        )
        return {
          id: outputId,
          type,
          ...(required === undefined ? {} : { required }),
          ...(description === undefined ? {} : { description }),
        }
      })
    }

    let inputs: DispatchPlanItem['inputs']
    if (raw.inputs !== undefined) {
      if (!Array.isArray(raw.inputs)) {
        throw new Error(`Invalid dispatch plan: task "${id}" inputs must be an array`)
      }
      inputs = raw.inputs.map((input, inputIndex) => {
        if (!isRecord(input)) {
          throw new Error(
            `Invalid dispatch plan: task "${id}" inputs[${inputIndex}] must be an object`,
          )
        }
        const fromTaskId = readNonEmptyString(
          input.fromTaskId,
          `task "${id}" inputs[${inputIndex}].fromTaskId`,
        )
        const outputId = readNonEmptyString(
          input.outputId,
          `task "${id}" inputs[${inputIndex}].outputId`,
        )
        const required = readOptionalBoolean(
          input.required,
          `task "${id}" inputs[${inputIndex}].required`,
        )
        const description = readOptionalString(
          input.description,
          `task "${id}" inputs[${inputIndex}].description`,
        )
        return {
          fromTaskId,
          outputId,
          ...(required === undefined ? {} : { required }),
          ...(description === undefined ? {} : { description }),
        }
      })
    }

    let acceptanceCriteria: string[] | undefined
    if (raw.acceptanceCriteria !== undefined) {
      if (!Array.isArray(raw.acceptanceCriteria)) {
        throw new Error(`Invalid dispatch plan: task "${id}" acceptanceCriteria must be an array`)
      }
      acceptanceCriteria = raw.acceptanceCriteria.map((criterion, criterionIndex) =>
        readNonEmptyString(criterion, `task "${id}" acceptanceCriteria[${criterionIndex}]`),
      )
    }

    let targetPaths: string[] | undefined
    if (raw.targetPaths !== undefined) {
      if (!Array.isArray(raw.targetPaths)) {
        throw new Error(`Invalid dispatch plan: task "${id}" targetPaths must be an array`)
      }
      targetPaths = raw.targetPaths.map((targetPath, targetPathIndex) =>
        readNonEmptyString(targetPath, `task "${id}" targetPaths[${targetPathIndex}]`),
      )
    }

    let expectedWorkspaceChanges: string[] | undefined
    if (raw.expectedWorkspaceChanges !== undefined) {
      if (!Array.isArray(raw.expectedWorkspaceChanges)) {
        throw new Error(
          `Invalid dispatch plan: task "${id}" expectedWorkspaceChanges must be an array`,
        )
      }
      expectedWorkspaceChanges = raw.expectedWorkspaceChanges.map((change, changeIndex) =>
        readNonEmptyString(change, `task "${id}" expectedWorkspaceChanges[${changeIndex}]`),
      )
    }

    let requiredCommands: DispatchPlanItem['requiredCommands']
    if (raw.requiredCommands !== undefined) {
      if (!Array.isArray(raw.requiredCommands)) {
        throw new Error(`Invalid dispatch plan: task "${id}" requiredCommands must be an array`)
      }
      requiredCommands = raw.requiredCommands.map((command, commandIndex) => {
        if (!isRecord(command)) {
          throw new Error(
            `Invalid dispatch plan: task "${id}" requiredCommands[${commandIndex}] must be an object`,
          )
        }
        const description = readOptionalString(
          command.description,
          `task "${id}" requiredCommands[${commandIndex}].description`,
        )
        const cwd = readOptionalString(
          command.cwd,
          `task "${id}" requiredCommands[${commandIndex}].cwd`,
        )
        const timeoutMs = readOptionalPositiveInteger(
          command.timeoutMs,
          `task "${id}" requiredCommands[${commandIndex}].timeoutMs`,
        )
        return {
          command: readNonEmptyString(
            command.command,
            `task "${id}" requiredCommands[${commandIndex}].command`,
          ),
          ...(description === undefined ? {} : { description }),
          ...(cwd === undefined ? {} : { cwd }),
          ...(timeoutMs === undefined ? {} : { timeoutMs }),
        }
      })
    }

    let requiredEvidence: string[] | undefined
    if (raw.requiredEvidence !== undefined) {
      if (!Array.isArray(raw.requiredEvidence)) {
        throw new Error(`Invalid dispatch plan: task "${id}" requiredEvidence must be an array`)
      }
      requiredEvidence = raw.requiredEvidence.map((evidence, evidenceIndex) =>
        readNonEmptyString(evidence, `task "${id}" requiredEvidence[${evidenceIndex}]`),
      )
    }

    const item: DispatchPlanItem = { id, agentId, task }
    if (taskKind) item.taskKind = taskKind
    if (dependsOn && dependsOn.length > 0) item.dependsOn = dependsOn
    if (expectedOutputs && expectedOutputs.length > 0) item.expectedOutputs = expectedOutputs
    if (inputs && inputs.length > 0) item.inputs = inputs
    if (acceptanceCriteria && acceptanceCriteria.length > 0) {
      item.acceptanceCriteria = acceptanceCriteria
    }
    if (targetPaths && targetPaths.length > 0) item.targetPaths = targetPaths
    if (expectedWorkspaceChanges && expectedWorkspaceChanges.length > 0) {
      item.expectedWorkspaceChanges = expectedWorkspaceChanges
    }
    if (requiredCommands && requiredCommands.length > 0) item.requiredCommands = requiredCommands
    if (requiredEvidence && requiredEvidence.length > 0) item.requiredEvidence = requiredEvidence
    return item
  })
}

function readCodexMcpToolArguments(args: unknown): unknown {
  if (!isRecord(args) || args.tool !== PLAN_TASKS_TOOL_NAME) return args
  const rawArguments = args.arguments
  if (typeof rawArguments !== 'string') return rawArguments
  try {
    return JSON.parse(rawArguments) as unknown
  } catch {
    return rawArguments
  }
}

export function validateDispatchPlan(
  plan: DispatchPlanItem[],
  availableAgents: readonly { id: string }[],
  orchestratorAgentId: string,
  resolvedExternalTasks: readonly DispatchPlanItem[] = [],
): void {
  if (plan.length === 0) {
    throw new Error('Invalid dispatch plan: tasks must not be empty')
  }

  const availableAgentIds = new Set(availableAgents.map((a) => a.id))
  const taskIds = new Set<string>()
  const duplicateTaskIds = new Set<string>()

  for (const task of plan) {
    if (taskIds.has(task.id)) duplicateTaskIds.add(task.id)
    taskIds.add(task.id)
  }
  if (duplicateTaskIds.size > 0) {
    throw new Error(
      `Invalid dispatch plan: duplicate task id(s): ${[...duplicateTaskIds].join(', ')}`,
    )
  }

  const taskById = new Map(plan.map((task) => [task.id, task]))
  const externalTaskById = new Map(resolvedExternalTasks.map((task) => [task.id, task]))

  for (const task of plan) {
    if (task.agentId === orchestratorAgentId) {
      throw new Error(
        `Invalid dispatch plan: task "${task.id}" dispatches to the orchestrator itself, which would recurse`,
      )
    }
    if (!availableAgentIds.has(task.agentId)) {
      throw new Error(
        `Invalid dispatch plan: task "${task.id}" references unavailable agentId "${task.agentId}"`,
      )
    }

    const depIds = new Set<string>()
    for (const dep of task.dependsOn ?? []) {
      if (dep === task.id) {
        throw new Error(`Invalid dispatch plan: task "${task.id}" cannot depend on itself`)
      }
      if (depIds.has(dep)) {
        throw new Error(
          `Invalid dispatch plan: task "${task.id}" lists duplicate dependency "${dep}"`,
        )
      }
      depIds.add(dep)
      if (!taskIds.has(dep) && !externalTaskById.has(dep)) {
        throw new Error(
          `Invalid dispatch plan: task "${task.id}" depends on unknown task "${dep}"`,
        )
      }
    }

    const outputIds = new Set<string>()
    for (const output of task.expectedOutputs ?? []) {
      if (outputIds.has(output.id)) {
        throw new Error(
          `Invalid dispatch plan: task "${task.id}" lists duplicate expected output "${output.id}"`,
        )
      }
      outputIds.add(output.id)
    }

    for (const input of task.inputs ?? []) {
      if (input.fromTaskId === task.id) {
        throw new Error(
          `Invalid dispatch plan: task "${task.id}" input cannot reference itself`,
        )
      }
      const upstream = taskById.get(input.fromTaskId) ?? externalTaskById.get(input.fromTaskId)
      if (!upstream) {
        throw new Error(
          `Invalid dispatch plan: task "${task.id}" input references unknown task "${input.fromTaskId}"`,
        )
      }
      const outputExists = (upstream.expectedOutputs ?? []).some(
        (output) => output.id === input.outputId,
      )
      if (!outputExists) {
        throw new Error(
          `Invalid dispatch plan: task "${task.id}" input references unknown output "${input.outputId}" from task "${input.fromTaskId}"`,
        )
      }
    }
  }

  assertAcyclicDispatchPlan(plan)
}

export function compileDispatchPlan(plan: DispatchPlanItem[]): CompileDispatchPlanResult {
  const inferredDependencies: CompileDispatchPlanResult['inferredDependencies'] = []

  const compiled = plan.map((task, index) => {
    const previousTasks = plan.slice(0, index)
    const inferred = inferDependenciesForTask(task, previousTasks)
    const explicit = task.dependsOn ?? []
    const inputDeps = (task.inputs ?? []).map((input) => input.fromTaskId)
    const dependencySet = new Set(explicit)
    const dependencies = [...explicit]
    const additions = inferred.filter((dep) => !dependencySet.has(dep))
    for (const dep of additions) {
      dependencies.push(dep)
      dependencySet.add(dep)
    }
    for (const dep of inputDeps) {
      if (dependencySet.has(dep)) continue
      dependencies.push(dep)
      dependencySet.add(dep)
    }

    const item: DispatchPlanItem = { ...task }
    if (dependencies.length > 0) {
      item.dependsOn = dependencies
    } else {
      delete item.dependsOn
    }

    if (additions.length > 0) {
      inferredDependencies.push({
        taskId: task.id,
        dependsOn: additions,
        reason: 'task text references earlier task output',
      })
    }

    return normalizeTaskContract(item)
  })

  return { plan: compiled, inferredDependencies }
}

export function tryCompileAndValidateDispatchPlan(
  rawPlan: DispatchPlanItem[],
  availableAgents: readonly { id: string }[],
  orchestratorAgentId: string,
  resolvedExternalTasks: readonly DispatchPlanItem[] = [],
): DispatchPlanCompileValidationResult {
  const { plan } = compileDispatchPlan(rawPlan)
  try {
    validateDispatchPlan(plan, availableAgents, orchestratorAgentId, resolvedExternalTasks)
    return { ok: true, plan }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: buildDispatchPlanCorrectionFeedback(message, plan, resolvedExternalTasks) }
  }
}

function buildDispatchPlanCorrectionFeedback(
  message: string,
  plan: readonly DispatchPlanItem[],
  resolvedExternalTasks: readonly DispatchPlanItem[],
): string {
  const tasks = [...resolvedExternalTasks, ...plan]
  const outputLines = tasks.map((task) => {
    const outputs = (task.expectedOutputs ?? []).map((output) => output.id).join(', ') || '(none)'
    return `Task "${task.id}" declares expectedOutputs: ${outputs}`
  })
  return [
    message,
    ...outputLines,
    'Fix the plan contract: every inputs.outputId must exactly match an upstream expectedOutputs.id. Then call plan_tasks again with the full corrected plan, not only a text explanation.',
  ].join('\n')
}

export function normalizeTaskContract(task: DispatchPlanItem): DispatchPlanItem {
  if (!isCodeImplementationTask(task)) return task

  return {
    ...task,
    expectedOutputs: ensureCodeProjectOutput(task.expectedOutputs ?? []),
    acceptanceCriteria: appendUnique(
      task.acceptanceCriteria ?? [],
      CODE_TASK_RUNNABLE_ACCEPTANCE_CRITERION,
    ),
    requiredEvidence: appendUnique(
      task.requiredEvidence ?? [],
      CODE_TASK_RUNNABLE_REQUIRED_EVIDENCE,
    ),
  }
}

export function isCodeImplementationTask(task: DispatchPlanItem): boolean {
  if (task.taskKind !== undefined) return task.taskKind === 'code'
  if ((task.expectedOutputs ?? []).some((output) => output.type === 'project')) return true
  if (
    ((task.targetPaths ?? []).length > 0 ||
      (task.expectedWorkspaceChanges ?? []).length > 0) &&
    !isReviewTask(task.task)
  ) {
    return true
  }
  return CODE_TASK_PATTERN.test(task.task) && !isReviewTask(task.task)
}

const CODE_TASK_PATTERN =
  /(?:实现|开发|修复|改造|重构|搭建|脚手架|前端|后端|接口|组件|页面|代码|项目|工程|应用|构建|编译|implement|develop|build|scaffold|frontend|backend|api|endpoint|component|page|code|project|app|fix|refactor)/i

function ensureCodeProjectOutput(
  outputs: DispatchExpectedOutput[],
): DispatchExpectedOutput[] {
  let hasProject = false
  const normalized = outputs.map((output) => {
    if (output.type !== 'project') return output
    hasProject = true
    return {
      ...output,
      required: true,
      description: output.description ?? CODE_TASK_PROJECT_OUTPUT_DESCRIPTION,
    }
  })
  if (hasProject) return normalized
  return [
    ...normalized,
    {
      id: nextUniqueOutputId(outputs, CODE_TASK_PROJECT_OUTPUT_ID),
      type: 'project',
      required: true,
      description: CODE_TASK_PROJECT_OUTPUT_DESCRIPTION,
    },
  ]
}

function nextUniqueOutputId(outputs: DispatchExpectedOutput[], preferred: string): string {
  const used = new Set(outputs.map((output) => output.id))
  if (!used.has(preferred)) return preferred
  for (let index = 2; ; index++) {
    const candidate = `${preferred}_${index}`
    if (!used.has(candidate)) return candidate
  }
}

function appendUnique(values: string[], value: string): string[] {
  const normalized = new Set(values.map((item) => item.trim()))
  return normalized.has(value) ? values : [...values, value]
}

export function collectDependencyClosure(plan: DispatchPlanItem[], taskId: string): string[] {
  const byId = new Map(plan.map((task) => [task.id, task]))
  const task = byId.get(taskId)
  if (!task) return []

  const seen = new Set<string>()
  const ordered: string[] = []

  const visit = (depId: string) => {
    if (seen.has(depId)) return
    const dep = byId.get(depId)
    if (!dep) return

    for (const nested of dep.dependsOn ?? []) visit(nested)
    seen.add(depId)
    ordered.push(depId)
  }

  for (const dep of task.dependsOn ?? []) visit(dep)
  return ordered
}

export function taskExpectsArtifact(task: DispatchPlanItem): boolean {
  if ((task.expectedOutputs ?? []).some((output) => output.required !== false)) return true
  const text = task.task
  return (
    getProducedArtifactTopics(text).size > 0 ||
    /(?:输出|产出|写入|生成|创建|保存).{0,40}(?:artifact|artifacts|产物|document|web_app|web app|diagram|mermaid|diff|code_file|markdown|文档|报告|网页|应用|代码|PRD|设计|图)/i.test(text) ||
    /(?:artifact|artifacts|产物|document|web_app|web app|diagram|mermaid|diff|code_file|markdown|文档|报告|网页|应用|代码|PRD|设计|图).{0,40}(?:输出|产出|写入|生成|创建|保存)/i.test(text) ||
    /(?:类型为|type\s*[:=]).{0,24}(?:document|web_app|web app|diagram|diff|code_file|image|markdown)/i.test(text) ||
    /title\s*(?:为|:|=)/i.test(text)
  )
}

export function getRequiredExpectedOutputs(task: DispatchPlanItem): DispatchExpectedOutput[] {
  return (task.expectedOutputs ?? []).filter((output) => output.required !== false)
}

export function assertAcyclicDispatchPlan(plan: DispatchPlanItem[]): void {
  const byId = new Map(plan.map((task) => [task.id, task]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []

  const visit = (taskId: string) => {
    if (visited.has(taskId)) return
    if (visiting.has(taskId)) {
      const cycleStart = stack.indexOf(taskId)
      const cycle = [...stack.slice(cycleStart), taskId]
      throw new Error(`Invalid dispatch plan: circular dependency ${cycle.join(' -> ')}`)
    }

    const task = byId.get(taskId)
    if (!task) return

    visiting.add(taskId)
    stack.push(taskId)
    for (const dep of task.dependsOn ?? []) visit(dep)
    stack.pop()
    visiting.delete(taskId)
    visited.add(taskId)
  }

  for (const task of plan) visit(task.id)
}

function inferDependenciesForTask(
  task: DispatchPlanItem,
  previousTasks: DispatchPlanItem[],
): string[] {
  const inferred = new Set<string>()
  const taskText = task.task

  if (hasDependencySignal(taskText)) {
    for (const previous of previousTasks) {
      if (containsTaskIdReference(taskText, previous.id)) inferred.add(previous.id)
    }
  }

  const consumedTopics = getConsumedArtifactTopics(taskText)
  if (consumedTopics.size > 0) {
    for (const previous of previousTasks) {
      const producedTopics = getProducedArtifactTopics(previous.task)
      if ([...consumedTopics].some((topic) => producedTopics.has(topic))) {
        inferred.add(previous.id)
      }
    }
  }

  if (isReviewTask(taskText)) {
    for (const previous of previousTasks) {
      if (taskExpectsArtifact(previous) || getProducedArtifactTopics(previous.task).size > 0) {
        inferred.add(previous.id)
      }
    }
  }

  return previousTasks.filter((previous) => inferred.has(previous.id)).map((previous) => previous.id)
}

function hasDependencySignal(text: string): boolean {
  return /(读取|基于|参考|根据|按照|依赖|等待|待.{0,12}完成|前序|上游|产物|输出|结果|审查|检查|验收|read|review|artifact)/i.test(text)
}

function containsTaskIdReference(text: string, taskId: string): boolean {
  const escaped = escapeRegExp(taskId)
  return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`, 'i').test(text)
}

function getConsumedArtifactTopics(text: string): Set<ArtifactTopic> {
  const topics = new Set<ArtifactTopic>()
  if (consumesPrd(text)) topics.add('prd')
  if (consumesUiDesign(text)) topics.add('ui_design')
  if (consumesFrontend(text)) topics.add('frontend')
  return topics
}

function getProducedArtifactTopics(text: string): Set<ArtifactTopic> {
  const topics = new Set<ArtifactTopic>()
  if (producesPrd(text)) topics.add('prd')
  if (producesUiDesign(text)) topics.add('ui_design')
  if (producesFrontend(text)) topics.add('frontend')
  return topics
}

function consumesPrd(text: string): boolean {
  return /(?:读取|基于|参考|根据|按照|了解|审查|检查|验收|read|review).{0,40}(?:PRD|产品需求|需求文档)|(?:PRD|产品需求|需求文档).{0,40}(?:读取|基于|参考|根据|按照|了解|审查|检查|验收|符合|read|review)/i.test(text)
}

function consumesUiDesign(text: string): boolean {
  return /(?:读取|基于|参考|根据|按照|了解|审查|检查|验收|read|review).{0,40}(?:UI|设计稿|设计方案|风格指南)|(?:UI|设计稿|设计方案|风格指南).{0,40}(?:读取|基于|参考|根据|按照|了解|审查|检查|验收|符合|read|review)/i.test(text)
}

function consumesFrontend(text: string): boolean {
  return /(?:读取|基于|参考|根据|按照|了解|审查|检查|验收|read|review).{0,48}(?:前端|web_app|web app|HTML|网页|实现|代码)|(?:前端|web_app|web app|HTML|网页|实现|代码).{0,48}(?:读取|基于|参考|根据|按照|了解|审查|检查|验收|符合|产出|artifact|read|review)/i.test(text)
}

function producesPrd(text: string): boolean {
  return /(?:产出|输出|撰写|写入|生成|创建).{0,32}(?:PRD|产品需求|需求文档)|(?:PRD|产品需求|需求文档).{0,32}(?:产出|输出|撰写|写入|生成|创建)/i.test(text)
}

function producesUiDesign(text: string): boolean {
  return /(?:产出|输出|设计|写入|生成|创建).{0,32}(?:UI|设计稿|设计方案|风格指南)|(?:UI|设计稿|设计方案|风格指南).{0,32}(?:产出|输出|写入|生成|创建)/i.test(text)
}

function producesFrontend(text: string): boolean {
  return /(?:实现|开发|输出|产出|写入|生成|创建).{0,48}(?:前端|web_app|web app|HTML|网页|代码|应用)|(?:前端|web_app|web app|HTML|网页|代码|应用).{0,48}(?:实现|开发|输出|产出|写入|生成|创建)/i.test(text)
}

function isReviewTask(text: string): boolean {
  return /审查|检查|验收|review|inspect|validate/i.test(text)
}

function readNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid dispatch plan: ${label} must be a non-empty string`)
  }
  return value
}

function readOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new Error(`Invalid dispatch plan: ${label} must be a string`)
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readOptionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid dispatch plan: ${label} must be a boolean`)
  }
  return value
}

function readOptionalPositiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || typeof value !== 'number' || value <= 0) {
    throw new Error(`Invalid dispatch plan: ${label} must be a positive integer`)
  }
  return value
}

function readOptionalTaskKind(value: unknown, label: string): DispatchTaskKind | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !DISPATCH_TASK_KINDS.has(value as DispatchTaskKind)) {
    throw new Error(
      `Invalid dispatch plan: ${label} must be one of ${[...DISPATCH_TASK_KINDS].join(', ')}`,
    )
  }
  return value as DispatchTaskKind
}

function readExpectedOutputType(value: unknown, label: string): DispatchExpectedOutputType {
  if (typeof value !== 'string' || !EXPECTED_OUTPUT_TYPES.has(value as DispatchExpectedOutputType)) {
    throw new Error(
      `Invalid dispatch plan: ${label} must be one of ${[...EXPECTED_OUTPUT_TYPES].join(', ')}`,
    )
  }
  return value as DispatchExpectedOutputType
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── 动态重规划（dynamic re-planning）──────────────────────
export interface ReplanTaskView {
  taskId: string
  agentId: string
  status: 'complete' | 'failed' | 'skipped' | 'aborted'
  error?: string
}

export interface ReplanConflictView {
  path: string
  taskIds: string[]
}

/** 本轮执行后是否需要 Orchestrator 再 plan 补救：有非 complete 任务，或有写冲突。 */
export function shouldReplan(views: ReplanTaskView[], conflicts: ReplanConflictView[]): boolean {
  return views.some((v) => v.status !== 'complete') || conflicts.length > 0
}

/**
 * 构造补救轮 plan 的上下文：把上一轮结果（已完成 / 失败 / 冲突）拼成 XML + 补救指示，
 * 作为补救轮 plan 阶段的 user prompt 前缀，引导 Orchestrator 决定补救 plan。
 */
export function buildReplanContext(
  views: ReplanTaskView[],
  conflicts: ReplanConflictView[],
): string {
  const done = views.filter((v) => v.status === 'complete')
  const failed = views.filter((v) => v.status !== 'complete')
  const lines: string[] = ['<previous_round_results>']
  for (const v of done) {
    lines.push(`  <task id="${v.taskId}" agent="${v.agentId}" status="complete" />`)
  }
  for (const v of failed) {
    const err = v.error ? ` error=${JSON.stringify(v.error)}` : ''
    lines.push(`  <task id="${v.taskId}" agent="${v.agentId}" status="${v.status}"${err} />`)
  }
  lines.push('</previous_round_results>')
  if (conflicts.length > 0) {
    lines.push('<file_conflicts>')
    for (const c of conflicts) {
      lines.push(
        `  <conflict path=${JSON.stringify(c.path)} tasks=${JSON.stringify(c.taskIds.join(', '))} />`,
      )
    }
    lines.push('</file_conflicts>')
  }
  lines.push(
    '',
    '上一轮存在未完成任务或写冲突。请围绕 original_request 的原始目标输出补救 plan_tasks，只修复未完成 / 冲突 / 缺失证据的部分：可换更合适的 agent、把写同一文件的任务用 dependsOn 串行化、或把任务拆得更细。不要把实现任务缩小成静态审查、总结或解释；除非用户明确同意缩小范围，否则补救计划必须继续追踪原始目标的未完成验收。已 complete 的任务不要重做；补救任务需要基于已 complete 任务时，可以在 dependsOn / inputs 中引用上一轮的 task id，系统会把它当作已解析的外部依赖。若判断无需或无法补救，就不要调用 plan_tasks（直接进入总结）。',
  )
  return lines.join('\n')
}

/**
 * 构造「对话式修改」轮的 plan 上下文：把当前待审计划 + 用户的自然语言修改意见拼成 XML + 指示，
 * 作为 plan 阶段的 user prompt 前缀，引导 Orchestrator 据此重排并重新调用 plan_tasks。
 */
export function buildReviseContext(currentPlan: DispatchPlanItem[], feedback: string): string {
  const lines: string[] = ['<current_plan>']
  for (const t of currentPlan) {
    const deps =
      t.dependsOn && t.dependsOn.length > 0
        ? ` dependsOn=${JSON.stringify(t.dependsOn.join(', '))}`
        : ''
    lines.push(`  <task id="${t.id}" agent="${t.agentId}"${deps}>${t.task}</task>`)
  }
  lines.push('</current_plan>')
  lines.push(
    '<user_revision_request>',
    feedback,
    '</user_revision_request>',
    '',
    '用户对上面这份待执行计划提出了修改意见。请据此调整，重新调用 plan_tasks 输出**完整的新计划**：保留未被要求改动的任务，只改动用户要求的部分（依赖、执行者、任务描述、拆分等）。',
  )
  return lines.join('\n')
}
