import { NextResponse } from 'next/server'

import { AutomationServiceError, enableAutomation } from '@/server/automation-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  try {
    const automation = await enableAutomation(id)
    return NextResponse.json({ automation })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = err instanceof AutomationServiceError ? err.status : 400
    return NextResponse.json({ error: message }, { status })
  }
}
