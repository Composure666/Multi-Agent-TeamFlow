import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { deleteWorkspaceMemory, updateWorkspaceMemory } from '@/server/workspace-memory-service'

interface RouteContext {
  params: Promise<{ id: string; memoryId: string }>
}

const PatchBody = z
  .object({
    title: z.string().min(1).max(80).optional(),
    content: z.string().min(1).max(4000).optional(),
    pinned: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id, memoryId } = await ctx.params
  const raw = await req.json().catch(() => null)
  const parsed = PatchBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const memory = await updateWorkspaceMemory(id, memoryId, parsed.data)
    return NextResponse.json({ memory })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id, memoryId } = await ctx.params
  try {
    await deleteWorkspaceMemory(id, memoryId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
