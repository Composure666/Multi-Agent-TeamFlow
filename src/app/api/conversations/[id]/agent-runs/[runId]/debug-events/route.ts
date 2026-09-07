import { NextResponse } from 'next/server'

import { getAgentRunDebugEvents } from '@/server/agent-run-debug-service'

interface RouteContext {
  params: Promise<{ id: string; runId: string }>
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { id, runId } = await ctx.params
  try {
    const events = await getAgentRunDebugEvents(id, runId)
    return NextResponse.json({ events })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
