import { NextRequest, NextResponse } from 'next/server'

import { getWorkspaceForConversation, listDirInWorkspace } from '@/server/fs-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/conversations/:id/fs/listdir?path=<rel>
 *
 * 列指定路径下的条目（目录 + 文件）。path 为相对 workspace 的路径，省略 = 根目录。
 * 返回 entries 包含目录和文件（与全局的 /api/fs/listdir 不同 —— 全局那个只为 DirPicker 用，仅列目录）。
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  const target = req.nextUrl.searchParams.get('path') ?? ''

  const workspace = await getWorkspaceForConversation(id)
  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  try {
    const result = listDirInWorkspace(workspace, target)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = msg.includes('outside') ? 403 : msg.includes('Not a') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
