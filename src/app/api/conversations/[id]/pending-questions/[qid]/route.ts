import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { pendingQuestions } from '@/server/pending-questions'

interface RouteContext {
  params: Promise<{ id: string; qid: string }>
}

const Body = z.object({
  answers: z.record(
    z.string(),
    z.object({
      selectedLabels: z.array(z.string()),
      freeformNote: z.string().optional(),
    }),
  ),
})

/** POST /api/conversations/:id/pending-questions/:qid  body { answers } —— 提交答案。 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { qid } = await ctx.params
  const raw = await req.json().catch(() => null)
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const existing = pendingQuestions.get(qid)
  if (!existing) {
    return NextResponse.json({ error: 'Pending question not found' }, { status: 404 })
  }

  const ok = pendingQuestions.answer(qid, parsed.data.answers)
  if (!ok) {
    return NextResponse.json({ error: 'Failed to record answer' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
