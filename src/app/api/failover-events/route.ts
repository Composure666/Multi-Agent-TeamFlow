import { NextRequest, NextResponse } from 'next/server'

import { getFailoverEvents } from '@/server/provider-router'

/** GET /api/failover-events?limit=50 —— 切换记录 */
export async function GET(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 50), 200)
  const events = await getFailoverEvents(limit)
  return NextResponse.json({ events })
}
