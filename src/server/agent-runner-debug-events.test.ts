import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

let dataDir: string
let runner: typeof import('./agent-runner')
let service: typeof import('./agent-run-debug-service')
let dbClient: typeof import('@/db/client')

type DbClient = typeof import('@/db/client')

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-runner-debug-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  vi.resetModules()

  runner = await import('./agent-runner')
  service = await import('./agent-run-debug-service')
  dbClient = await import('@/db/client')
})

afterAll(() => {
  dbClient?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
})

beforeEach(async () => {
  await dbClient.db.delete(dbClient.schema.agentRunDebugEvents)
  await dbClient.db.delete(dbClient.schema.agentRunDebugSnapshots)
  await dbClient.db.delete(dbClient.schema.messages)
  await dbClient.db.delete(dbClient.schema.agentRuns)
  await dbClient.db.delete(dbClient.schema.workspaces)
  await dbClient.db.delete(dbClient.schema.conversations)
  await dbClient.db.delete(dbClient.schema.agents)
})

describe('AgentRunner debug events', () => {
  it('records run and tool boundary events for a mock run', async () => {
    await seedAgent(dbClient, 'ag_debug')
    await seedConversation(dbClient, 'conv_debug', ['ag_debug'])
    await seedWorkspace(dbClient, 'conv_debug')
    await seedUserMessage(dbClient, 'msg_debug', 'conv_debug', '请执行工具')

    const { runId, promise } = runner.AgentRunner.run({
      agentId: 'ag_debug',
      conversationId: 'conv_debug',
      triggerMessageId: 'msg_debug',
    })

    await expect(promise).resolves.toMatchObject({ status: 'complete' })

    const events = await service.getAgentRunDebugEvents('conv_debug', runId)
    expect(events.map((event) => event.type)).toEqual([
      'run.debug.step.started',
      'run.debug.tool.started',
      'run.debug.tool.completed',
      'run.debug.step.completed',
    ])
    expect(events.find((event) => event.type === 'run.debug.tool.started')?.payload).toMatchObject({
      toolName: 'read_artifact',
    })
  })
})

async function seedAgent(dbClient: DbClient, id: string) {
  await dbClient.db.insert(dbClient.schema.agents).values({
    id,
    name: 'Debug Agent',
    avatar: 'D',
    description: 'test agent',
    capabilities: [],
    systemPrompt: 'test prompt',
    adapterName: 'mock',
    modelProvider: null,
    modelId: 'mock-model',
    apiKey: null,
    apiBaseUrl: null,
    toolNames: [],
    mcpServerIds: [],
    skillIds: [],
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

async function seedWorkspace(dbClient: DbClient, conversationId: string) {
  await dbClient.db.insert(dbClient.schema.workspaces).values({
    id: 'ws_debug',
    conversationId,
    rootPath: dataDir,
    mode: 'sandbox',
    boundPath: null,
    createdAt: 1,
  })
}

async function seedUserMessage(dbClient: DbClient, id: string, conversationId: string, content: string) {
  await dbClient.db.insert(dbClient.schema.messages).values({
    id,
    conversationId,
    role: 'user',
    agentId: null,
    parts: [{ type: 'text', content }],
    status: 'complete',
    parentMessageId: null,
    mentionedAgentIds: [],
    runId: null,
    usage: null,
    createdAt: 1,
  })
}
