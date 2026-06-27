import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { reviseDispatchPlan } from '@/server/conversation-service'
import { pendingDispatchPlans } from '@/server/pending-dispatch-plans'

interface RouteContext {
  params: Promise<{ id: string; planId: string }>
}

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
  }),
  z.object({
    action: z.literal('reject'),
  }),
  z.object({
    action: z.literal('revise'),
    feedback: z.string().min(1).max(4000),
  }),
])

/** POST /api/conversations/:id/pending-dispatch-plans/:planId */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id, planId } = await ctx.params
  const raw = await req.json().catch(() => null)
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  const existing = pendingDispatchPlans.get(planId)
  if (!existing || existing.conversationId !== id) {
    return NextResponse.json({ error: 'Pending dispatch plan not found' }, { status: 404 })
  }

  if (parsed.data.action === 'reject') {
    const ok = pendingDispatchPlans.reject(planId)
    if (!ok) {
      return NextResponse.json({ error: 'Failed to reject pending dispatch plan' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  if (parsed.data.action === 'revise') {
    const result = await reviseDispatchPlan({ conversationId: id, planId, feedback: parsed.data.feedback })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  const result = pendingDispatchPlans.approve(planId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
