import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

let dataDir: string
let context: typeof import('./conversation-context')
let dbClient: typeof import('@/db/client')

type DbClient = typeof import('@/db/client')

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-conversation-context-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  vi.resetModules()

  context = await import('./conversation-context')
  dbClient = await import('@/db/client')
})

afterAll(() => {
  dbClient?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
})

beforeEach(async () => {
  await dbClient.db.delete(dbClient.schema.contextSummaries)
  await dbClient.db.delete(dbClient.schema.messages)
  await dbClient.db.delete(dbClient.schema.conversations)
  await dbClient.db.delete(dbClient.schema.agents)
})

describe('conversation context', () => {
  it('injects the latest summary and skips covered unpinned messages', async () => {
    await seedAgent(dbClient, 'ag_context', 'Context Agent')
    await seedConversation(dbClient, 'conv_context', ['ag_context'])
    await seedMessage(dbClient, 'conv_context', 'msg_old', 10, 'user', null, 'covered old user message')
    await seedMessage(dbClient, 'conv_context', 'msg_boundary', 20, 'agent', 'ag_context', 'covered boundary reply')
    await seedMessage(dbClient, 'conv_context', 'msg_recent', 30, 'user', null, 'fresh user message')
    await dbClient.db.insert(dbClient.schema.contextSummaries).values({
      id: 'ctx_sum_1',
      conversationId: 'conv_context',
      summary: 'summary of old work',
      coveredUntilMessageId: 'msg_boundary',
      coveredUntilCreatedAt: 20,
      sourceMessageCount: 2,
      tokenEstimate: 6,
      modelProvider: null,
      modelId: null,
      createdAt: 100,
    })

    const snapshot = await context.buildPromptContextSnapshot('ag_context', 'conv_context')

    expect(snapshot.latestSummary?.id).toBe('ctx_sum_1')
    expect(snapshot.items.map((item) => item.sourceId)).toEqual(['ctx_sum_1', 'msg_recent'])
    expect(snapshot.messages.map((message) => message.content)).toEqual([
      '<conversation_summary covered_until_message_id="msg_boundary">\nsummary of old work\n</conversation_summary>',
      'fresh user message',
    ])
  })

  it('keeps pinned messages even when they are covered by a summary', async () => {
    await seedAgent(dbClient, 'ag_pinned', 'Pinned Agent')
    await seedConversation(dbClient, 'conv_pinned', ['ag_pinned'], ['msg_pinned'])
    await seedMessage(dbClient, 'conv_pinned', 'msg_pinned', 10, 'user', null, 'important pinned message')
    await seedMessage(dbClient, 'conv_pinned', 'msg_boundary', 20, 'agent', 'ag_pinned', 'covered boundary reply')
    await seedMessage(dbClient, 'conv_pinned', 'msg_recent', 30, 'user', null, 'new question')
    await dbClient.db.insert(dbClient.schema.contextSummaries).values({
      id: 'ctx_sum_pinned',
      conversationId: 'conv_pinned',
      summary: 'summary that covers pinned message',
      coveredUntilMessageId: 'msg_boundary',
      coveredUntilCreatedAt: 20,
      sourceMessageCount: 2,
      tokenEstimate: 8,
      modelProvider: null,
      modelId: null,
      createdAt: 100,
    })

    const snapshot = await context.buildPromptContextSnapshot('ag_pinned', 'conv_pinned')

    expect(snapshot.items.map((item) => [item.sourceId, item.isPinned])).toEqual([
      ['ctx_sum_pinned', true],
      ['msg_pinned', true],
      ['msg_recent', false],
    ])
    expect(snapshot.messages.map((message) => message.content)).toEqual([
      '<conversation_summary covered_until_message_id="msg_boundary">\nsummary that covers pinned message\n</conversation_summary>',
      'important pinned message',
      'new question',
    ])
  })

  it('trims non-pinned messages first when token budget is exceeded', async () => {
    await seedAgent(dbClient, 'ag_budget', 'Budget Agent')
    await seedConversation(dbClient, 'conv_budget', ['ag_budget'], ['msg_pinned_budget'])
    await seedMessage(dbClient, 'conv_budget', 'msg_old_budget', 10, 'user', null, 'older non pinned message with enough text to trim')
    await seedMessage(dbClient, 'conv_budget', 'msg_pinned_budget', 20, 'user', null, 'pinned budget message')
    await seedMessage(dbClient, 'conv_budget', 'msg_recent_budget', 30, 'user', null, 'recent non pinned message with enough text to trim')

    const snapshot = await context.buildPromptContextSnapshot('ag_budget', 'conv_budget', { tokenBudget: 1 })

    expect(snapshot.items.find((item) => item.sourceId === 'msg_pinned_budget')?.included).toBe(true)
    expect(snapshot.items.find((item) => item.sourceId === 'msg_old_budget')?.included).toBe(false)
    expect(snapshot.items.find((item) => item.sourceId === 'msg_recent_budget')?.included).toBe(false)
    expect(snapshot.messages.map((message) => message.content)).toEqual(['pinned budget message'])
  })

  it('renders other group agents as prefixed user messages', async () => {
    await seedAgent(dbClient, 'ag_current', 'Current Agent')
    await seedAgent(dbClient, 'ag_other', 'Other Agent')
    await seedConversation(dbClient, 'conv_group', ['ag_current', 'ag_other'])
    await seedMessage(dbClient, 'conv_group', 'msg_self', 10, 'agent', 'ag_current', 'self reply')
    await seedMessage(dbClient, 'conv_group', 'msg_other', 20, 'agent', 'ag_other', 'other reply')

    const history = await context.buildHistoryFor('ag_current', 'conv_group')

    expect(history).toEqual([
      { role: 'assistant', content: 'self reply' },
      { role: 'user', content: '[Other Agent] other reply' },
    ])
  })
})

async function seedAgent(dbClient: DbClient, id: string, name: string) {
  await dbClient.db.insert(dbClient.schema.agents).values({
    id,
    name,
    avatar: name.slice(0, 1),
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

async function seedConversation(
  dbClient: DbClient,
  id: string,
  agentIds: string[],
  pinnedMessageIds: string[] = [],
) {
  await dbClient.db.insert(dbClient.schema.conversations).values({
    id,
    title: id,
    mode: agentIds.length > 1 ? 'group' : 'single',
    agentIds,
    pinnedMessageIds,
    bookmarkedMessageIds: [],
    archived: false,
    pinnedAt: null,
    fsWriteApprovalMode: 'review',
    createdAt: 1,
    updatedAt: 1,
  })
}

async function seedMessage(
  dbClient: DbClient,
  conversationId: string,
  id: string,
  createdAt: number,
  role: 'user' | 'agent' | 'system',
  agentId: string | null,
  content: string,
) {
  await dbClient.db.insert(dbClient.schema.messages).values({
    id,
    conversationId,
    role,
    agentId,
    parts: [{ type: 'text', content }],
    status: 'complete',
    parentMessageId: null,
    mentionedAgentIds: [],
    runId: null,
    usage: null,
    createdAt,
  })
}
