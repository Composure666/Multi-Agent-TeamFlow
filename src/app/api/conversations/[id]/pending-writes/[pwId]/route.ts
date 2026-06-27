import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { pendingWrites } from '@/server/pending-writes'

interface RouteContext {
  params: Promise<{ id: string; pwId: string }>
}

const Body = z.object({
  action: z.enum(['approve', 'reject']),
})

/** POST /api/conversations/:id/pending-writes/:pwId  body { action } —— 应用或拒绝一个 pending fs_write。 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { pwId } = await ctx.params
  const raw = await req.json().catch(() => null)
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  const existing = pendingWrites.get(pwId)
  if (!existing) {
    return NextResponse.json({ error: 'Pending write not found' }, { status: 404 })
  }

  const ok =
    parsed.data.action === 'approve'
      ? pendingWrites.approve(pwId)
      : pendingWrites.reject(pwId)

  if (!ok) {
    return NextResponse.json({ error: 'Failed to process pending write' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
