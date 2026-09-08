import { NextResponse } from 'next/server'
import { z } from 'zod'

import { writeTerminalInput } from '@/server/terminal-session-service'

interface RouteContext {
  params: Promise<{ id: string; sessionId: string }>
}

const TerminalInputBody = z.object({
  input: z.string().min(1).max(8_000),
})

export async function POST(req: Request, ctx: RouteContext) {
  const { id, sessionId } = await ctx.params
  try {
    const parsed = TerminalInputBody.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
    }
    const event = await writeTerminalInput({
      conversationId: id,
      sessionId,
      input: parsed.data.input,
    })
    return NextResponse.json({ event })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
