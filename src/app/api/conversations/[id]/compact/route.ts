import { NextRequest, NextResponse } from 'next/server'

import { compactConversation } from '@/server/context-compaction-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  try {
    const result = await compactConversation(id, req.signal)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
