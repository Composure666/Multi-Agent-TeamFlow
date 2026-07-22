import { and, eq, gte } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { db, schema } from '@/db/client'
import { clearConversationHistory, listMessages, sendMessage } from '@/server/conversation-service'

const DEFAULT_MESSAGE_PAGE_SIZE = 50
const MAX_MESSAGE_PAGE_SIZE = 200

const MessagesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_MESSAGE_PAGE_SIZE).default(DEFAULT_MESSAGE_PAGE_SIZE),
  before: z.coerce.number().int().positive().optional(),
  aroundMessageId: z.string().trim().min(1).optional(),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

const SendBody = z
  .object({
    content: z.string().default(''),
    mentionedAgentIds: z.array(z.string()).optional(),
    parentMessageId: z.string().optional(),
    attachmentIds: z.array(z.string()).optional(),
  })
  .refine(
    (d) => d.content.trim().length > 0 || (d.attachmentIds && d.attachmentIds.length > 0),
    { message: '必须提供 content 或 attachmentIds 之一' },
  )

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  const parsed = MessagesQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query', issues: parsed.error.issues }, { status: 400 })
  }

  const { limit, before, aroundMessageId } = parsed.data
  if (aroundMessageId) {
    const target = await db.query.messages.findFirst({
      where: and(eq(schema.messages.id, aroundMessageId), eq(schema.messages.conversationId, id)),
    })
    if (!target) return NextResponse.json({ error: 'Message not found' }, { status: 404 })

    const rows = await db
      .select()
      .from(schema.messages)
      .where(and(eq(schema.messages.conversationId, id), gte(schema.messages.createdAt, target.createdAt)))
      .orderBy(schema.messages.createdAt)
      .limit(limit)
    return NextResponse.json({
      messages: rows,
      hasMore: rows.length >= limit,
      nextBefore: rows[0]?.createdAt ?? null,
    })
  }

  const rows = await listMessages(id, { limit: limit + 1, before })
  const hasMore = rows.length > limit
  const messages = hasMore ? rows.slice(rows.length - limit) : rows
  return NextResponse.json({
    messages,
    hasMore,
    nextBefore: messages[0]?.createdAt ?? null,
  })
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  const raw = await req.json().catch(() => null)
  const parsed = SendBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const result = await sendMessage({
      conversationId: id,
      content: parsed.data.content,
      mentionedAgentIds: parsed.data.mentionedAgentIds,
      parentMessageId: parsed.data.parentMessageId,
      attachmentIds: parsed.data.attachmentIds,
    })
    return NextResponse.json(result, { status: 202 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  try {
    const result = await clearConversationHistory(id)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.startsWith('Conversation not found')
      ? 404
      : message.includes('agent runs are active')
        ? 409
        : 400
    return NextResponse.json({ error: message }, { status })
  }
}
