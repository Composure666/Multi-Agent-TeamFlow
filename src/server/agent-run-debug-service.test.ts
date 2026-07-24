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
    startedAt: 1,
    finishedAt: 2,
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
