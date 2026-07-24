import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { updateSkill } from '@/server/skill-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

const PatchBody = z
  .object({
    enabled: z.boolean().optional(),
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
    const skill = await updateSkill(id, parsed.data)
    return NextResponse.json({ skill })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
