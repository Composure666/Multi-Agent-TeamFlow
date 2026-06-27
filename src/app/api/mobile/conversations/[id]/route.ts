import type { NextRequest } from 'next/server'

import { mobileJson, mobileOptions } from '@/server/mobile-cors'
import { requireMobileAuth } from '@/server/mobile-auth'
import { getMobileConversationDetail } from '@/server/mobile-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

export const OPTIONS = mobileOptions

export async function GET(req: NextRequest, ctx: RouteContext) {
  const authError = requireMobileAuth(req)
  if (authError) return authError

  const { id } = await ctx.params
  try {
    return mobileJson(req, await getMobileConversationDetail(id))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return mobileJson(req, { error: message }, { status: 404 })
  }
}
