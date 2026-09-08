import { and, desc, eq } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type { TerminalEventRow, TerminalSessionRow } from '@/db/schema'
import { eventBus } from '@/server/event-bus'
import { newTerminalEventId, newTerminalSessionId } from '@/server/ids'
import type {
  TerminalEventRecord,
  TerminalEventStream,
  TerminalEventType,
  TerminalSessionRecord,
  TerminalSessionStatus,
} from '@/shared/types'

const MAX_TERMINAL_CHUNK_CHARS = 8_000
const MAX_PERSISTED_SESSION_CHARS = 200_000

interface TerminalPtyProcess {
  readonly pid?: number
  onData(listener: (data: string) => void): { dispose: () => void }
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose: () => void }
  write(data: string): void
  kill(signal?: string): void
}

interface TerminalPtyFactory {
  spawn(shell: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; cols: number; rows: number }): TerminalPtyProcess
}

interface RunningTerminalSession {
  child: TerminalPtyProcess
  enqueueEmit(
    type: TerminalEventType,
    stream: TerminalEventStream,
    text: string,
    payload?: Record<string, unknown>,
  ): Promise<void>
}

export interface RunTerminalCommandArgs {
  conversationId: string
  runId: string
  parentRunId: string | null
  agentId: string
  taskId: string | null
  toolCallId: string | null
  shell: string
  shellArgs: string[]
  command: string
  cwd: string
  timeoutMs: number
  abortSignal: AbortSignal
}

export interface RunTerminalCommandResult {
  sessionId: string
  cwd: string
  command: string
  shell: string
  exitCode: number | null
  signal: string | null
  output: string
  truncated: boolean
  timedOut: boolean
}

const runningSessions = new Map<string, RunningTerminalSession>()
let testPtyFactory: TerminalPtyFactory | null = null

export function setTerminalPtyFactoryForTests(factory: TerminalPtyFactory): void {
  testPtyFactory = factory
}

export function resetTerminalPtyFactoryForTests(): void {
  testPtyFactory = null
  runningSessions.clear()
}

export async function runTerminalCommand(args: RunTerminalCommandArgs): Promise<RunTerminalCommandResult> {
  await assertRunInConversation(args.conversationId, args.runId)
  const sessionId = newTerminalSessionId()
  const startedAt = Date.now()
  await db.insert(schema.terminalSessions).values({
    id: sessionId,
    conversationId: args.conversationId,
    runId: args.runId,
    parentRunId: args.parentRunId,
    agentId: args.agentId,
    taskId: args.taskId,
    toolCallId: args.toolCallId,
    shell: args.shell,
    cwd: args.cwd,
    command: args.command,
    status: 'running',
    exitCode: null,
    signal: null,
    startedAt,
    endedAt: null,
  })

  let seq = 0
  let persistedChars = 0
  let output = ''
  let truncated = false
  let timedOut = false
  let settled = false
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null
  let eventQueue = Promise.resolve()

  const emit = async (
    type: TerminalEventType,
    stream: TerminalEventStream,
    text: string,
    payload: Record<string, unknown> = {},
  ) => {
    seq += 1
    const clipped = text.length > MAX_TERMINAL_CHUNK_CHARS
      ? text.slice(0, MAX_TERMINAL_CHUNK_CHARS)
      : text
    const wouldPersist = persistedChars + clipped.length <= MAX_PERSISTED_SESSION_CHARS
    const persistedText = wouldPersist ? clipped : ''
    if (!wouldPersist) truncated = true
    else persistedChars += persistedText.length

    const eventPayload = {
      ...payload,
      ...(text.length > MAX_TERMINAL_CHUNK_CHARS ? { chunkTruncated: true } : {}),
      ...(!wouldPersist ? { persistedTruncated: true } : {}),
    }
    const row = await db.insert(schema.terminalEvents).values({
      id: newTerminalEventId(),
      sessionId,
      conversationId: args.conversationId,
      runId: args.runId,
      agentId: args.agentId,
      taskId: args.taskId,
      toolCallId: args.toolCallId,
      type,
      stream,
      text: persistedText,
      payload: eventPayload,
      seq,
      createdAt: Date.now(),
    }).returning()
    const eventId = row[0]?.id

    eventBus.publish({
      type,
      conversationId: args.conversationId,
      timestamp: Date.now(),
      sessionId,
      runId: args.runId,
      parentRunId: args.parentRunId,
      agentId: args.agentId,
      taskId: args.taskId,
      toolCallId: args.toolCallId,
      shell: args.shell,
      cwd: args.cwd,
      command: args.command,
      stream,
      text: clipped,
      seq,
      payload: eventPayload,
      ...(eventId ? { terminalEventId: eventId } : {}),
    })
  }

  const enqueueEmit = (
    type: TerminalEventType,
    stream: TerminalEventStream,
    text: string,
    payload: Record<string, unknown> = {},
  ) => {
    eventQueue = eventQueue.then(() => emit(type, stream, text, payload))
    return eventQueue
  }

  return new Promise<RunTerminalCommandResult>((resolve) => {
    const finish = async (status: TerminalSessionStatus, exitCode: number | null, signal: string | null) => {
      if (settled) return
      settled = true
      if (timeoutTimer) clearTimeout(timeoutTimer)
      args.abortSignal.removeEventListener('abort', onAbort)
      runningSessions.delete(sessionId)
      const endedAt = Date.now()
      await db.update(schema.terminalSessions)
        .set({ status, exitCode, signal, endedAt })
        .where(eq(schema.terminalSessions.id, sessionId))
      await enqueueEmit('terminal.exited', 'stdout', '', { status, exitCode, signal, timedOut, truncated })
      await eventQueue
      resolve({
        sessionId,
        cwd: args.cwd,
        command: args.command,
        shell: args.shell,
        exitCode,
        signal,
        output,
        truncated,
        timedOut,
      })
    }

    const onAbort = () => {
      const running = runningSessions.get(sessionId)
      running?.child.kill()
      void finish('aborted', null, 'abort')
    }

    void (async () => {
      try {
        const child = await getPtyFactory().spawn(args.shell, args.shellArgs, {
          cwd: args.cwd,
          env: process.env,
          cols: 120,
          rows: 30,
        })
        runningSessions.set(sessionId, { child, enqueueEmit })
        await enqueueEmit('terminal.started', 'stdout', '', { ptyMerged: true })
        child.onData((data) => {
          if (output.length + data.length <= MAX_PERSISTED_SESSION_CHARS) {
            output += data
          } else if (!truncated) {
            output = (output + data).slice(0, MAX_PERSISTED_SESSION_CHARS)
            truncated = true
          }
          void enqueueEmit('terminal.output', 'stdout', data, { ptyMerged: true })
        })
        child.onExit((event) => {
          void finish('exited', event.exitCode, event.signal === undefined ? null : String(event.signal))
        })
        args.abortSignal.addEventListener('abort', onAbort, { once: true })
        timeoutTimer = setTimeout(() => {
          timedOut = true
          child.kill()
          void finish('failed', null, 'timeout')
        }, args.timeoutMs)
      } catch (err) {
        await enqueueEmit('terminal.error', 'stderr', err instanceof Error ? err.message : String(err))
        await finish('failed', null, 'spawn_error')
      }
    })()
  })
}

export async function writeTerminalInput(args: {
  conversationId: string
  sessionId: string
  input: string
}): Promise<TerminalEventRecord> {
  const session = await getTerminalSession(args.conversationId, args.sessionId)
  if (session.status !== 'running') throw new Error(`Terminal session is not running: ${args.sessionId}`)
  const running = runningSessions.get(args.sessionId)
  if (!running) throw new Error(`Terminal session process is not available: ${args.sessionId}`)
  running.child.write(args.input)
  await running.enqueueEmit('terminal.input', 'stdin', args.input)
  const rows = await db.query.terminalEvents.findMany({
    where: and(
      eq(schema.terminalEvents.conversationId, args.conversationId),
      eq(schema.terminalEvents.sessionId, args.sessionId),
      eq(schema.terminalEvents.type, 'terminal.input'),
    ),
    orderBy: [desc(schema.terminalEvents.seq)],
    limit: 1,
  })
  const row = rows[0]
  if (!row) {
    throw new Error(`Terminal input event was not recorded for session: ${args.sessionId}`)
  }
  return toTerminalEventRecord(row)
}

export async function listTerminalSessionsForRun(
  conversationId: string,
  runId: string,
): Promise<TerminalSessionRecord[]> {
  await assertRunInConversation(conversationId, runId)
  const rows = await db.query.terminalSessions.findMany({
    where: and(
      eq(schema.terminalSessions.conversationId, conversationId),
      eq(schema.terminalSessions.runId, runId),
    ),
    orderBy: [schema.terminalSessions.startedAt],
  })
  return rows.map(toTerminalSessionRecord)
}

export async function getTerminalEventsForSession(
  conversationId: string,
  sessionId: string,
): Promise<TerminalEventRecord[]> {
  await getTerminalSession(conversationId, sessionId)
  const rows = await db.query.terminalEvents.findMany({
    where: and(
      eq(schema.terminalEvents.conversationId, conversationId),
      eq(schema.terminalEvents.sessionId, sessionId),
    ),
    orderBy: [schema.terminalEvents.seq],
  })
  return rows.map(toTerminalEventRecord)
}

async function assertRunInConversation(conversationId: string, runId: string): Promise<void> {
  const run = await db.query.agentRuns.findFirst({
    where: and(eq(schema.agentRuns.id, runId), eq(schema.agentRuns.conversationId, conversationId)),
    columns: { id: true },
  })
  if (!run) throw new Error(`Agent run not found: ${runId}`)
}

async function getTerminalSession(conversationId: string, sessionId: string): Promise<TerminalSessionRecord> {
  const row = await db.query.terminalSessions.findFirst({
    where: and(
      eq(schema.terminalSessions.id, sessionId),
      eq(schema.terminalSessions.conversationId, conversationId),
    ),
  })
  if (!row) throw new Error(`Terminal session not found: ${sessionId}`)
  return toTerminalSessionRecord(row)
}

function getPtyFactory(): TerminalPtyFactory {
  if (testPtyFactory) return testPtyFactory
  return {
    spawn(shell, args, options) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pty = require('node-pty') as TerminalPtyFactory
      return pty.spawn(shell, args, options)
    },
  }
}

function toTerminalSessionRecord(row: TerminalSessionRow): TerminalSessionRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    runId: row.runId,
    parentRunId: row.parentRunId,
    agentId: row.agentId,
    taskId: row.taskId,
    toolCallId: row.toolCallId,
    shell: row.shell,
    cwd: row.cwd,
    command: row.command,
    status: row.status,
    exitCode: row.exitCode,
    signal: row.signal,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  }
}

function toTerminalEventRecord(row: TerminalEventRow): TerminalEventRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    conversationId: row.conversationId,
    runId: row.runId,
    agentId: row.agentId,
    taskId: row.taskId,
    toolCallId: row.toolCallId,
    type: row.type,
    stream: row.stream,
    text: row.text,
    payload: row.payload,
    seq: row.seq,
    createdAt: row.createdAt,
  }
}
