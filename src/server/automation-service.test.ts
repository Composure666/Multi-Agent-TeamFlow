import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

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
})
