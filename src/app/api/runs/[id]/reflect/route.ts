import { NextResponse } from 'next/server'

import { extractFromRun } from '@/server/experience-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

/** 手动触发一次 run 的反思沉淀（幂等：重复触发时命中去重，不会重复落库）。 */
export async function POST(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  // force: 手动反思时即便传的是子 run 也照样提炼（自动收尾只对顶层 run 提一次）。
  const saved = await extractFromRun(id, { force: true })
  return NextResponse.json({ saved: saved.length, experiences: saved })
}
