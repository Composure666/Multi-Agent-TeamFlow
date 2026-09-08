import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

let dataDir: string
let bash: typeof import('./bash')
let terminalService: typeof import('../terminal-session-service')
let dbClient: typeof import('@/db/client')

type DbClient = typeof import('@/db/client')

class FakePtyProcess extends EventEmitter {
  onData(listener: (data: string) => void): { dispose: () => void } {
    this.on('data', listener)
    return { dispose: () => this.off('data', listener) }
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose: () => void } {
    this.on('exit', listener)
    return { dispose: () => this.off('exit', listener) }
  }

  write(): void {}

  kill(): void {
    this.emit('exit', { exitCode: 130, signal: 15 })
  }

  emitData(data: string): void {
    this.emit('data', data)
  }

  emitExit(exitCode: number): void {
    this.emit('exit', { exitCode })
  }
}

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-bash-terminal-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  vi.resetModules()

  bash = await import('./bash')
  terminalService = await import('../terminal-session-service')
  dbClient = await import('@/db/client')
})

afterAll(() => {
  dbClient?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
})

beforeEach(async () => {
  await dbClient.db.delete(dbClient.schema.terminalEvents)
  await dbClient.db.delete(dbClient.schema.terminalSessions)
  await dbClient.db.delete(dbClient.schema.workspaces)
  await dbClient.db.delete(dbClient.schema.agentRuns)
  await dbClient.db.delete(dbClient.schema.conversations)
  await dbClient.db.delete(dbClient.schema.agents)
  terminalService.resetTerminalPtyFactoryForTests()
})

describe('bash terminal integration', () => {
  it('executes managed bash commands through a terminal session', async () => {
    await seedAgent(dbClient, 'ag_bash')
    await seedConversation(dbClient, 'conv_bash', ['ag_bash'])
    await seedWorkspace(dbClient, 'conv_bash', dataDir)
    await seedRun(dbClient, 'run_bash', 'conv_bash', 'ag_bash')
    const fake = new FakePtyProcess()
    terminalService.setTerminalPtyFactoryForTests({ spawn: () => fake })

    const resultPromise = bash.executeBashCommand(
      { command: 'node -e "console.log(123)"' },
      {
        conversationId: 'conv_bash',
        workspacePath: dataDir,
        agentId: 'ag_bash',
        runId: 'run_bash',
        toolCallId: 'call_bash',
        abortSignal: new AbortController().signal,
      },
    )
    await waitForTerminalSessions('conv_bash', 'run_bash', 1)
    fake.emitData('123\r\n')
    fake.emitExit(0)

    const result = await resultPromise
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      command: 'node -e "console.log(123)"',
      cwd: dataDir,
      exitCode: 0,
      output: '123\r\n',
      sessionId: expect.stringMatching(/^term_/),
    })

    const sessions = await terminalService.listTerminalSessionsForRun('conv_bash', 'run_bash')
    expect(sessions[0]).toMatchObject({
      toolCallId: 'call_bash',
      status: 'exited',
    })
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
    toolNames: ['bash'],
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
    fsWriteApprovalMode: 'auto',
    createdAt: 1,
    updatedAt: 1,
  })
}

async function seedWorkspace(dbClient: DbClient, conversationId: string, rootPath: string) {
  await dbClient.db.insert(dbClient.schema.workspaces).values({
    id: `ws_${conversationId}`,
    conversationId,
    rootPath,
    mode: 'local',
    boundPath: rootPath,
    createdAt: 1,
  })
}

async function seedRun(
  dbClient: DbClient,
  id: string,
  conversationId: string,
  agentId: string,
) {
  await dbClient.db.insert(dbClient.schema.agentRuns).values({
    id,
    conversationId,
    agentId,
    triggerMessageId: null,
    status: 'running',
    error: null,
    parentRunId: null,
    usage: null,
    startedAt: 1,
    finishedAt: null,
  })
}

async function waitForTerminalSessions(
  conversationId: string,
  runId: string,
  count: number,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const sessions = await terminalService.listTerminalSessionsForRun(conversationId, runId)
    if (sessions.length >= count) return sessions
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return terminalService.listTerminalSessionsForRun(conversationId, runId)
}
