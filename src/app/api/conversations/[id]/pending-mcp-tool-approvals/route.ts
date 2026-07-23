import { NextResponse } from 'next/server'

import { pendingMcpToolApprovals } from '@/server/pending-mcp-tool-approvals'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  return NextResponse.json({ pendingApprovals: pendingMcpToolApprovals.listByConversation(id) })
}
