import { NextResponse } from 'next/server'

import { markNotificationRead } from '@/server/notification-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  try {
    const notification = await markNotificationRead(id)
    return NextResponse.json({ notification })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.startsWith('Notification not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
