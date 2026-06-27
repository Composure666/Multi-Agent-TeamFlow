import { NextRequest, NextResponse } from 'next/server'

import { getWorkspaceForConversation, readFileInWorkspace } from '@/server/fs-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  const target = req.nextUrl.searchParams.get('path')
  if (!target) {
    return NextResponse.json({ error: 'path required' }, { status: 400 })
  }

  const workspace = await getWorkspaceForConversation(id)
  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  try {
    const result = readFileInWorkspace(workspace, target)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = msg.includes('outside') ? 403 : msg.includes('too large') ? 413 : msg.includes('Not a file') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
