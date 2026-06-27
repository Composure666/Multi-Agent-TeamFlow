import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { mobileJson, mobileOptions } from '@/server/mobile-cors'
import { requireMobileAuth } from '@/server/mobile-auth'
import { pendingWrites } from '@/server/pending-writes'

interface RouteContext {
  params: Promise<{ id: string }>
}

const Body = z.object({
  action: z.enum(['approve', 'reject']),
})

export const OPTIONS = mobileOptions

export async function POST(req: NextRequest, ctx: RouteContext) {
  const authError = requireMobileAuth(req)
  if (authError) return authError

  const raw = await req.json().catch(() => null)
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return mobileJson(req, { error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  const { id } = await ctx.params
  const existing = pendingWrites.get(id)
  if (!existing) {
    return mobileJson(req, { error: 'Pending write not found' }, { status: 404 })
  }

  const ok =
    parsed.data.action === 'approve' ? pendingWrites.approve(id) : pendingWrites.reject(id)

  if (!ok) {
    return mobileJson(req, { error: 'Failed to process pending write' }, { status: 500 })
  }

  return mobileJson(req, { ok: true })
}
