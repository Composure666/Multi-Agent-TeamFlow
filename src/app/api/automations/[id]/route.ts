import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { AutomationServiceError, deleteAutomation, updateAutomation } from '@/server/automation-service'
import type { AutomationIconKey } from '@/server/automation-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

const IconKey = z.enum(['newspaper', 'languages', 'calendar_clock', 'video', 'history'])
const ScheduleType = z.enum(['manual', 'interval', 'daily', 'weekly'])
const Status = z.enum(['draft', 'enabled', 'paused'])

const PatchBody = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    category: z.string().trim().max(80).optional(),
    status: Status.optional(),
    iconKey: IconKey.optional(),
    prompt: z.string().trim().min(1).max(20_000).optional(),
    agentId: z.union([z.string().trim().min(1), z.null()]).optional(),
    conversationId: z.union([z.string().trim().min(1), z.null()]).optional(),
    workspaceId: z.union([z.string().trim().min(1), z.null()]).optional(),
    scheduleType: ScheduleType.optional(),
    scheduleConfig: z.unknown().optional(),
  })
  .strict()

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  const raw = await req.json().catch(() => null)
  const parsed = PatchBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const automation = await updateAutomation(id, {
      ...parsed.data,
      iconKey: parsed.data.iconKey as AutomationIconKey | undefined,
    })
    return NextResponse.json({ automation })
  } catch (err) {
    return automationErrorResponse(err)
  }
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  try {
    await deleteAutomation(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return automationErrorResponse(err)
  }
}

function automationErrorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  const status = err instanceof AutomationServiceError ? err.status : 400
  return NextResponse.json({ error: message }, { status })
}
