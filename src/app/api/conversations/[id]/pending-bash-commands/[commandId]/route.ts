import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { pendingBashCommands } from '@/server/pending-bash-commands'

interface RouteContext {
  params: Promise<{ id: string; commandId: string }>
}

const Body = z.object({
  action: z.enum(['approve', 'reject']),
})

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id, commandId } = await ctx.params
  const raw = await req.json().catch(() => null)
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  const existing = pendingBashCommands.get(commandId)
  if (!existing || existing.conversationId !== id) {
    return NextResponse.json({ error: 'Pending command not found' }, { status: 404 })
  }

  const ok =
    parsed.data.action === 'approve'
      ? pendingBashCommands.approve(commandId)
      : pendingBashCommands.reject(commandId)

  if (!ok) {
    return NextResponse.json({ error: 'Failed to process pending command' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
