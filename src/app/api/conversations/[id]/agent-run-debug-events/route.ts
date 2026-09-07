import { NextResponse } from 'next/server'

import { getAgentRunDebugEventsForConversation } from '@/server/agent-run-debug-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  try {
    const events = await getAgentRunDebugEventsForConversation(id)
    return NextResponse.json({ events })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
