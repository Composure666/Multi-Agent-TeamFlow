import { NextResponse } from 'next/server'

import { getTerminalEventsForSession } from '@/server/terminal-session-service'

interface RouteContext {
  params: Promise<{ id: string; sessionId: string }>
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { id, sessionId } = await ctx.params
  try {
    const events = await getTerminalEventsForSession(id, sessionId)
    return NextResponse.json({ events })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
