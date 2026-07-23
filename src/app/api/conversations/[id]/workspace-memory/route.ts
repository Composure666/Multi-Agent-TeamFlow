import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createWorkspaceMemory, listWorkspaceMemories } from '@/server/workspace-memory-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

const CreateBody = z
  .object({
    title: z.string().min(1).max(80),
    content: z.string().min(1).max(4000),
    pinned: z.boolean().optional(),
  })
  .strict()

export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  const memories = await listWorkspaceMemories(id)
  return NextResponse.json({ memories })
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  const raw = await req.json().catch(() => null)
  const parsed = CreateBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const memory = await createWorkspaceMemory({
      conversationId: id,
      title: parsed.data.title,
      content: parsed.data.content,
      pinned: parsed.data.pinned,
      source: 'user',
    })
    return NextResponse.json({ memory }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
