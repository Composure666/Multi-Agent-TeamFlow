import { NextResponse } from 'next/server'

import { getUnreadNotificationCount } from '@/server/notification-service'

export async function GET() {
  const count = await getUnreadNotificationCount()
  return NextResponse.json({ count })
}
