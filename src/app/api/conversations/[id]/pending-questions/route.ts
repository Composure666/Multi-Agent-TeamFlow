import { NextResponse } from 'next/server'

import { pendingQuestions } from '@/server/pending-questions'

interface RouteContext {
  params: Promise<{ id: string }>
}

/** GET /api/conversations/:id/pending-questions —— 列出该会话当前等用户回答的 ask_user。 */
export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  return NextResponse.json({
    pendingQuestions: pendingQuestions.listByConversation(id),
  })
}
