import { NextResponse } from 'next/server'

import { rollbackExperienceRevision } from '@/server/experience-service'

interface RouteContext {
  params: Promise<{ id: string; rid: string }>
}

/**
 * 回滚到某个版本快照。
 * 回滚本身也会留一份快照（kind='restore'），所以可以一路回滚回去，不会丢历史。
 */
export async function POST(_req: Request, ctx: RouteContext) {
  const { id, rid } = await ctx.params
  try {
    const experience = await rollbackExperienceRevision(id, rid)
    return NextResponse.json({ experience })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.startsWith('Experience revision not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
