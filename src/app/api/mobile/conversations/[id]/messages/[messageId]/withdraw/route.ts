import type { NextRequest } from 'next/server'

import { mobileJson, mobileOptions } from '@/server/mobile-cors'
import { requireMobileAuth } from '@/server/mobile-auth'
import { withdrawMobileMessage } from '@/server/mobile-service'

interface RouteContext {
  params: Promise<{ id: string; messageId: string }>
}

export const OPTIONS = mobileOptions

export async function POST(req: NextRequest, ctx: RouteContext) {
  const authError = requireMobileAuth(req)
  if (authError) return authError

  const { id, messageId } = await ctx.params
  try {
    const result = await withdrawMobileMessage({ conversationId: id, messageId })
    return mobileJson(req, result, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return mobileJson(req, { error: message }, { status: 400 })
  }
}
