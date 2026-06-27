import { NextResponse } from 'next/server'

import { abortRun } from '@/server/conversation-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  const ok = await abortRun(id)
  if (!ok) {
    return NextResponse.json({ error: 'Run not found or already finished' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
