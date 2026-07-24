import { NextResponse } from 'next/server'

import { listAgentRunsForConversation } from '@/server/agent-run-debug-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  try {
    const runs = await listAgentRunsForConversation(id)
    return NextResponse.json({ runs })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
