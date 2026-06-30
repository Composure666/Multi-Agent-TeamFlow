import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { clearConversationHistory, listMessages, sendMessage } from '@/server/conversation-service'

const DEFAULT_MESSAGE_PAGE_SIZE = 50
const MAX_MESSAGE_PAGE_SIZE = 200

const MessagesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_MESSAGE_PAGE_SIZE).default(DEFAULT_MESSAGE_PAGE_SIZE),
  before: z.coerce.number().int().positive().optional(),
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

  const { limit, before } = parsed.data
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
