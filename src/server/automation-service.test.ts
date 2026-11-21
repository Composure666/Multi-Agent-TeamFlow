import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { StreamEvent } from '@/shared/types'

let dataDir: string
let service: typeof import('./automation-service')
let dbClient: typeof import('@/db/client')
let eventBus: typeof import('./event-bus').eventBus
let sendMessageMock: ReturnType<typeof vi.fn>
let events: StreamEvent[] = []
let unsubscribe: (() => void) | undefined

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-automation-service-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  vi.resetModules()
  vi.doMock('@/server/conversation-service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/conversation-service')>()
    return {
      ...actual,
      sendMessage: vi.fn(async () => ({ messageId: 'msg_test', runIds: [] })),
    }
  })

  service = await import('./automation-service')
  dbClient = await import('@/db/client')
  eventBus = (await import('./event-bus')).eventBus
  sendMessageMock = vi.mocked((await import('@/server/conversation-service')).sendMessage)
})

afterAll(() => {
  unsubscribe?.()
  dbClient?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
  vi.doUnmock('@/server/conversation-service')
})

beforeEach(() => {
  unsubscribe?.()
  events = []
  unsubscribe = eventBus.subscribe((event) => events.push(event))
  vi.clearAllMocks()
  sendMessageMock.mockResolvedValue({ messageId: 'msg_test', runIds: [] })
})

describe('automation service bindings and notifications', () => {
  it('auto-binds a default agent and task-named conversation when creating automation', async () => {
    const automation = await service.createAutomation({
      title: '每日摘要自动化测试',
      description: '生成每日摘要',
      category: '测试',
      prompt: '请生成每日摘要',
      scheduleType: 'manual',
    })

    expect(automation.agentId).toBeTruthy()
    expect(automation.conversationId).toBeTruthy()

    const conversation = await dbClient.db.query.conversations.findFirst({
      where: (table, { eq }) => eq(table.id, automation.conversationId!),
    })
    expect(conversation?.title).toBe('每日摘要自动化测试')
    expect(conversation?.agentIds).toEqual([automation.agentId])
  })

  it('auto-unarchives a bound conversation so run output stays visible', async () => {
    const automation = await service.createAutomation({
      title: '归档会话自动化测试',
      prompt: '往已归档会话写结果',
      scheduleType: 'manual',
    })

    // 复刻线上报障：目标会话被归档（且标题与自动化标题不同）
    await dbClient.db
      .update(dbClient.schema.conversations)
      .set({ title: '演示群聊', archived: true })
      .where(eq(dbClient.schema.conversations.id, automation.conversationId!))

    sendMessageMock.mockResolvedValueOnce({ messageId: 'msg_test', runIds: ['run_agent_unarchive'] })
    await dbClient.db.insert(dbClient.schema.agentRuns).values({
      id: 'run_agent_unarchive',
      conversationId: automation.conversationId!,
      agentId: automation.agentId!,
      triggerMessageId: null,
      status: 'queued',
      error: null,
      parentRunId: null,
      usage: null,
      startedAt: Date.now(),
      finishedAt: null,
    })

    await service.runAutomation(automation.id, { trigger: 'manual' })

    const conversation = await dbClient.db.query.conversations.findFirst({
      where: (table, { eq: eqOp }) => eqOp(table.id, automation.conversationId!),
    })
    expect(conversation?.archived).toBe(false)

    // 通知文案必须用真实会话标题，否则用户按自动化标题去找会找不到
    const notification = events.find((event) => event.type === 'notification.created')
    if (notification?.type !== 'notification.created') throw new Error('notification event missing')
    expect(notification.notification.body).toContain('演示群聊')
    expect(notification.notification.body).not.toContain('归档会话自动化测试」')
  })

  it('publishes a success notification after a manual automation run', async () => {
    sendMessageMock.mockResolvedValueOnce({ messageId: 'msg_test', runIds: ['run_agent_success'] })
    const automation = await service.createAutomation({
      title: '成功运行自动化测试',
      prompt: '执行成功路径',
      scheduleType: 'manual',
    })

    await dbClient.db.insert(dbClient.schema.agentRuns).values({
      id: 'run_agent_success',
      conversationId: automation.conversationId!,
      agentId: automation.agentId!,
      triggerMessageId: null,
      status: 'queued',
      error: null,
      parentRunId: null,
      usage: null,
      startedAt: Date.now(),
      finishedAt: null,
    })

    const run = await service.runAutomation(automation.id, { trigger: 'manual' })

    expect(run.error).toBeNull()
    expect(run.status).toBe('success')
    expect(sendMessageMock).toHaveBeenCalledWith({
      conversationId: automation.conversationId,
      content: '执行成功路径',
      mentionedAgentIds: [automation.agentId],
    })

    const notification = events.find((event) => event.type === 'notification.created')
    expect(notification).toBeDefined()
    if (notification?.type !== 'notification.created') throw new Error('notification event missing')
    expect(notification.notification).toMatchObject({
      title: '自动化任务执行完成',
      level: 'success',
      source: 'automation',
      automationId: automation.id,
      runId: run.id,
      conversationId: automation.conversationId,
      urgent: false,
      native: true,
    })
    expect(notification.notification.body).toContain('结果已生成在')
  })

  it('includes the linked agent run target in dashboard recent runs', async () => {
    sendMessageMock.mockResolvedValueOnce({ messageId: 'msg_test', runIds: ['run_agent_dashboard'] })
    const automation = await service.createAutomation({
      title: '展板下钻自动化测试',
      prompt: '生成可下钻 run',
      scheduleType: 'manual',
    })

    await dbClient.db.insert(dbClient.schema.agentRuns).values({
      id: 'run_agent_dashboard',
      conversationId: automation.conversationId!,
      agentId: automation.agentId!,
      triggerMessageId: null,
      status: 'complete',
      error: null,
      parentRunId: null,
      usage: null,
      startedAt: Date.now(),
      finishedAt: Date.now(),
    })

    const run = await service.runAutomation(automation.id, { trigger: 'manual' })
    const dashboard = await service.getAutomationDashboard()

    expect(dashboard.recentRuns[0]).toMatchObject({
      id: run.id,
      conversationId: automation.conversationId,
      agentRunId: 'run_agent_dashboard',
    })
  })

  it('publishes an urgent error notification after a scheduled automation failure', async () => {
    sendMessageMock.mockRejectedValueOnce(new Error('adapter unavailable'))
    const automation = await service.createAutomation({
      title: '失败运行自动化测试',
      prompt: '执行失败路径',
      scheduleType: 'manual',
    })

    const run = await service.runAutomation(automation.id, { trigger: 'schedule', scheduledFor: 123, schedulerNow: 456 })

    expect(run.status).toBe('failed')
    expect(run.error).toBe('adapter unavailable')
    const startedLog = run.logs.find((log) => log.message === 'Automation run started')
    expect(startedLog?.metadata).toBeTruthy()
    expect(JSON.parse(startedLog!.metadata!)).toMatchObject({
      trigger: 'schedule',
      automationId: automation.id,
      scheduleType: 'manual',
      nextRunAt: null,
      scheduledFor: 123,
      schedulerNow: 456,
    })

    const notification = events.find((event) => event.type === 'notification.created')
    expect(notification).toBeDefined()
    if (notification?.type !== 'notification.created') throw new Error('notification event missing')
    expect(notification.notification).toMatchObject({
      title: '自动化任务执行失败',
      level: 'error',
      source: 'automation',
      automationId: automation.id,
      runId: run.id,
      conversationId: automation.conversationId,
      urgent: true,
      native: true,
    })
    expect(notification.notification.body).toContain('adapter unavailable')
  })

  it('auto-binds a conversation when enabling an unbound automation', async () => {
    const [agent] = await dbClient.db.select().from(dbClient.schema.agents).limit(1)
    expect(agent).toBeDefined()

    await dbClient.db.insert(dbClient.schema.automations).values({
      id: 'auto_enable_unbound',
      title: '启用补绑定自动化测试',
      description: '启用时补绑定',
      category: '测试',
      cadence: '每天 10:35',
      status: 'draft',
      iconKey: 'calendar_clock',
      prompt: '启用时补绑定',
      agentId: null,
      conversationId: null,
      workspaceId: null,
      scheduleType: 'daily',
      scheduleConfig: JSON.stringify({ timeOfDay: '10:35' }),
      nextRunAt: null,
      latestRunAt: null,
      lastError: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const automation = await service.enableAutomation('auto_enable_unbound')

    expect(automation.status).toBe('enabled')
    expect(automation.agentId).toBeTruthy()
    expect(automation.conversationId).toBeTruthy()
    const row = await dbClient.db.query.automations.findFirst({
      where: (table, { eq }) => eq(table.id, 'auto_enable_unbound'),
    })
    expect(row?.agentId).toBe(automation.agentId)
    expect(row?.conversationId).toBe(automation.conversationId)
  })

  it('adds the automation agent to a selected conversation before running', async () => {
    const agents = await dbClient.db.select().from(dbClient.schema.agents).limit(2)
    expect(agents).toHaveLength(2)
    const conversation = await (await import('@/server/conversation-service')).createConversation({
      title: '缺少目标 Agent 的会话',
      mode: 'single',
      agentIds: [agents[0]!.id],
    })

    const automation = await service.createAutomation({
      title: '补齐会话成员自动化测试',
      prompt: '补齐会话成员',
      agentId: agents[1]!.id,
      conversationId: conversation.id,
      scheduleType: 'manual',
    })

    const updatedConversation = await dbClient.db.query.conversations.findFirst({
      where: (table, { eq }) => eq(table.id, conversation.id),
    })
    expect(automation.conversationId).toBe(conversation.id)
    expect(updatedConversation?.agentIds).toContain(agents[0]!.id)
    expect(updatedConversation?.agentIds).toContain(agents[1]!.id)
    expect(updatedConversation?.mode).toBe('group')
  })

  it('fails the automation run when no agent run is created', async () => {
    const automation = await service.createAutomation({
      title: '无 Agent Run 自动化测试',
      prompt: '不会产生 agent run',
      scheduleType: 'manual',
    })

    const run = await service.runAutomation(automation.id, { trigger: 'manual' })

    expect(run.status).toBe('failed')
    expect(run.error).toContain('no agent run was created')
    const notification = events.find((event) => event.type === 'notification.created')
    expect(notification).toBeDefined()
    if (notification?.type !== 'notification.created') throw new Error('notification event missing')
    expect(notification.notification).toMatchObject({
      title: '自动化任务执行失败',
      level: 'error',
      source: 'automation',
      automationId: automation.id,
      runId: run.id,
      conversationId: automation.conversationId,
    })
  })

  it('records scheduled dispatch failures and advances the next run time', async () => {
    const now = new Date(2026, 6, 22, 10, 35, 30, 0).getTime()
    const automation = await service.createAutomation({
      title: '调度派发失败自动化测试',
      prompt: '调度派发失败',
      status: 'enabled',
      scheduleType: 'daily',
      scheduleConfig: { timeOfDay: '10:35' },
    })

    await service.recordScheduledAutomationDispatchFailure(automation.id, new Error('already running'), now)

    const row = await dbClient.db.query.automations.findFirst({
      where: (table, { eq }) => eq(table.id, automation.id),
    })
    expect(row?.lastError).toBe('already running')
    expect(row?.nextRunAt).toBeGreaterThan(now)
    expect(row?.nextRunAt).toBe(new Date(2026, 6, 23, 10, 35, 0, 0).getTime())
  })

  it('rejects a manual run while a fresh run is still in flight', async () => {
    const automation = await service.createAutomation({
      title: '并发运行拒绝测试',
      prompt: '并发运行',
      scheduleType: 'manual',
    })
    const startedAt = Date.now() - 30_000
    await dbClient.db.insert(dbClient.schema.automationRuns).values({
      id: 'arun_fresh_running',
      automationId: automation.id,
      status: 'running',
      trigger: 'manual',
      agentRunId: null,
      conversationId: automation.conversationId,
      attempt: 1,
      durationMs: null,
      startedAt,
      finishedAt: null,
      error: null,
      createdAt: startedAt,
      updatedAt: startedAt,
    })

    await expect(service.runAutomation(automation.id, { trigger: 'manual' })).rejects.toThrow(
      /already has a running run/,
    )
  })

  it('收尾僵尸 running 记录后，手动运行不再被 409 永久拒绝', async () => {
    const automation = await service.createAutomation({
      title: '僵尸运行收尾测试',
      prompt: '僵尸运行',
      scheduleType: 'manual',
    })
    // 40 分钟前发起、至今未收尾 = 进程重启留下的僵尸记录
    const startedAt = Date.now() - 40 * 60 * 1000
    await dbClient.db.insert(dbClient.schema.automationRuns).values({
      id: 'arun_stale_running',
      automationId: automation.id,
      status: 'running',
      trigger: 'schedule',
      agentRunId: null,
      conversationId: automation.conversationId,
      attempt: 1,
      durationMs: null,
      startedAt,
      finishedAt: null,
      error: null,
      createdAt: startedAt,
      updatedAt: startedAt,
    })

    expect(await service.reconcileStaleAutomationRuns({ automationId: automation.id })).toBe(1)

    const stale = await dbClient.db.query.automationRuns.findFirst({
      where: (table, { eq }) => eq(table.id, 'arun_stale_running'),
    })
    expect(stale?.status).toBe('failed')
    expect(stale?.finishedAt).toBeTruthy()
    expect(stale?.error).toContain('服务重启')

    sendMessageMock.mockResolvedValueOnce({ messageId: 'msg_test', runIds: ['run_agent_after_stale'] })
    await dbClient.db.insert(dbClient.schema.agentRuns).values({
      id: 'run_agent_after_stale',
      conversationId: automation.conversationId!,
      agentId: automation.agentId!,
      triggerMessageId: null,
      status: 'queued',
      error: null,
      parentRunId: null,
      usage: null,
      startedAt: Date.now(),
      finishedAt: null,
    })

    const run = await service.runAutomation(automation.id, { trigger: 'manual' })
    expect(run.status).toBe('success')
  })

describe('automation dashboard · D-P1-5 时区与 D-P1-7 同时段/等长窗口', () => {
  const TZ_CST = -480
  const DAY_MS = 24 * 60 * 60 * 1000
  const HOUR_MS = 60 * 60 * 1000
  const CST_SHIFT_MS = 8 * HOUR_MS

  function cstStartOfDay(ts: number): number {
    const d = new Date(ts + CST_SHIFT_MS)
    d.setUTCHours(0, 0, 0, 0)
    return d.getTime() - CST_SHIFT_MS
  }

  function trendTotal(dashboard: Awaited<ReturnType<typeof service.getAutomationDashboard>>): number {
    return dashboard.trend.reduce((sum, point) => sum + point.value, 0)
  }

  async function insertRun(
    automationId: string,
    conversationId: string | null,
    id: string,
    startedAt: number,
    status: 'success' | 'failed' | 'running' = 'success',
  ): Promise<void> {
    await dbClient.db.insert(dbClient.schema.automationRuns).values({
      id,
      automationId,
      status,
      trigger: 'manual',
      agentRunId: null,
      conversationId,
      attempt: 1,
      durationMs: 1000,
      startedAt,
      finishedAt: startedAt + 1000,
      error: null,
      createdAt: startedAt,
      updatedAt: startedAt,
    })
  }

  it('D-P1-5：CST 02:00 的运行计入「今日」，而不是昨天', async () => {
    const automation = await service.createAutomation({
      title: '时区回归自动化测试',
      prompt: '时区回归',
      scheduleType: 'manual',
    })
    const now = Date.now()
    const todayStartCst = cstStartOfDay(now)
    // 种子取“今天 02:00 与此刻”的较早者：00:00–02:00 时段固定 02:00 还在未来，
    // 仪表盘只计已发生的运行，会导致断言挂掉；取区间中点则恒在过去、恒在今天 CST、
    // 且恒在 08:00 CST 之前（UTC 对照的期望值才成立）
    const elapsed = now - todayStartCst
    const seedAt = todayStartCst + Math.min(2 * HOUR_MS, elapsed / 2)

    const before = await service.getAutomationDashboard({ tzOffsetMinutes: TZ_CST })
    await insertRun(automation.id, automation.conversationId, 'arun_tz_cst_today_0200', seedAt)
    await insertRun(automation.id, automation.conversationId, 'arun_tz_cst_yesterday_0200', todayStartCst - DAY_MS + 2 * HOUR_MS)
    const after = await service.getAutomationDashboard({ tzOffsetMinutes: TZ_CST })

    expect(after.stats.todayRunCount - before.stats.todayRunCount).toBe(1)
    expect(after.trend[after.trend.length - 1]!.value - before.trend[before.trend.length - 1]!.value).toBe(1)
    expect(after.trend[after.trend.length - 2]!.value - before.trend[before.trend.length - 2]!.value).toBe(1)

    // 对照：同一条 CST 02:00 的运行在 UTC 口径下是否计入「今日」，取决于现在几点
    // （UTC 午夜 = CST 08:00；CST 08:00 之后它已是昨天，之前它还在 UTC 的今天里）。
    const cstHour = new Date(now + CST_SHIFT_MS).getUTCHours()
    const beforeUtc = await service.getAutomationDashboard({ tzOffsetMinutes: 0 })
    await insertRun(automation.id, automation.conversationId, 'arun_tz_utc_control', seedAt)
    const afterUtc = await service.getAutomationDashboard({ tzOffsetMinutes: 0 })
    expect(afterUtc.stats.todayRunCount - beforeUtc.stats.todayRunCount).toBe(cstHour >= 8 ? 0 : 1)
  })

  it('D-P1-7：今日 delta 用「截至此时 vs 昨日同时段」，不拿未过完的今天跟完整昨天比', async () => {
    const automation = await service.createAutomation({
      title: '同时段比较自动化测试',
      prompt: '同时段比较',
      scheduleType: 'manual',
    })
    const now = Date.now()
    const todayStartCst = cstStartOfDay(now)
    const elapsed = now - todayStartCst
    const yesterdayStart = todayStartCst - DAY_MS
    const insideSameTime = yesterdayStart + elapsed / 2
    // 昨日同时段截止点与昨天午夜的中点：23:00 后 elapsed + 1h 会溢出到今天，
    // 故不用固定 +1h，取截止点到午夜的中点，保证恒在昨天内且在同时段之后
    const afterSameTime = yesterdayStart + elapsed + (DAY_MS - elapsed) / 2

    const before = await service.getAutomationDashboard({ tzOffsetMinutes: TZ_CST })
    await insertRun(automation.id, automation.conversationId, 'arun_same_time_inside', insideSameTime)
    const afterInside = await service.getAutomationDashboard({ tzOffsetMinutes: TZ_CST })
    expect(afterInside.stats.yesterdaySameTimeRunCount - before.stats.yesterdaySameTimeRunCount).toBe(1)
    // 落在昨日同时段内的运行不属于今天
    expect(afterInside.stats.todayRunCount - before.stats.todayRunCount).toBe(0)

    await insertRun(automation.id, automation.conversationId, 'arun_same_time_outside', afterSameTime)
    const afterOutside = await service.getAutomationDashboard({ tzOffsetMinutes: TZ_CST })
    // 昨日同时段之后、但仍在昨天内的运行，不计入同时段口径，但计入昨日整天桶
    expect(afterOutside.stats.yesterdaySameTimeRunCount - afterInside.stats.yesterdaySameTimeRunCount).toBe(0)
    expect(afterOutside.trend[afterOutside.trend.length - 2]!.value - afterInside.trend[afterInside.trend.length - 2]!.value).toBe(1)
  })

  it('D-P1-7：环比窗口与趋势窗口等长（7 个日历日 vs 前 7 个日历日）', async () => {
    const automation = await service.createAutomation({
      title: '等长窗口自动化测试',
      prompt: '等长窗口',
      scheduleType: 'manual',
    })
    const now = Date.now()
    const rangeStart = cstStartOfDay(now - 6 * DAY_MS)

    const before = await service.getAutomationDashboard({ tzOffsetMinutes: TZ_CST })

    // 上一周期内（rangeStart 前 3 天）：只进 previousRunCount，不进趋势合计
    await insertRun(automation.id, automation.conversationId, 'arun_prev_inside', rangeStart - 3 * DAY_MS)
    const afterPrev = await service.getAutomationDashboard({ tzOffsetMinutes: TZ_CST })
    expect(afterPrev.stats.previousRunCount - before.stats.previousRunCount).toBe(1)
    expect(trendTotal(afterPrev) - trendTotal(before)).toBe(0)

    // 上一周期外（rangeStart 前 8 天）：两边都不进
    await insertRun(automation.id, automation.conversationId, 'arun_prev_outside', rangeStart - 8 * DAY_MS)
    const afterOutside = await service.getAutomationDashboard({ tzOffsetMinutes: TZ_CST })
    expect(afterOutside.stats.previousRunCount - afterPrev.stats.previousRunCount).toBe(0)
    expect(trendTotal(afterOutside) - trendTotal(afterPrev)).toBe(0)

    // 边界：上一周期起点当天（含）进，起点前 1ms 不进
    await insertRun(automation.id, automation.conversationId, 'arun_prev_edge_in', rangeStart - 7 * DAY_MS)
    const afterEdgeIn = await service.getAutomationDashboard({ tzOffsetMinutes: TZ_CST })
    expect(afterEdgeIn.stats.previousRunCount - afterOutside.stats.previousRunCount).toBe(1)
    await insertRun(automation.id, automation.conversationId, 'arun_prev_edge_out', rangeStart - 7 * DAY_MS - 1)
    const afterEdgeOut = await service.getAutomationDashboard({ tzOffsetMinutes: TZ_CST })
    expect(afterEdgeOut.stats.previousRunCount - afterEdgeIn.stats.previousRunCount).toBe(0)

    // 趋势窗口内（rangeStart 后 1 小时）：只进趋势合计，不进上一周期
    await insertRun(automation.id, automation.conversationId, 'arun_trend_inside', rangeStart + HOUR_MS)
    const afterTrend = await service.getAutomationDashboard({ tzOffsetMinutes: TZ_CST })
    expect(trendTotal(afterTrend) - trendTotal(afterEdgeOut)).toBe(1)
    expect(afterTrend.stats.previousRunCount - afterEdgeOut.stats.previousRunCount).toBe(0)
  })
})

  it('maxAgeMs=0 时把所有 running 记录都当作僵尸（进程启动收尾）', async () => {
    const automation = await service.createAutomation({
      title: '启动收尾测试',
      prompt: '启动收尾',
      scheduleType: 'manual',
    })
    const startedAt = Date.now() // 刚发起：运行期不该动它
    await dbClient.db.insert(dbClient.schema.automationRuns).values({
      id: 'arun_boot_running',
      automationId: automation.id,
      status: 'running',
      trigger: 'manual',
      agentRunId: null,
      conversationId: automation.conversationId,
      attempt: 1,
      durationMs: null,
      startedAt,
      finishedAt: null,
      error: null,
      createdAt: startedAt,
      updatedAt: startedAt,
    })

    // 运行期阈值（10 分钟）下它不算僵尸
    expect(await service.reconcileStaleAutomationRuns({ automationId: automation.id })).toBe(0)
    // 启动收尾（maxAgeMs=0）则会把它收掉
    expect(await service.reconcileStaleAutomationRuns({ maxAgeMs: 0 })).toBeGreaterThanOrEqual(1)
    const row = await dbClient.db.query.automationRuns.findFirst({
      where: (table, { eq }) => eq(table.id, 'arun_boot_running'),
    })
    expect(row?.status).toBe('failed')
  })
})
