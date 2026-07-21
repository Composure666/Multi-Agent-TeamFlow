import { NextResponse } from 'next/server'

import { AutomationServiceError, listAutomationRuns } from '@/server/automation-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  try {
    const runs = await listAutomationRuns(id)
    return NextResponse.json({ runs })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = err instanceof AutomationServiceError ? err.status : 400
    return NextResponse.json({ error: message }, { status })
  }
}
