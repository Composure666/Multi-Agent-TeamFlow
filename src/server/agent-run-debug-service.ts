import { and, desc, eq, inArray } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type { AgentRunDebugSnapshotRow, AgentRunRow, MessageRow } from '@/db/schema'
import { newAgentRunDebugSnapshotId } from '@/server/ids'
import type {
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

export async function listAgentRunsForConversation(
  conversationId: string,
): Promise<AgentRunDebugListItem[]> {
  const runs = await db.query.agentRuns.findMany({
    where: eq(schema.agentRuns.conversationId, conversationId),
    orderBy: [desc(schema.agentRuns.startedAt)],
  })
  return enrichRuns(runs)
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
