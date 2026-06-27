import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { toggleBookmarkedMessage } from '@/server/conversation-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

const Body = z.object({
  conversationId: z.string().min(1),
})

/** POST /api/messages/:id/bookmark  body { conversationId } —— toggle UI 书签（不影响 LLM 上下文）。 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  const raw = await req.json().catch(() => null)
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }
  try {
    const result = await toggleBookmarkedMessage(parsed.data.conversationId, id)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
