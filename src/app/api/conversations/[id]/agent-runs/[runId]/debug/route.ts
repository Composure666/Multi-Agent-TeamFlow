import { NextResponse } from 'next/server'

import { getAgentRunDebugDetail } from '@/server/agent-run-debug-service'

interface RouteContext {
  params: Promise<{ id: string; runId: string }>
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { id, runId } = await ctx.params
  try {
    const detail = await getAgentRunDebugDetail(id, runId)
    return NextResponse.json({ detail })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
