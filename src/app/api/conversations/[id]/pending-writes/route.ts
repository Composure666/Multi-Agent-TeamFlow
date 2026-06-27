import { NextResponse } from 'next/server'

import { pendingWrites } from '@/server/pending-writes'

interface RouteContext {
  params: Promise<{ id: string }>
}

/** GET /api/conversations/:id/pending-writes —— 列出当前等审批的 fs_write（用于前端刷新页面恢复）。 */
export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  return NextResponse.json({ pendingWrites: pendingWrites.listByConversation(id) })
}
