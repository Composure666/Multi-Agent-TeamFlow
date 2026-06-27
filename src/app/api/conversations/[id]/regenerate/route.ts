import { NextRequest, NextResponse } from 'next/server'

import { regenerateLatestResponse } from '@/server/conversation-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/conversations/:id/regenerate
 * 删除最后一条 user 之后的所有 agent message + run + artifact_ref，
 * 然后以同一条 user 消息为触发重起 AgentRunner。
 */
export async function POST(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  try {
    const result = await regenerateLatestResponse(id)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
