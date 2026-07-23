import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

let dataDir: string
let service: typeof import('./context-compaction-service')
let sessionStore: typeof import('./adapters/session-store')
let dbClient: typeof import('@/db/client')

type DbClient = typeof import('@/db/client')

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-context-compaction-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  vi.resetModules()

  service = await import('./context-compaction-service')
  sessionStore = await import('./adapters/session-store')
  dbClient = await import('@/db/client')
})

afterAll(() => {
  dbClient?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
})

beforeEach(async () => {
  sessionStore.claudeCodeSessions.clear()
  sessionStore.codexSessions.clear()
  await dbClient.db.delete(dbClient.schema.contextSummaries)
  await dbClient.db.delete(dbClient.schema.messages)
  await dbClient.db.delete(dbClient.schema.conversations)
  await dbClient.db.delete(dbClient.schema.agents)
})

describe('context compaction service', () => {
  it('creates a summary, keeps original messages, and clears SDK sessions', async () => {
    await seedAgent(dbClient, 'ag_compact', 'Compact Agent')
    await seedConversation(dbClient, 'conv_compact', ['ag_compact'])
    for (let i = 1; i <= 8; i++) {
      await seedMessage(dbClient, 'conv_compact', `msg_${i}`, i * 10, i % 2 ? 'user' : 'agent', i % 2 ? null : 'ag_compact', `message ${i}`)
    }
    sessionStore.claudeCodeSessions.set('conv_compact', 'claude-session')
    sessionStore.codexSessions.set('conv_compact:ag_compact', 'codex-session')

    const result = await service.compactConversation('conv_compact')

    expect(result.summary.conversationId).toBe('conv_compact')
    expect(result.summary.coveredUntilMessageId).toBe('msg_2')
    expect(result.summary.sourceMessageCount).toBe(2)
    expect(result.summary.summary).toContain('message 1')
    expect(result.message.role).toBe('system')
    expect(sessionStore.claudeCodeSessions.has('conv_compact')).toBe(false)
    expect(sessionStore.codexSessions.has('conv_compact:ag_compact')).toBe(false)

    const messages = await dbClient.db
      .select()
      .from(dbClient.schema.messages)
      .where(eq(dbClient.schema.messages.conversationId, 'conv_compact'))
    expect(messages.map((message) => message.id)).toEqual(expect.arrayContaining(['msg_1', 'msg_2', result.message.id]))

    const summaries = await dbClient.db
      .select()
      .from(dbClient.schema.contextSummaries)
      .where(eq(dbClient.schema.contextSummaries.conversationId, 'conv_compact'))
    expect(summaries).toHaveLength(1)
  })

  it('excludes pinned and system messages from the compaction source', async () => {
    await seedAgent(dbClient, 'ag_filter', 'Filter Agent')
    await seedConversation(dbClient, 'conv_filter', ['ag_filter'], ['msg_pinned'])
    await seedMessage(dbClient, 'conv_filter', 'msg_pinned', 10, 'user', null, 'pinned should not be compacted')
    await seedMessage(dbClient, 'conv_filter', 'msg_system', 20, 'system', null, 'system should not be compacted')
    for (let i = 1; i <= 8; i++) {
      await seedMessage(dbClient, 'conv_filter', `msg_normal_${i}`, 30 + i, 'user', null, `normal message ${i}`)
    }

    const result = await service.compactConversation('conv_filter')

    expect(result.summary.sourceMessageCount).toBe(2)
    expect(result.summary.summary).not.toContain('pinned should not be compacted')
    expect(result.summary.summary).not.toContain('system should not be compacted')
    expect(result.summary.summary).toContain('normal message 1')
  })

  it('throws when there is no compactable history yet', async () => {
    await seedAgent(dbClient, 'ag_empty', 'Empty Agent')
    await seedConversation(dbClient, 'conv_empty', ['ag_empty'], ['msg_only'])
    await seedMessage(dbClient, 'conv_empty', 'msg_only', 10, 'user', null, 'only pinned message')

    await expect(service.compactConversation('conv_empty')).rejects.toThrow('No compactable history yet')
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
