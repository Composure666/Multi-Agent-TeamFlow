import { NextResponse } from 'next/server'

import { deleteExperienceFile } from '@/server/experience-service'

interface RouteContext {
  params: Promise<{ id: string; aid: string }>
}

/** 删除经验参考附件（同时删除磁盘文件） */
export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id, aid } = await ctx.params
  try {
    await deleteExperienceFile(id, aid)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 404 })
  }
}
