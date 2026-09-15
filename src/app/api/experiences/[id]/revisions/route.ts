import { NextResponse } from 'next/server'

import { listExperienceRevisions } from '@/server/experience-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

/** 经验的迭代历史（改前快照），时间倒序。 */
export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  try {
    const items = await listExperienceRevisions(id)
    return NextResponse.json({ items })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
