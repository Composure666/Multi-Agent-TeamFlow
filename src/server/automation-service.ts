import { and, count, desc, eq, gte, lte } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type {
  AutomationIconKey,
  AutomationRunLogLevel,
  AutomationRunStatus,
  AutomationRunTrigger,
  AutomationScheduleType,
  AutomationStatus,
} from '@/db/schema'
import { cadenceFromSchedule, calculateNextRunAt, deserializeScheduleConfig, parseScheduleConfig, serializeScheduleConfig } from '@/server/automation-schedule'
import { addAgentsToConversation, createConversation, sendMessage } from '@/server/conversation-service'
import { newAutomationId, newAutomationRunId, newAutomationRunLogId } from '@/server/ids'
import { publishNotification } from '@/server/notification-service'

export type { AutomationIconKey, AutomationRunStatus, AutomationScheduleType, AutomationStatus }

export interface AutomationListItem {
  id: string
  title: string
  description: string
  category: string
  cadence: string
  latestRunAt: number | null
  status: AutomationStatus
  iconKey: AutomationIconKey
  prompt: string
  agentId: string | null
  conversationId: string | null
  workspaceId: string | null
  scheduleType: AutomationScheduleType
  scheduleConfig: unknown
  nextRunAt: number | null
  lastError: string | null
}

export interface AutomationRunListItem {
  id: string
  automationId: string
  title: string
  category: string
  status: AutomationRunStatus
  trigger: AutomationRunTrigger
  agentRunId: string | null
  conversationId: string | null
  durationMs: number | null
  startedAt: number
  finishedAt: number | null
  error: string | null
}

export interface AutomationRunLogItem {
  id: string
  runId: string
  level: AutomationRunLogLevel
  message: string
  metadata: string | null
  createdAt: number
}

export interface AutomationRunDetailItem extends AutomationRunListItem {
  agentRunId: string | null
  conversationId: string | null
  attempt: number
  logs: AutomationRunLogItem[]
}

export interface AutomationStats {
  enabledCount: number
  todayRunCount: number
  successRate: number
  pendingCount: number
  failCount: number
  previousRunCount: number
  previousSuccessRate: number
  previousFailCount: number
}

export interface AutomationTrendPoint {
  label: string
  value: number
}

export interface AutomationDashboard {
  stats: AutomationStats
  automations: AutomationListItem[]
  recentRuns: AutomationRunListItem[]
  trend: AutomationTrendPoint[]
  trendRange: AutomationTrendRange
}

export interface UpsertAutomationInput {
  title: string
  description?: string
  category?: string
  status?: Exclude<AutomationStatus, 'running'>
  iconKey?: AutomationIconKey
  prompt: string
  agentId?: string | null
  conversationId?: string | null
  workspaceId?: string | null
  scheduleType: AutomationScheduleType
  scheduleConfig?: unknown
}

export type UpdateAutomationInput = Partial<UpsertAutomationInput>

export class AutomationServiceError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
    this.name = 'AutomationServiceError'
  }
}

const DAY_MS = 24 * 60 * 60 * 1000
const TREND_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function startOfDay(value: number): number {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export const TREND_RANGE_OPTIONS = [7, 30] as const

export type AutomationTrendRange = (typeof TREND_RANGE_OPTIONS)[number]

export const TREND_DEFAULT_DAYS: AutomationTrendRange = 7

function normalizeTrendRange(value: number | undefined): AutomationTrendRange {
  return TREND_RANGE_OPTIONS.includes(value as AutomationTrendRange) ? (value as AutomationTrendRange) : TREND_DEFAULT_DAYS
}

function buildTrend(runs: Array<{ startedAt: number }>, now = Date.now(), days = TREND_DEFAULT_DAYS): AutomationTrendPoint[] {
  const todayStart = startOfDay(now)
  return Array.from({ length: days }, (_, index) => {
    const dayStart = todayStart - (days - 1 - index) * DAY_MS
    const dayEnd = dayStart + DAY_MS
    const date = new Date(dayStart)
    // 长区间下只标注部分刻度，避免横轴标签互相重叠
    const label =
      days > TREND_DEFAULT_DAYS
        ? index % 5 === 0 || index === days - 1
          ? `${date.getMonth() + 1}/${date.getDate()}`
          : ''
        : TREND_LABELS[date.getDay()]
    const value = runs.filter((run) => run.startedAt >= dayStart && run.startedAt < dayEnd).length
    return { label, value }
  })
}

export async function getAutomationDashboard(trendRange?: number): Promise<AutomationDashboard> {
  const now = Date.now()
  const trendDays = normalizeTrendRange(trendRange)
  const todayStart = startOfDay(now)
  const trendStart = todayStart - 6 * DAY_MS
  const chartStart = todayStart - (trendDays - 1) * DAY_MS

  const automations = await db
    .select()
    .from(schema.automations)
    .orderBy(desc(schema.automations.updatedAt))

  const recentRuns = await db
    .select({
      id: schema.automationRuns.id,
      automationId: schema.automationRuns.automationId,
      title: schema.automations.title,
      category: schema.automations.category,
      status: schema.automationRuns.status,
      trigger: schema.automationRuns.trigger,
      agentRunId: schema.automationRuns.agentRunId,
      conversationId: schema.automationRuns.conversationId,
      durationMs: schema.automationRuns.durationMs,
      startedAt: schema.automationRuns.startedAt,
      finishedAt: schema.automationRuns.finishedAt,
      error: schema.automationRuns.error,
    })
    .from(schema.automationRuns)
    .innerJoin(schema.automations, eq(schema.automationRuns.automationId, schema.automations.id))
    .orderBy(desc(schema.automationRuns.startedAt))
    .limit(8)

  // 一次取数覆盖「图表窗口」与「上一周期窗口」，避免多次全表扫描
  const fetchStart = Math.min(chartStart, trendStart - 7 * DAY_MS)

  const runsForWindow = await db
    .select({
      status: schema.automationRuns.status,
      startedAt: schema.automationRuns.startedAt,
    })
    .from(schema.automationRuns)
    .where(gte(schema.automationRuns.startedAt, fetchStart))

  const runsForChart = runsForWindow.filter((run) => run.startedAt >= chartStart)
  // 统计口径固定为最近 7 天，不随趋势图的时间范围变化
  const runsForStats = runsForWindow.filter((run) => run.startedAt >= trendStart)
  const runsForPreviousStats = runsForWindow.filter(
    (run) => run.startedAt >= trendStart - 7 * DAY_MS && run.startedAt < trendStart,
  )

  const [{ value: todayRunCount }] = await db
    .select({ value: count() })
    .from(schema.automationRuns)
    .where(gte(schema.automationRuns.startedAt, todayStart))

  const successfulRuns = runsForStats.filter((run) => run.status === 'success').length
  const completedRuns = runsForStats.filter((run) => run.status !== 'running').length
  const failCount = runsForStats.filter((run) => run.status === 'failed').length

  const previousCompletedRuns = runsForPreviousStats.filter((run) => run.status !== 'running').length
  const previousSuccessRate =
    previousCompletedRuns > 0
      ? Math.round((runsForPreviousStats.filter((run) => run.status === 'success').length / previousCompletedRuns) * 1000) / 10
      : 0

  const enabledCount = automations.filter((item) => item.status === 'enabled' || item.status === 'running').length
  const pendingCount = automations.filter((item) => item.status === 'draft' || item.status === 'paused').length
  const successRate = completedRuns > 0 ? Math.round((successfulRuns / completedRuns) * 1000) / 10 : 0

  return {
    stats: {
      enabledCount,
      todayRunCount,
      successRate,
      pendingCount,
      failCount,
      previousRunCount: runsForPreviousStats.length,
      previousSuccessRate,
      previousFailCount: runsForPreviousStats.filter((run) => run.status === 'failed').length,
    },
    automations: automations.map(mapAutomationRow),
    recentRuns,
    trend: buildTrend(runsForChart, now, trendDays),
    trendRange: trendDays,
  }
}

export async function createAutomation(input: UpsertAutomationInput): Promise<AutomationListItem> {
  const now = Date.now()
  const scheduleConfig = parseScheduleConfig(input.scheduleType, input.scheduleConfig)
  const nextRunAt = input.status === 'enabled' ? calculateNextRunAt(input.scheduleType, scheduleConfig, now) : null
  const row = {
    id: newAutomationId(),
    title: input.title.trim(),
    description: input.description?.trim() || '暂无描述',
    category: input.category?.trim() || '自定义任务',
    cadence: cadenceFromSchedule(input.scheduleType, scheduleConfig),
    status: input.status ?? 'draft',
    iconKey: input.iconKey ?? 'calendar_clock',
    prompt: input.prompt.trim(),
    agentId: input.agentId ?? null,
    conversationId: input.conversationId ?? null,
    workspaceId: input.workspaceId ?? null,
    scheduleType: input.scheduleType,
    scheduleConfig: serializeScheduleConfig(input.scheduleType, scheduleConfig),
    nextRunAt,
    latestRunAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  }
  await db.insert(schema.automations).values(row)
  const bound = await ensureAutomationBinding(row)
  return mapAutomationRow(bound)
}

export async function updateAutomation(id: string, input: UpdateAutomationInput): Promise<AutomationListItem> {
  const current = await getAutomationRow(id)
  const scheduleType = input.scheduleType ?? current.scheduleType
  const rawConfig = input.scheduleConfig ?? deserializeScheduleConfig(current.scheduleType, current.scheduleConfig)
  const scheduleConfig = parseScheduleConfig(scheduleType, rawConfig)
  const status = input.status ?? (current.status === 'running' ? 'enabled' : current.status)
  const now = Date.now()
  const patch = {
    title: input.title?.trim() ?? current.title,
    description: input.description?.trim() ?? current.description,
    category: input.category?.trim() ?? current.category,
    status,
    iconKey: input.iconKey ?? current.iconKey,
    prompt: input.prompt?.trim() ?? current.prompt,
    agentId: input.agentId === undefined ? current.agentId : input.agentId,
    conversationId: input.conversationId === undefined ? current.conversationId : input.conversationId,
    workspaceId: input.workspaceId === undefined ? current.workspaceId : input.workspaceId,
    scheduleType,
    scheduleConfig: serializeScheduleConfig(scheduleType, scheduleConfig),
    cadence: cadenceFromSchedule(scheduleType, scheduleConfig),
    nextRunAt: status === 'enabled' ? calculateNextRunAt(scheduleType, scheduleConfig, now) : null,
    updatedAt: now,
  }

  await db.update(schema.automations).set(patch).where(eq(schema.automations.id, id))
  return mapAutomationRow(await ensureAutomationBinding({ ...current, ...patch }))
}

export async function deleteAutomation(id: string): Promise<void> {
  await getAutomationRow(id)
  const running = await findRunningRun(id)
  if (running) throw new AutomationServiceError('Automation is running and cannot be deleted', 409)
  await db.delete(schema.automations).where(eq(schema.automations.id, id))
}

export async function enableAutomation(id: string): Promise<AutomationListItem> {
  const current = await ensureAutomationBinding(await getAutomationRow(id))
  const config = deserializeScheduleConfig(current.scheduleType, current.scheduleConfig)
  const now = Date.now()
  const patch = {
    status: 'enabled' as const,
    nextRunAt: calculateNextRunAt(current.scheduleType, config, now),
    updatedAt: now,
  }
  await db.update(schema.automations).set(patch).where(eq(schema.automations.id, id))
  return mapAutomationRow({ ...current, ...patch })
}

export async function disableAutomation(id: string): Promise<AutomationListItem> {
  const current = await getAutomationRow(id)
  const patch = { status: 'paused' as const, nextRunAt: null, updatedAt: Date.now() }
  await db.update(schema.automations).set(patch).where(eq(schema.automations.id, id))
  return mapAutomationRow({ ...current, ...patch })
}

export async function listDueAutomations(now = Date.now()): Promise<AutomationListItem[]> {
  const rows = await db
    .select()
    .from(schema.automations)
    .where(and(eq(schema.automations.status, 'enabled'), lte(schema.automations.nextRunAt, now)))
    .orderBy(schema.automations.nextRunAt)
    .limit(10)
  return rows.map(mapAutomationRow)
}

export async function runAutomation(
  id: string,
  options: { trigger: AutomationRunTrigger; scheduledFor?: number | null; schedulerNow?: number },
): Promise<AutomationRunDetailItem> {
  const automation = await ensureAutomationBinding(await getAutomationRow(id))
  const running = await findRunningRun(id)
  if (running) throw new AutomationServiceError('Automation already has a running run', 409)

  const now = Date.now()
  const runId = newAutomationRunId()
  await db.insert(schema.automationRuns).values({
    id: runId,
    automationId: id,
    status: 'running',
    trigger: options.trigger,
    agentRunId: null,
    conversationId: automation.conversationId,
    attempt: 1,
    durationMs: null,
    startedAt: now,
    finishedAt: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  })
  await appendAutomationRunLog({
    runId,
    level: 'info',
    message: 'Automation run started',
    metadata: {
      trigger: options.trigger,
      automationId: automation.id,
      scheduleType: automation.scheduleType,
      nextRunAt: automation.nextRunAt,
      scheduledFor: options.scheduledFor ?? null,
      schedulerNow: options.schedulerNow ?? null,
      startedAt: now,
    },
  })

  try {
    if (!automation.prompt.trim()) throw new AutomationServiceError('Automation prompt is required before running', 400)

    const sent = await sendMessage({
      conversationId: automation.conversationId,
      content: automation.prompt,
      mentionedAgentIds: [automation.agentId],
    })
    if (sent.runIds.length === 0) {
      throw new AutomationServiceError(`Automation submitted but no agent run was created for conversation ${automation.conversationId} and agent ${automation.agentId}`, 502)
    }
    const agentRunId = sent.runIds[0]
    await appendAutomationRunLog({ runId, level: 'info', message: 'Automation submitted to conversation', metadata: { messageId: sent.messageId, runIds: sent.runIds } })
    const submittedMessage = await db.query.messages.findFirst({
      where: and(
        eq(schema.messages.id, sent.messageId),
        eq(schema.messages.conversationId, automation.conversationId),
      ),
    })
    const completed = await completeAutomationRun({ automation, runId, status: 'success', agentRunId })
    await publishAutomationRunNotification({
      automation,
      run: completed,
      trigger: options.trigger,
      messageId: submittedMessage?.id,
    })
    return completed
  } catch (err) {
    const error = normalizeAutomationError(err)
    await appendAutomationRunLog({ runId, level: 'error', message: 'Automation run failed', metadata: error })
    const completed = await completeAutomationRun({ automation, runId, status: 'failed', error: error.message })
    await publishAutomationRunNotification({ automation, run: completed, trigger: options.trigger })
    return completed
  }
}

export async function listAutomationRuns(automationId: string): Promise<AutomationRunDetailItem[]> {
  await getAutomationRow(automationId)
  const rows = await db
    .select({
      id: schema.automationRuns.id,
      automationId: schema.automationRuns.automationId,
      title: schema.automations.title,
      category: schema.automations.category,
      status: schema.automationRuns.status,
      trigger: schema.automationRuns.trigger,
      agentRunId: schema.automationRuns.agentRunId,
      conversationId: schema.automationRuns.conversationId,
      attempt: schema.automationRuns.attempt,
      durationMs: schema.automationRuns.durationMs,
      startedAt: schema.automationRuns.startedAt,
      finishedAt: schema.automationRuns.finishedAt,
      error: schema.automationRuns.error,
    })
    .from(schema.automationRuns)
    .innerJoin(schema.automations, eq(schema.automationRuns.automationId, schema.automations.id))
    .where(eq(schema.automationRuns.automationId, automationId))
    .orderBy(desc(schema.automationRuns.startedAt))
    .limit(20)

  const result: AutomationRunDetailItem[] = []
  for (const row of rows) {
    const logs = await db
      .select()
      .from(schema.automationRunLogs)
      .where(eq(schema.automationRunLogs.runId, row.id))
      .orderBy(desc(schema.automationRunLogs.createdAt))
      .limit(20)
    result.push({ ...row, logs })
  }
  return result
}

export async function appendAutomationRunLog(input: {
  runId: string
  level: AutomationRunLogLevel
  message: string
  metadata?: unknown
}): Promise<void> {
  await db.insert(schema.automationRunLogs).values({
    id: newAutomationRunLogId(),
    runId: input.runId,
    level: input.level,
    message: input.message,
    metadata: input.metadata === undefined ? null : JSON.stringify(input.metadata),
    createdAt: Date.now(),
  })
}

export async function recordScheduledAutomationDispatchFailure(
  id: string,
  error: unknown,
  now = Date.now(),
): Promise<void> {
  const automation = await getAutomationRow(id)
  const normalized = normalizeAutomationError(error)
  const config = deserializeScheduleConfig(automation.scheduleType, automation.scheduleConfig)
  await db
    .update(schema.automations)
    .set({
      lastError: normalized.message,
      nextRunAt: automation.status === 'enabled' ? calculateNextRunAt(automation.scheduleType, config, now) : null,
      updatedAt: now,
    })
    .where(eq(schema.automations.id, id))
}

type AutomationRow = typeof schema.automations.$inferSelect
type BoundAutomationRow = AutomationRow & { agentId: string; conversationId: string }

async function ensureAutomationBinding(automation: AutomationRow): Promise<BoundAutomationRow> {
  const agentId = automation.agentId ?? await getDefaultAutomationAgentId()
  const agent = await db.query.agents.findFirst({ where: eq(schema.agents.id, agentId) })
  if (!agent) throw new AutomationServiceError(`Automation agent not found: ${agentId}`, 400)

  let conversationId = automation.conversationId
  if (conversationId) {
    const conversation = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, conversationId) })
    if (!conversation) throw new AutomationServiceError(`Automation conversation not found: ${conversationId}`, 400)
    if (!conversation.agentIds.includes(agentId)) {
      await addAgentsToConversation({ conversationId, agentIds: [agentId] })
    }
  } else {
    const conversation = await createConversation({
      title: automation.title,
      mode: 'single',
      agentIds: [agentId],
    })
    conversationId = conversation.id
  }

  if (automation.agentId !== agentId || automation.conversationId !== conversationId) {
    await db
      .update(schema.automations)
      .set({ agentId, conversationId, updatedAt: Date.now() })
      .where(eq(schema.automations.id, automation.id))
  }

  return { ...automation, agentId, conversationId }
}

async function getDefaultAutomationAgentId(): Promise<string> {
  const orchestrator = await db.query.agents.findFirst({ where: eq(schema.agents.id, 'ag_orchestrator') })
  if (orchestrator) return orchestrator.id

  const builtin = await db.query.agents.findFirst({ where: eq(schema.agents.isBuiltin, true) })
  if (builtin) return builtin.id

  const agent = await db.query.agents.findFirst()
  if (agent) return agent.id

  throw new AutomationServiceError('Automation needs at least one agent before it can be bound', 400)
}

async function publishAutomationRunNotification(args: {
  automation: BoundAutomationRow
  run: AutomationRunDetailItem
  trigger: AutomationRunTrigger
  messageId?: string
}): Promise<void> {
  const failed = args.run.status === 'failed'
  const urgent = failed && args.trigger === 'schedule'
  await publishNotification({
    title: failed ? '自动化任务执行失败' : '自动化任务执行完成',
    body: failed
      ? `${args.automation.title}：${args.run.error ?? '执行失败'}。结果位置：${args.automation.title} 会话。`
      : `${args.automation.title} 已完成，结果已生成在「${args.automation.title}」对话会话中。`,
    level: failed ? 'error' : 'success',
    source: 'automation',
    category: failed ? 'error' : 'task',
    priority: urgent ? 'urgent' : failed ? 'high' : 'normal',
    target: {
      type: 'conversation',
      conversationId: args.automation.conversationId,
      messageId: failed ? undefined : args.messageId,
      automationId: args.automation.id,
      runId: args.run.id,
    },
    automationId: args.automation.id,
    runId: args.run.id,
    conversationId: args.automation.conversationId,
    urgent,
    native: true,
    toast: true,
  })
}

async function completeAutomationRun(args: {
  automation: BoundAutomationRow
  runId: string
  status: Exclude<AutomationRunStatus, 'running'>
  agentRunId?: string | null
  error?: string
}): Promise<AutomationRunDetailItem> {
  const now = Date.now()
  const durationMs = Math.max(0, now - (await getAutomationRunStartedAt(args.runId)))
  await db
    .update(schema.automationRuns)
    .set({
      status: args.status,
      agentRunId: args.agentRunId ?? null,
      durationMs,
      finishedAt: now,
      error: args.error ?? null,
      updatedAt: now,
    })
    .where(eq(schema.automationRuns.id, args.runId))

  const config = deserializeScheduleConfig(args.automation.scheduleType, args.automation.scheduleConfig)
  await db
    .update(schema.automations)
    .set({
      latestRunAt: now,
      lastError: args.error ?? null,
      nextRunAt: args.automation.status === 'enabled' ? calculateNextRunAt(args.automation.scheduleType, config, now) : null,
      updatedAt: now,
    })
    .where(eq(schema.automations.id, args.automation.id))

  const [run] = await listAutomationRuns(args.automation.id)
  return run
}

async function getAutomationRunStartedAt(runId: string): Promise<number> {
  const run = await db.query.automationRuns.findFirst({ where: eq(schema.automationRuns.id, runId) })
  if (!run) throw new AutomationServiceError(`Automation run not found: ${runId}`, 404)
  return run.startedAt
}

async function getAutomationRow(id: string): Promise<typeof schema.automations.$inferSelect> {
  const row = await db.query.automations.findFirst({ where: eq(schema.automations.id, id) })
  if (!row) throw new AutomationServiceError(`Automation not found: ${id}`, 404)
  return row
}

async function findRunningRun(automationId: string): Promise<typeof schema.automationRuns.$inferSelect | undefined> {
  return db.query.automationRuns.findFirst({
    where: and(eq(schema.automationRuns.automationId, automationId), eq(schema.automationRuns.status, 'running')),
  })
}

function mapAutomationRow(item: typeof schema.automations.$inferSelect): AutomationListItem {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    cadence: item.cadence,
    latestRunAt: item.latestRunAt,
    status: item.status,
    iconKey: item.iconKey,
    prompt: item.prompt,
    agentId: item.agentId,
    conversationId: item.conversationId,
    workspaceId: item.workspaceId,
    scheduleType: item.scheduleType,
    scheduleConfig: item.scheduleConfig ? JSON.parse(item.scheduleConfig) as unknown : null,
    nextRunAt: item.nextRunAt,
    lastError: item.lastError,
  }
}

function normalizeAutomationError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message }
  return { name: 'Error', message: String(error) }
}
