import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createAutomation, getAutomationDashboard } from '@/server/automation-service'
import { startAutomationScheduler } from '@/server/automation-scheduler'
import type { AutomationIconKey } from '@/server/automation-service'

startAutomationScheduler()

const IconKey = z.enum(['newspaper', 'languages', 'calendar_clock', 'video', 'history'])
const ScheduleType = z.enum(['manual', 'interval', 'daily', 'weekly'])
const Status = z.enum(['draft', 'enabled', 'paused'])

const CreateBody = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  category: z.string().trim().max(80).optional(),
  status: Status.optional(),
  iconKey: IconKey.optional(),
  prompt: z.string().trim().min(1).max(20_000),
  agentId: z.union([z.string().trim().min(1), z.null()]).optional(),
  conversationId: z.union([z.string().trim().min(1), z.null()]).optional(),
  workspaceId: z.union([z.string().trim().min(1), z.null()]).optional(),
  scheduleType: ScheduleType,
  scheduleConfig: z.unknown().optional(),
})

export async function GET(req: NextRequest) {
  const rawRange = Number(req.nextUrl.searchParams.get('trendRange'))
  const dashboard = await getAutomationDashboard(Number.isFinite(rawRange) ? rawRange : undefined)
  return NextResponse.json({ dashboard })
}

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null)
  const parsed = CreateBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const automation = await createAutomation({
      ...parsed.data,
      iconKey: parsed.data.iconKey as AutomationIconKey | undefined,
    })
    return NextResponse.json({ automation }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
