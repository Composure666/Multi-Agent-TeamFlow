import { NextResponse } from 'next/server'

import { AutomationServiceError, runAutomation } from '@/server/automation-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  try {
    const run = await runAutomation(id, { trigger: 'manual' })
    return NextResponse.json({ run })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = err instanceof AutomationServiceError ? err.status : 400
    return NextResponse.json({ error: message }, { status })
  }
}
