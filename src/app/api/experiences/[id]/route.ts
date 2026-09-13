import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { deleteExperience, updateExperience } from '@/server/experience-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

const PatchBody = z
  .object({
    kind: z.enum(['experience', 'reflection', 'profile_fact']).optional(),
    agentId: z.string().nullable().optional(),
    title: z.string().min(1).max(80).optional(),
    trigger: z.string().min(1).max(200).optional(),
    content: z.string().min(1).max(8000).optional(),
    tags: z.array(z.string().max(32)).max(10).optional(),
    active: z.boolean().optional(),
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
    const experience = await updateExperience(id, parsed.data)
    return NextResponse.json({ experience })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 404 })
  }
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  try {
    await deleteExperience(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 404 })
  }
}
