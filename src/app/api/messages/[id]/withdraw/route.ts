import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withdrawLatestUserMessage } from '@/server/conversation-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

const Body = z.object({
  conversationId: z.string().min(1),
})

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  const raw = await req.json().catch(() => null)
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const result = await withdrawLatestUserMessage(parsed.data.conversationId, id)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
