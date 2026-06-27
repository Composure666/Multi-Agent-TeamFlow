import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { mobileJson, mobileOptions } from '@/server/mobile-cors'
import { requireMobileAuth } from '@/server/mobile-auth'
import { pendingQuestions } from '@/server/pending-questions'

interface RouteContext {
  params: Promise<{ id: string }>
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

export const OPTIONS = mobileOptions

export async function POST(req: NextRequest, ctx: RouteContext) {
  const authError = requireMobileAuth(req)
  if (authError) return authError

  const raw = await req.json().catch(() => null)
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return mobileJson(
      req,
      { error: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const { id } = await ctx.params
  const existing = pendingQuestions.get(id)
  if (!existing) {
    return mobileJson(req, { error: 'Pending question not found' }, { status: 404 })
  }

  const ok = pendingQuestions.answer(id, parsed.data.answers)
  if (!ok) {
    return mobileJson(req, { error: 'Failed to record answer' }, { status: 500 })
  }

  return mobileJson(req, { ok: true })
}
