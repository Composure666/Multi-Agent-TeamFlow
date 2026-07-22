import { NextResponse } from 'next/server'

import { deleteNotification } from '@/server/notification-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  try {
    await deleteNotification(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.startsWith('Notification not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
