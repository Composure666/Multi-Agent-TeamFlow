import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { StreamEvent } from '@/shared/types'

let dataDir: string
let service: typeof import('./terminal-session-service')
let dbClient: typeof import('@/db/client')
let eventBusModule: typeof import('./event-bus')

type DbClient = typeof import('@/db/client')

class FakePtyProcess extends EventEmitter {
  readonly pid = 1001
  readonly writes: string[] = []
  killed = false

  onData(listener: (data: string) => void): { dispose: () => void } {
    this.on('data', listener)
    return { dispose: () => this.off('data', listener) }
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose: () => void } {
    this.on('exit', listener)
    return { dispose: () => this.off('exit', listener) }
  }

  write(data: string): void {
    this.writes.push(data)
  }

  kill(): void {
    this.killed = true
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
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-terminal-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  vi.resetModules()

  service = await import('./terminal-session-service')
  dbClient = await import('@/db/client')
  eventBusModule = await import('./event-bus')
})

afterAll(() => {
  dbClient?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
})

beforeEach(async () => {
  await dbClient.db.delete(dbClient.schema.terminalEvents)
  await dbClient.db.delete(dbClient.schema.terminalSessions)
  await dbClient.db.delete(dbClient.schema.agentRuns)
  await dbClient.db.delete(dbClient.schema.conversations)
  await dbClient.db.delete(dbClient.schema.agents)
  service.resetTerminalPtyFactoryForTests()
})

describe('terminal session service', () => {
  it('records a PTY command session and publishes terminal lifecycle events', async () => {
    await seedAgent(dbClient, 'ag_terminal')
    await seedConversation(dbClient, 'conv_terminal', ['ag_terminal'])
    await seedRun(dbClient, 'run_terminal', 'conv_terminal', 'ag_terminal')
    const fake = new FakePtyProcess()
    service.setTerminalPtyFactoryForTests({
      spawn: () => fake,
    })
    const events: StreamEvent[] = []
    const unsubscribe = eventBusModule.eventBus.subscribe((event) => events.push(event))

    const resultPromise = service.runTerminalCommand({
      conversationId: 'conv_terminal',
      runId: 'run_terminal',
      parentRunId: null,
      agentId: 'ag_terminal',
      taskId: 'task_1',
      toolCallId: 'call_terminal',
      shell: 'pwsh',
      shellArgs: ['-NoProfile', '-Command', 'node -e "console.log(1)"'],
      command: 'node -e "console.log(1)"',
      cwd: dataDir,
      timeoutMs: 30_000,
      abortSignal: new AbortController().signal,
    })
    const [session] = await waitForTerminalSessions('conv_terminal', 'run_terminal', 1)

    fake.emitData('hello\r\n')
    fake.emitExit(0)
    const result = await resultPromise
    unsubscribe()

    expect(result).toMatchObject({
      exitCode: 0,
      output: 'hello\r\n',
      timedOut: false,
      truncated: false,
    })
    const sessions = await service.listTerminalSessionsForRun('conv_terminal', 'run_terminal')
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      conversationId: 'conv_terminal',
      runId: 'run_terminal',
      agentId: 'ag_terminal',
      toolCallId: 'call_terminal',
      status: 'exited',
      exitCode: 0,
      cwd: dataDir,
    })
    const terminalEvents = await service.getTerminalEventsForSession('conv_terminal', session.id)
    expect(terminalEvents.map((event) => event.type)).toEqual([
      'terminal.started',
      'terminal.output',
      'terminal.exited',
    ])
    expect(terminalEvents[1]).toMatchObject({ stream: 'stdout', text: 'hello\r\n', seq: 2 })
    expect(events.map((event) => event.type)).toEqual([
      'terminal.started',
      'terminal.output',
      'terminal.exited',
    ])
  })

  it('writes stdin to a running session and records terminal.input', async () => {
    await seedAgent(dbClient, 'ag_terminal')
    await seedConversation(dbClient, 'conv_terminal', ['ag_terminal'])
    await seedRun(dbClient, 'run_terminal', 'conv_terminal', 'ag_terminal')
    const fake = new FakePtyProcess()
    service.setTerminalPtyFactoryForTests({
      spawn: () => fake,
    })

    const resultPromise = service.runTerminalCommand({
      conversationId: 'conv_terminal',
      runId: 'run_terminal',
      parentRunId: null,
      agentId: 'ag_terminal',
      taskId: null,
      toolCallId: 'call_terminal',
      shell: 'sh',
      shellArgs: ['-c', 'read value; echo $value'],
      command: 'read value; echo $value',
      cwd: dataDir,
      timeoutMs: 30_000,
      abortSignal: new AbortController().signal,
    })
    const [session] = await waitForTerminalSessions('conv_terminal', 'run_terminal', 1)

    await service.writeTerminalInput({
      conversationId: 'conv_terminal',
      sessionId: session.id,
      input: 'typed value\n',
    })
    fake.emitData('typed value\r\n')
    fake.emitExit(0)
    await resultPromise

    expect(fake.writes).toEqual(['typed value\n'])
    const terminalEvents = await service.getTerminalEventsForSession('conv_terminal', session.id)
    expect(terminalEvents.map((event) => event.type)).toEqual([
      'terminal.started',
      'terminal.input',
      'terminal.output',
      'terminal.exited',
    ])
    expect(terminalEvents[1]).toMatchObject({ text: 'typed value\n', seq: 2 })
  })

  it('rejects cross-conversation terminal access', async () => {
    await seedAgent(dbClient, 'ag_terminal')
    await seedConversation(dbClient, 'conv_owner', ['ag_terminal'])
    await seedConversation(dbClient, 'conv_other', ['ag_terminal'])
    await seedRun(dbClient, 'run_owner', 'conv_owner', 'ag_terminal')
    const fake = new FakePtyProcess()
    service.setTerminalPtyFactoryForTests({
      spawn: () => fake,
    })
    const resultPromise = service.runTerminalCommand({
      conversationId: 'conv_owner',
      runId: 'run_owner',
      parentRunId: null,
      agentId: 'ag_terminal',
      taskId: null,
      toolCallId: 'call_terminal',
      shell: 'sh',
      shellArgs: ['-c', 'echo owner'],
      command: 'echo owner',
      cwd: dataDir,
      timeoutMs: 30_000,
      abortSignal: new AbortController().signal,
    })
    const [session] = await waitForTerminalSessions('conv_owner', 'run_owner', 1)

    await expect(service.getTerminalEventsForSession('conv_other', session.id)).rejects.toThrow('not found')
    await expect(service.writeTerminalInput({
      conversationId: 'conv_other',
      sessionId: session.id,
      input: 'nope\n',
    })).rejects.toThrow('not found')

    fake.emitExit(0)
    await resultPromise
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

async function waitForTerminalSessions(
  conversationId: string,
  runId: string,
  count: number,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const sessions = await service.listTerminalSessionsForRun(conversationId, runId)
    if (sessions.length >= count) {
      const events = await service.getTerminalEventsForSession(conversationId, sessions[0].id)
      if (events.some((event) => event.type === 'terminal.started')) return sessions
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return service.listTerminalSessionsForRun(conversationId, runId)
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
