import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

let dataDir: string
let service: typeof import('./agent-run-debug-service')
let dbClient: typeof import('@/db/client')

type DbClient = typeof import('@/db/client')

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-run-debug-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  vi.resetModules()

  service = await import('./agent-run-debug-service')
  dbClient = await import('@/db/client')
})

afterAll(() => {
  dbClient?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
})

beforeEach(async () => {
  await dbClient.db.delete(dbClient.schema.agentRunDebugSnapshots)
  await dbClient.db.delete(dbClient.schema.agentRunDebugEvents)
  await dbClient.db.delete(dbClient.schema.messages)
  await dbClient.db.delete(dbClient.schema.agentRuns)
  await dbClient.db.delete(dbClient.schema.conversations)
  await dbClient.db.delete(dbClient.schema.agents)
})

describe('agent run debug service', () => {
  it('records and returns a debug snapshot scoped to the conversation', async () => {
    await seedAgent(dbClient, 'ag_debug')
    await seedConversation(dbClient, 'conv_debug', ['ag_debug'])
    await seedRun(dbClient, 'run_debug', 'conv_debug', 'ag_debug')

    const snapshot = buildSnapshot('run_debug', 'conv_debug', 'ag_debug')
    const row = await service.recordAgentRunDebugSnapshot({
      runId: 'run_debug',
      conversationId: 'conv_debug',
      agentId: 'ag_debug',
      snapshot,
    })
    const duplicate = await service.recordAgentRunDebugSnapshot({
      runId: 'run_debug',
      conversationId: 'conv_debug',
      agentId: 'ag_debug',
      snapshot,
    })

    expect(duplicate.id).toBe(row.id)
    const runs = await service.listAgentRunsForConversation('conv_debug')
    expect(runs).toHaveLength(1)
    expect(runs[0]?.hasDebugSnapshot).toBe(true)

    const detail = await service.getAgentRunDebugDetail('conv_debug', 'run_debug')
    expect(detail.snapshot?.runId).toBe('run_debug')
    expect(detail.snapshot?.tools.externalMcpServers[0]?.envKeys).toEqual(['API_TOKEN'])
    expect(JSON.stringify(detail.snapshot)).not.toContain('secret-value')
  })

  it('pages recent runs without dropping older history', async () => {
    await seedAgent(dbClient, 'ag_debug')
    await seedConversation(dbClient, 'conv_debug', ['ag_debug'])
    await seedRun(dbClient, 'run_4', 'conv_debug', 'ag_debug', null, { startedAt: 400, finishedAt: 401 })
    await seedRun(dbClient, 'run_3', 'conv_debug', 'ag_debug', null, { startedAt: 300, finishedAt: 301 })
    await seedRun(dbClient, 'run_2', 'conv_debug', 'ag_debug', null, { startedAt: 200, finishedAt: 201 })
    await seedRun(dbClient, 'run_1', 'conv_debug', 'ag_debug', null, { startedAt: 100, finishedAt: 101 })

    const firstPage = await service.listAgentRunsForConversationPage('conv_debug', { limit: 2 })
    expect(firstPage.runs.map((run) => run.id)).toEqual(['run_4', 'run_3'])
    expect(firstPage.hasMore).toBe(true)
    expect(firstPage.nextCursor).toEqual({ startedAt: 300, runId: 'run_3' })

    const secondPage = await service.listAgentRunsForConversationPage('conv_debug', {
      limit: 2,
      before: firstPage.nextCursor ?? undefined,
    })
    expect(secondPage.runs.map((run) => run.id)).toEqual(['run_2', 'run_1'])
    expect(secondPage.hasMore).toBe(false)
    expect(secondPage.nextCursor).toBeNull()
  })

  it('rejects cross-conversation detail access', async () => {
    await seedAgent(dbClient, 'ag_scope')
    await seedConversation(dbClient, 'conv_owner', ['ag_scope'])
    await seedConversation(dbClient, 'conv_other', ['ag_scope'])
    await seedRun(dbClient, 'run_owner', 'conv_owner', 'ag_scope')

    await expect(service.getAgentRunDebugDetail('conv_other', 'run_owner')).rejects.toThrow('not found')
  })

  it('returns basic detail for old runs without snapshots', async () => {
    await seedAgent(dbClient, 'ag_old')
    await seedConversation(dbClient, 'conv_old', ['ag_old'])
    await seedRun(dbClient, 'run_old', 'conv_old', 'ag_old', 'msg_trigger')
    await seedMessage(dbClient, 'msg_trigger', 'conv_old', null, 'user')
    await seedMessage(dbClient, 'msg_output', 'conv_old', 'run_old', 'agent')

    const detail = await service.getAgentRunDebugDetail('conv_old', 'run_old')

    expect(detail.snapshot).toBeNull()
    expect(detail.triggerMessage?.id).toBe('msg_trigger')
    expect(detail.outputMessages.map((message) => message.id)).toEqual(['msg_output'])
  })

  it('records append-only debug events and lists them for the run scope', async () => {
    await seedAgent(dbClient, 'ag_debug')
    await seedConversation(dbClient, 'conv_debug', ['ag_debug'])
    await seedRun(dbClient, 'run_debug', 'conv_debug', 'ag_debug')

    const first = await service.recordAgentRunDebugEvent({
      conversationId: 'conv_debug',
      runId: 'run_debug',
      type: 'run.debug.step.started',
      agentId: 'ag_debug',
      stepId: 'step_run',
      status: 'running',
      payload: { label: 'run' },
      createdAt: 10,
    })
    const second = await service.recordAgentRunDebugEvent({
      conversationId: 'conv_debug',
      runId: 'run_debug',
      type: 'run.debug.tool.started',
      agentId: 'ag_debug',
      stepId: 'step_run',
      toolCallId: 'call_1',
      status: 'running',
      payload: { toolName: 'bash', argsSummary: 'pnpm lint' },
      createdAt: 20,
    })

    expect(first.id).not.toBe(second.id)

    const events = await service.getAgentRunDebugEvents('conv_debug', 'run_debug')
    expect(events.map((event) => event.type)).toEqual([
      'run.debug.step.started',
      'run.debug.tool.started',
    ])
    expect(events[0]?.payload).toMatchObject({ label: 'run' })
    expect(events[1]?.toolCallId).toBe('call_1')
  })

  it('lists debug events for the whole conversation without leaking other conversations', async () => {
    await seedAgent(dbClient, 'ag_debug')
    await seedConversation(dbClient, 'conv_debug', ['ag_debug'])
    await seedConversation(dbClient, 'conv_other', ['ag_debug'])
    await seedRun(dbClient, 'run_first', 'conv_debug', 'ag_debug')
    await seedRun(dbClient, 'run_second', 'conv_debug', 'ag_debug')
    await seedRun(dbClient, 'run_other', 'conv_other', 'ag_debug')

    await service.recordAgentRunDebugEvent({
      conversationId: 'conv_debug',
      runId: 'run_second',
      type: 'run.debug.step.started',
      status: 'running',
      payload: { label: 'second' },
      createdAt: 20,
    })
    await service.recordAgentRunDebugEvent({
      conversationId: 'conv_debug',
      runId: 'run_first',
      type: 'run.debug.step.started',
      status: 'running',
      payload: { label: 'first' },
      createdAt: 10,
    })
    await service.recordAgentRunDebugEvent({
      conversationId: 'conv_other',
      runId: 'run_other',
      type: 'run.debug.step.started',
      status: 'running',
      payload: { label: 'other' },
      createdAt: 5,
    })

    const events = await service.getAgentRunDebugEventsForConversation('conv_debug')

    expect(events.map((event) => event.runId)).toEqual(['run_first', 'run_second'])
    expect(events.map((event) => event.payload.label)).toEqual(['first', 'second'])
  })

  it('rejects cross-conversation debug event access', async () => {
    await seedAgent(dbClient, 'ag_scope')
    await seedConversation(dbClient, 'conv_owner', ['ag_scope'])
    await seedConversation(dbClient, 'conv_other', ['ag_scope'])
    await seedRun(dbClient, 'run_owner', 'conv_owner', 'ag_scope')
    await service.recordAgentRunDebugEvent({
      conversationId: 'conv_owner',
      runId: 'run_owner',
      type: 'run.debug.step.started',
      status: 'running',
      payload: { label: 'run' },
      createdAt: 10,
    })

    await expect(service.getAgentRunDebugEvents('conv_other', 'run_owner')).rejects.toThrow('not found')
  })
})

async function seedAgent(dbClient: DbClient, id: string) {
  await dbClient.db.insert(dbClient.schema.agents).values({
    id,
    name: id,
    avatar: 'A',
    description: 'test agent',
    capabilities: [],
    systemPrompt: 'test prompt',
    adapterName: 'custom',
    modelProvider: 'openai',
    modelId: 'gpt-test',
    apiKey: null,
    apiBaseUrl: null,
    toolNames: [],
    mcpServerIds: [],
    isBuiltin: false,
    isOrchestrator: false,
    supportsVision: false,
    createdAt: 1,
  })
}

async function seedConversation(dbClient: DbClient, id: string, agentIds: string[]) {
  await dbClient.db.insert(dbClient.schema.conversations).values({
    id,
    title: id,
    mode: agentIds.length > 1 ? 'group' : 'single',
    agentIds,
    pinnedMessageIds: [],
    bookmarkedMessageIds: [],
    archived: false,
    pinnedAt: null,
    fsWriteApprovalMode: 'review',
    createdAt: 1,
    updatedAt: 1,
  })
}

async function seedRun(
  dbClient: DbClient,
  id: string,
  conversationId: string,
  agentId: string,
  triggerMessageId: string | null = null,
  options: { startedAt?: number; finishedAt?: number } = {},
) {
  await dbClient.db.insert(dbClient.schema.agentRuns).values({
    id,
    conversationId,
    agentId,
    triggerMessageId,
    status: 'complete',
    error: null,
    parentRunId: null,
    usage: null,
    startedAt: options.startedAt ?? 1,
    finishedAt: options.finishedAt ?? 2,
  })
}

async function seedMessage(
  dbClient: DbClient,
  id: string,
  conversationId: string,
  runId: string | null,
  role: 'user' | 'agent',
) {
  await dbClient.db.insert(dbClient.schema.messages).values({
    id,
    conversationId,
    role,
    agentId: role === 'agent' ? 'ag_old' : null,
    parts: [{ type: 'text', content: id }],
    status: 'complete',
    parentMessageId: null,
    mentionedAgentIds: [],
    runId,
    usage: null,
    createdAt: role === 'user' ? 1 : 2,
  })
}

function buildSnapshot(runId: string, conversationId: string, agentId: string) {
  return {
    runId,
    conversationId,
    agent: {
      id: agentId,
      name: agentId,
      adapterName: 'custom' as const,
      modelProvider: 'openai' as const,
      modelId: 'gpt-test',
      isOrchestrator: false,
    },
    workspace: {
      mode: 'sandbox' as const,
      effectiveCwd: dataDir,
      boundPath: null,
    },
    prompt: {
      overridePrompt: false,
      overrideSystemPrompt: false,
      userPromptChars: 4,
      effectivePromptChars: 4,
      systemPromptChars: 10,
      systemPromptSections: [
        { kind: 'workspace_info' as const, chars: 10, tokenEstimate: 3, present: true },
      ],
    },
    context: {
      summaryInjected: false,
      summaryId: null,
      workspaceMemoryInjected: false,
      workspaceMemoryNoteCount: 0,
      historyInjected: false,
      historyMessageCount: 0,
      historyTokenBudget: null,
      historyTokenEstimate: null,
    },
    tools: {
      toolNames: ['web_fetch'],
      externalMcpServers: [
        { id: 'mcp_1', name: 'github', trust: 'ask' as const, envKeys: ['API_TOKEN'] },
      ],
      skills: [],
    },
    attachments: [],
  }
}
