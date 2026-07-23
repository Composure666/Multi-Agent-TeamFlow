import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { pendingMcpToolApprovals } from '@/server/pending-mcp-tool-approvals'

interface RouteContext {
  params: Promise<{ id: string; approvalId: string }>
}

const Body = z.object({
  action: z.enum(['approve', 'reject']),
})

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id, approvalId } = await ctx.params
  const raw = await req.json().catch(() => null)
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  const existing = pendingMcpToolApprovals.get(approvalId)
  if (!existing || existing.conversationId !== id) {
    return NextResponse.json({ error: 'Pending MCP tool approval not found' }, { status: 404 })
  }

  const ok =
    parsed.data.action === 'approve'
      ? pendingMcpToolApprovals.approve(approvalId)
      : pendingMcpToolApprovals.reject(approvalId)

  if (!ok) {
    return NextResponse.json({ error: 'Failed to process pending MCP tool approval' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
