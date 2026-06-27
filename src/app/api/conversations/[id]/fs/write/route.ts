import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getWorkspaceForConversation, writeFileInWorkspace } from '@/server/fs-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

const Body = z.object({
  path: z.string().min(1),
  content: z.string(),
})

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  const raw = await req.json().catch(() => null)
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  const workspace = await getWorkspaceForConversation(id)
  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  try {
    const result = writeFileInWorkspace(workspace, parsed.data.path, parsed.data.content)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = msg.includes('outside') ? 403 : msg.includes('too large') || msg.includes('quota') ? 413 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
