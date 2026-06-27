import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { mobileJson, mobileOptions } from '@/server/mobile-cors'
import { requireMobileAuth } from '@/server/mobile-auth'
import { sendMobileMessage } from '@/server/mobile-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

const Body = z.object({
  content: z.string().min(1).max(12000),
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
  try {
    const result = await sendMobileMessage({
      conversationId: id,
      content: parsed.data.content,
    })
    return mobileJson(req, result, { status: 202 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return mobileJson(req, { error: message }, { status: 400 })
  }
}
