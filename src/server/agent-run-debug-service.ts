import { and, desc, eq, inArray, lt, or } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type { AgentRunDebugEventRow, AgentRunDebugSnapshotRow, AgentRunRow, MessageRow } from '@/db/schema'
import { newAgentRunDebugEventId, newAgentRunDebugSnapshotId } from '@/server/ids'
import type {
  AgentRunDebugEventRecord,
  AgentRunDebugEventStatus,
  AgentRunDebugEventType,
  AgentRunDebugDetail,
  AgentRunDebugListItem,
  AgentRunDebugSnapshot,
  MessageRecord,
} from '@/shared/types'

export interface RecordAgentRunDebugSnapshotArgs {
  runId: string
  conversationId: string
  agentId: string
  snapshot: AgentRunDebugSnapshot
}

export interface RecordAgentRunDebugEventArgs {
  conversationId: string
  runId: string
  parentRunId?: string | null
  agentId?: string | null
  taskId?: string | null
  stepId?: string | null
  toolCallId?: string | null
  type: AgentRunDebugEventType
  status?: AgentRunDebugEventStatus | null
  payload: Record<string, unknown>
  createdAt?: number
}

export interface ListAgentRunsForConversationPageArgs {
  limit?: number
  before?: {
    startedAt: number
    runId: string
  }
}

export interface ListAgentRunsForConversationPageResult {
  runs: AgentRunDebugListItem[]
  hasMore: boolean
  nextCursor: {
    startedAt: number
    runId: string
  } | null
}

export async function recordAgentRunDebugSnapshot(
  args: RecordAgentRunDebugSnapshotArgs,
): Promise<AgentRunDebugSnapshotRow> {
  const existing = await db.query.agentRunDebugSnapshots.findFirst({
    where: eq(schema.agentRunDebugSnapshots.runId, args.runId),
  })
  if (existing) return existing

  const row = {
    id: newAgentRunDebugSnapshotId(),
    runId: args.runId,
    conversationId: args.conversationId,
    agentId: args.agentId,
    snapshot: args.snapshot,
    createdAt: Date.now(),
  }
  await db.insert(schema.agentRunDebugSnapshots).values(row)
  return row
}

export async function recordAgentRunDebugEvent(
  args: RecordAgentRunDebugEventArgs,
): Promise<AgentRunDebugEventRow> {
  const row = {
    id: newAgentRunDebugEventId(),
    conversationId: args.conversationId,
    runId: args.runId,
    parentRunId: args.parentRunId ?? null,
    agentId: args.agentId ?? null,
    taskId: args.taskId ?? null,
    stepId: args.stepId ?? null,
    toolCallId: args.toolCallId ?? null,
    type: args.type,
    status: args.status ?? null,
    payload: args.payload,
    createdAt: args.createdAt ?? Date.now(),
  }
  await db.insert(schema.agentRunDebugEvents).values(row)
  return row
}

export async function listAgentRunsForConversation(
  conversationId: string,
): Promise<AgentRunDebugListItem[]> {
  const runs: AgentRunDebugListItem[] = []
  let before: ListAgentRunsForConversationPageArgs['before']
  for (;;) {
    const page = await listAgentRunsForConversationPage(conversationId, { limit: 100, before })
    runs.push(...page.runs)
    if (!page.hasMore || page.nextCursor === null) return runs
    before = page.nextCursor
  }
}

export async function listAgentRunsForConversationPage(
  conversationId: string,
  args: ListAgentRunsForConversationPageArgs = {},
): Promise<ListAgentRunsForConversationPageResult> {
  const limit = Math.min(Math.max(args.limit ?? 30, 1), 100)
  const where = args.before
    ? and(
        eq(schema.agentRuns.conversationId, conversationId),
        or(
          lt(schema.agentRuns.startedAt, args.before.startedAt),
          and(
            eq(schema.agentRuns.startedAt, args.before.startedAt),
            lt(schema.agentRuns.id, args.before.runId),
          ),
        ),
      )
    : eq(schema.agentRuns.conversationId, conversationId)
  const runs = await db.query.agentRuns.findMany({
    where,
    orderBy: [desc(schema.agentRuns.startedAt), desc(schema.agentRuns.id)],
    limit: limit + 1,
  })
  const hasMore = runs.length > limit
  const pageRuns = hasMore ? runs.slice(0, limit) : runs
  const enriched = await enrichRuns(pageRuns)
  return {
    runs: enriched,
    hasMore,
    nextCursor: hasMore
      ? {
          startedAt: pageRuns[pageRuns.length - 1]?.startedAt ?? 0,
          runId: pageRuns[pageRuns.length - 1]?.id ?? '',
        }
      : null,
  }
}

export async function getAgentRunDebugEvents(
  conversationId: string,
  runId: string,
): Promise<AgentRunDebugEventRecord[]> {
  const run = await db.query.agentRuns.findFirst({
    where: and(eq(schema.agentRuns.id, runId), eq(schema.agentRuns.conversationId, conversationId)),
  })
  if (!run) throw new Error(`Agent run not found: ${runId}`)

  const events = await db.query.agentRunDebugEvents.findMany({
    where: and(eq(schema.agentRunDebugEvents.conversationId, conversationId), eq(schema.agentRunDebugEvents.runId, runId)),
    orderBy: [schema.agentRunDebugEvents.createdAt],
  })
  return events.map(toEventRecord)
}

export async function getAgentRunDebugEventsForConversation(
  conversationId: string,
): Promise<AgentRunDebugEventRecord[]> {
  const conversation = await db.query.conversations.findFirst({
    where: eq(schema.conversations.id, conversationId),
    columns: { id: true },
  })
  if (!conversation) throw new Error(`Conversation not found: ${conversationId}`)

  const events = await db.query.agentRunDebugEvents.findMany({
    where: eq(schema.agentRunDebugEvents.conversationId, conversationId),
    orderBy: [schema.agentRunDebugEvents.createdAt],
  })
  return events.map(toEventRecord)
}

export async function getAgentRunDebugDetail(
  conversationId: string,
  runId: string,
): Promise<AgentRunDebugDetail> {
  const run = await db.query.agentRuns.findFirst({
    where: and(eq(schema.agentRuns.id, runId), eq(schema.agentRuns.conversationId, conversationId)),
  })
  if (!run) throw new Error(`Agent run not found: ${runId}`)

  const [agentRun] = await enrichRuns([run])
  if (!agentRun) throw new Error(`Agent run not found after enrichment: ${runId}`)

  const snapshotRow = await db.query.agentRunDebugSnapshots.findFirst({
    where: and(
      eq(schema.agentRunDebugSnapshots.runId, runId),
      eq(schema.agentRunDebugSnapshots.conversationId, conversationId),
    ),
  })

  const triggerMessage = run.triggerMessageId
    ? await db.query.messages.findFirst({
        where: and(
          eq(schema.messages.id, run.triggerMessageId),
          eq(schema.messages.conversationId, conversationId),
        ),
      })
    : null

  const outputMessages = await db.query.messages.findMany({
    where: and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.runId, runId)),
    orderBy: [desc(schema.messages.createdAt)],
  })

  const childRows = await db.query.agentRuns.findMany({
    where: and(eq(schema.agentRuns.conversationId, conversationId), eq(schema.agentRuns.parentRunId, runId)),
    orderBy: [desc(schema.agentRuns.startedAt)],
  })
  const childrenRuns = await enrichRuns(childRows)

  const parentRows = run.parentRunId
    ? await db.query.agentRuns.findMany({
        where: and(
          eq(schema.agentRuns.conversationId, conversationId),
          eq(schema.agentRuns.id, run.parentRunId),
        ),
      })
    : []
  const [parentRun = null] = await enrichRuns(parentRows)

  return {
    agentRun,
    snapshot: snapshotRow?.snapshot ?? null,
    triggerMessage: triggerMessage ? toMessageRecord(triggerMessage) : null,
    outputMessages: outputMessages.map(toMessageRecord).reverse(),
    childrenRuns,
    parentRun,
  }
}

async function enrichRuns(runs: AgentRunRow[]): Promise<AgentRunDebugListItem[]> {
  if (runs.length === 0) return []

  const agentIds = [...new Set(runs.map((run) => run.agentId))]
  const runIds = runs.map((run) => run.id)
  const [agents, snapshots] = await Promise.all([
    db.query.agents.findMany({ where: inArray(schema.agents.id, agentIds) }),
    db.query.agentRunDebugSnapshots.findMany({
      where: inArray(schema.agentRunDebugSnapshots.runId, runIds),
      columns: { runId: true },
    }),
  ])
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]))
  const snapshotRunIds = new Set(snapshots.map((snapshot) => snapshot.runId))

  return runs.map((run) => {
    const agent = agentsById.get(run.agentId)
    return {
      id: run.id,
      conversationId: run.conversationId,
      agentId: run.agentId,
      agentName: agent?.name ?? null,
      adapterName: agent?.adapterName ?? null,
      modelId: agent?.modelId ?? null,
      triggerMessageId: run.triggerMessageId,
      parentRunId: run.parentRunId,
      status: run.status,
      error: run.error,
      usage: run.usage,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      hasDebugSnapshot: snapshotRunIds.has(run.id),
    }
  })
}

function toMessageRecord(row: MessageRow): MessageRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    agentId: row.agentId,
    parts: row.parts,
    status: row.status,
    parentMessageId: row.parentMessageId,
    mentionedAgentIds: row.mentionedAgentIds,
    runId: row.runId,
    usage: row.usage,
    createdAt: row.createdAt,
  }
}

function toEventRecord(row: AgentRunDebugEventRow): AgentRunDebugEventRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    runId: row.runId,
    parentRunId: row.parentRunId,
    agentId: row.agentId,
    taskId: row.taskId,
    stepId: row.stepId,
    toolCallId: row.toolCallId,
    type: row.type,
    status: row.status,
    payload: row.payload,
    createdAt: row.createdAt,
  }
}
