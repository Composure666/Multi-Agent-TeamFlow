import { and, asc, desc, eq } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type { WorkspaceMemoryRow, WorkspaceMemorySource } from '@/db/schema'

import { clearClaudeCodeSession, clearCodexSession } from './adapters/session-store'
import { newWorkspaceMemoryId } from './ids'

export const MAX_MEMORY_TITLE_CHARS = 80
export const MAX_MEMORY_CONTENT_CHARS = 4000
export const MAX_MEMORIES_PER_CONVERSATION = 50
export const WORKSPACE_MEMORY_PROMPT_MAX_ENTRIES = 12
export const WORKSPACE_MEMORY_PROMPT_TOKEN_BUDGET = 2000

const TOKEN_TO_CHAR_RATIO = 4

export interface CreateWorkspaceMemoryArgs {
  conversationId: string
  title: string
  content: string
  pinned?: boolean
  source?: WorkspaceMemorySource
  createdByAgentId?: string | null
}

export interface WorkspaceMemoryPatch {
  title?: string
  content?: string
  pinned?: boolean
}

export interface BuildWorkspaceMemoryBlockOptions {
  maxEntries?: number
  tokenBudget?: number
}

export async function listWorkspaceMemories(conversationId: string): Promise<WorkspaceMemoryRow[]> {
  return db.query.workspaceMemories.findMany({
    where: eq(schema.workspaceMemories.conversationId, conversationId),
    orderBy: [desc(schema.workspaceMemories.pinned), desc(schema.workspaceMemories.updatedAt)],
  })
}

export async function createWorkspaceMemory(args: CreateWorkspaceMemoryArgs): Promise<WorkspaceMemoryRow> {
  await assertConversationExists(args.conversationId)

  const count = await db.query.workspaceMemories.findMany({
    where: eq(schema.workspaceMemories.conversationId, args.conversationId),
    columns: { id: true },
  })
  if (count.length >= MAX_MEMORIES_PER_CONVERSATION) {
    throw new Error(`Workspace memory limit reached for conversation: ${args.conversationId}`)
  }

  const now = Date.now()
  const row = {
    id: newWorkspaceMemoryId(),
    conversationId: args.conversationId,
    title: normalizeTitle(args.title),
    content: normalizeContent(args.content),
    source: args.source ?? 'user',
    createdByAgentId: args.createdByAgentId ?? null,
    pinned: args.pinned ?? false,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(schema.workspaceMemories).values(row)
  clearWorkspaceMemorySessions(args.conversationId)
  return row
}

export async function updateWorkspaceMemory(
  conversationId: string,
  memoryId: string,
  patch: WorkspaceMemoryPatch,
): Promise<WorkspaceMemoryRow> {
  const existing = await db.query.workspaceMemories.findFirst({
    where: and(
      eq(schema.workspaceMemories.id, memoryId),
      eq(schema.workspaceMemories.conversationId, conversationId),
    ),
  })
  if (!existing) throw new Error(`Workspace memory not found: ${memoryId}`)

  const next = {
    title: patch.title === undefined ? existing.title : normalizeTitle(patch.title),
    content: patch.content === undefined ? existing.content : normalizeContent(patch.content),
    pinned: patch.pinned ?? existing.pinned,
    updatedAt: Date.now(),
  }

  await db
    .update(schema.workspaceMemories)
    .set(next)
    .where(and(eq(schema.workspaceMemories.id, memoryId), eq(schema.workspaceMemories.conversationId, conversationId)))

  clearWorkspaceMemorySessions(conversationId)
  return { ...existing, ...next }
}

export async function deleteWorkspaceMemory(conversationId: string, memoryId: string): Promise<void> {
  const existing = await db.query.workspaceMemories.findFirst({
    where: and(
      eq(schema.workspaceMemories.id, memoryId),
      eq(schema.workspaceMemories.conversationId, conversationId),
    ),
  })
  if (!existing) throw new Error(`Workspace memory not found: ${memoryId}`)

  await db
    .delete(schema.workspaceMemories)
    .where(and(eq(schema.workspaceMemories.id, memoryId), eq(schema.workspaceMemories.conversationId, conversationId)))
  clearWorkspaceMemorySessions(conversationId)
}

export async function buildWorkspaceMemoryBlock(
  conversationId: string,
  options: BuildWorkspaceMemoryBlockOptions = {},
): Promise<string | null> {
  const maxEntries = options.maxEntries ?? WORKSPACE_MEMORY_PROMPT_MAX_ENTRIES
  const charBudget = (options.tokenBudget ?? WORKSPACE_MEMORY_PROMPT_TOKEN_BUDGET) * TOKEN_TO_CHAR_RATIO
  const rows = await db.query.workspaceMemories.findMany({
    where: eq(schema.workspaceMemories.conversationId, conversationId),
    orderBy: [desc(schema.workspaceMemories.pinned), desc(schema.workspaceMemories.updatedAt), asc(schema.workspaceMemories.createdAt)],
  })
  if (rows.length === 0 || maxEntries <= 0 || charBudget <= 0) return null

  let used = 0
  const notes: string[] = []
  for (const row of rows) {
    if (notes.length >= maxEntries) break
    const content = row.content.trim()
    if (!content) continue

    const available = charBudget - used
    if (available <= 0) break
    const clipped = content.length > available ? `${content.slice(0, Math.max(0, available - 1))}…` : content
    if (!clipped) break
    used += clipped.length

    notes.push([
      `  <note id="${escapeXml(row.id)}" title="${escapeXml(row.title)}" source="${escapeXml(row.source)}" pinned="${row.pinned ? 'true' : 'false'}">`,
      `    ${escapeXml(clipped)}`,
      '  </note>',
    ].join('\n'))
  }

  if (notes.length === 0) return null
  return ['<workspace_memory>', ...notes, '</workspace_memory>'].join('\n')
}

function normalizeTitle(value: string): string {
  const title = value.trim()
  if (!title) throw new Error('Workspace memory title is required')
  if (title.length > MAX_MEMORY_TITLE_CHARS) {
    throw new Error(`Workspace memory title must be <= ${MAX_MEMORY_TITLE_CHARS} characters`)
  }
  return title
}

function normalizeContent(value: string): string {
  const content = value.trim()
  if (!content) throw new Error('Workspace memory content is required')
  if (content.length > MAX_MEMORY_CONTENT_CHARS) {
    throw new Error(`Workspace memory content must be <= ${MAX_MEMORY_CONTENT_CHARS} characters`)
  }
  return content
}

function clearWorkspaceMemorySessions(conversationId: string): void {
  clearClaudeCodeSession(conversationId)
  clearCodexSession(conversationId)
}

async function assertConversationExists(conversationId: string): Promise<void> {
  const row = await db.query.conversations.findFirst({
    where: eq(schema.conversations.id, conversationId),
    columns: { id: true },
  })
  if (!row) throw new Error(`Conversation not found: ${conversationId}`)
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
