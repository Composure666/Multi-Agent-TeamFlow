import { NextResponse } from 'next/server'

import { pendingBashCommands } from '@/server/pending-bash-commands'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  return NextResponse.json({ pendingCommands: pendingBashCommands.listByConversation(id) })
}
