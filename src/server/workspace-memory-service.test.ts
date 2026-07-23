import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

let dataDir: string
let service: typeof import('./workspace-memory-service')
let sessionStore: typeof import('./adapters/session-store')
let dbClient: typeof import('@/db/client')

type DbClient = typeof import('@/db/client')

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-workspace-memory-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  vi.resetModules()

  service = await import('./workspace-memory-service')
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
  await dbClient.db.delete(dbClient.schema.workspaceMemories)
  await dbClient.db.delete(dbClient.schema.conversations)
  await dbClient.db.delete(dbClient.schema.agents)
})

describe('workspace memory service', () => {
  it('creates and lists memories scoped to a conversation', async () => {
    await seedAgent(dbClient, 'ag_memory')
    await seedConversation(dbClient, 'conv_a', ['ag_memory'])
    await seedConversation(dbClient, 'conv_b', ['ag_memory'])

    const first = await service.createWorkspaceMemory({
      conversationId: 'conv_a',
      title: ' Build command ',
      content: ' pnpm typecheck ',
    })
    await service.createWorkspaceMemory({
      conversationId: 'conv_b',
      title: 'Other',
      content: 'Other conversation',
    })

    expect(first.title).toBe('Build command')
    expect(first.content).toBe('pnpm typecheck')
    const list = await service.listWorkspaceMemories('conv_a')
    expect(list.map((item) => item.id)).toEqual([first.id])
  })

  it('validates title/content and conversation limits', async () => {
    await seedAgent(dbClient, 'ag_limits')
    await seedConversation(dbClient, 'conv_limits', ['ag_limits'])

    await expect(
      service.createWorkspaceMemory({ conversationId: 'conv_limits', title: ' ', content: 'content' }),
    ).rejects.toThrow('title is required')
    await expect(
      service.createWorkspaceMemory({ conversationId: 'conv_limits', title: 'title', content: ' ' }),
    ).rejects.toThrow('content is required')

    for (let i = 0; i < service.MAX_MEMORIES_PER_CONVERSATION; i += 1) {
      await service.createWorkspaceMemory({
        conversationId: 'conv_limits',
        title: `note ${i}`,
        content: 'content',
      })
    }

    await expect(
      service.createWorkspaceMemory({ conversationId: 'conv_limits', title: 'overflow', content: 'content' }),
    ).rejects.toThrow('limit reached')
  })

  it('prevents cross-conversation update and delete', async () => {
    await seedAgent(dbClient, 'ag_scope')
    await seedConversation(dbClient, 'conv_owner', ['ag_scope'])
    await seedConversation(dbClient, 'conv_other', ['ag_scope'])
    const memory = await service.createWorkspaceMemory({
      conversationId: 'conv_owner',
      title: 'Owner note',
      content: 'Owner content',
    })

    await expect(
      service.updateWorkspaceMemory('conv_other', memory.id, { title: 'Wrong' }),
    ).rejects.toThrow('not found')
    await expect(service.deleteWorkspaceMemory('conv_other', memory.id)).rejects.toThrow('not found')

    const rows = await dbClient.db
      .select()
      .from(dbClient.schema.workspaceMemories)
      .where(eq(dbClient.schema.workspaceMemories.id, memory.id))
    expect(rows).toHaveLength(1)
  })

  it('builds a bounded XML-escaped prompt block with pinned memories first', async () => {
    await seedAgent(dbClient, 'ag_prompt')
    await seedConversation(dbClient, 'conv_prompt', ['ag_prompt'])
    await service.createWorkspaceMemory({
      conversationId: 'conv_prompt',
      title: 'normal',
      content: 'normal content',
    })
    const pinned = await service.createWorkspaceMemory({
      conversationId: 'conv_prompt',
      title: 'Pinned <rules>',
      content: 'Use pnpm && escape <xml>',
      pinned: true,
    })

    const block = await service.buildWorkspaceMemoryBlock('conv_prompt', { maxEntries: 1, tokenBudget: 100 })

    expect(block).toContain('<workspace_memory>')
    expect(block).toContain(`id="${pinned.id}"`)
    expect(block).toContain('Pinned &lt;rules&gt;')
    expect(block).toContain('Use pnpm &amp;&amp; escape &lt;xml&gt;')
    expect(block).not.toContain('normal content')
  })

  it('returns null when there is no memory', async () => {
    await seedAgent(dbClient, 'ag_empty_memory')
    await seedConversation(dbClient, 'conv_empty_memory', ['ag_empty_memory'])

    await expect(service.buildWorkspaceMemoryBlock('conv_empty_memory')).resolves.toBeNull()
  })

  it('clears SDK sessions after memory changes', async () => {
    await seedAgent(dbClient, 'ag_sessions')
    await seedConversation(dbClient, 'conv_sessions', ['ag_sessions'])
    sessionStore.claudeCodeSessions.set('conv_sessions', 'claude-session')
    sessionStore.codexSessions.set('conv_sessions:ag_sessions', 'codex-session')

    const memory = await service.createWorkspaceMemory({
      conversationId: 'conv_sessions',
      title: 'Sessions',
      content: 'Clear sessions',
    })

    expect(sessionStore.claudeCodeSessions.has('conv_sessions')).toBe(false)
    expect(sessionStore.codexSessions.has('conv_sessions:ag_sessions')).toBe(false)

    sessionStore.claudeCodeSessions.set('conv_sessions', 'claude-session')
    sessionStore.codexSessions.set('conv_sessions:ag_sessions', 'codex-session')
    await service.updateWorkspaceMemory('conv_sessions', memory.id, { pinned: true })
    expect(sessionStore.claudeCodeSessions.has('conv_sessions')).toBe(false)
    expect(sessionStore.codexSessions.has('conv_sessions:ag_sessions')).toBe(false)

    sessionStore.claudeCodeSessions.set('conv_sessions', 'claude-session')
    sessionStore.codexSessions.set('conv_sessions:ag_sessions', 'codex-session')
    await service.deleteWorkspaceMemory('conv_sessions', memory.id)
    expect(sessionStore.claudeCodeSessions.has('conv_sessions')).toBe(false)
    expect(sessionStore.codexSessions.has('conv_sessions:ag_sessions')).toBe(false)
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
