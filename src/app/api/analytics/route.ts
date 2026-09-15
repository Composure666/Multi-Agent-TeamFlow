import { NextRequest, NextResponse } from 'next/server'

import { getRunAnalytics } from '@/server/analytics-service'

/** GET /api/analytics —— 数据概览页的真实运行分析（数据源：agent_runs）。 */

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const start = params.get('start') ? Number(params.get('start')) : undefined
  const end = params.get('end') ? Number(params.get('end')) : undefined
  const days = params.get('days') ? Number(params.get('days')) : undefined
  const tzOffset = params.get('tzOffsetMinutes')

  try {
    const analytics = await getRunAnalytics({
      start: Number.isFinite(start) ? start : undefined,
      end: Number.isFinite(end) ? end : undefined,
      days: Number.isFinite(days) ? days : undefined,
      tzOffsetMinutes: tzOffset !== null && Number.isFinite(Number(tzOffset)) ? Number(tzOffset) : undefined,
    })
    return NextResponse.json({ analytics })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
