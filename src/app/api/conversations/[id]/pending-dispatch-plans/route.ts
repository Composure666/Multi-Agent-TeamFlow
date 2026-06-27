import { NextResponse } from 'next/server'

import { pendingDispatchPlans } from '@/server/pending-dispatch-plans'

interface RouteContext {
  params: Promise<{ id: string }>
}

/** GET /api/conversations/:id/pending-dispatch-plans */
export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  return NextResponse.json({
    pendingDispatchPlans: pendingDispatchPlans.listByConversation(id),
  })
}
