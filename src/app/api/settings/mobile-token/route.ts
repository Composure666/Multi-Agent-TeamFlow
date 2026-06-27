import { NextResponse } from 'next/server'

import { regenerateMobileDeviceToken } from '@/server/settings-service'

export async function POST() {
  const settings = await regenerateMobileDeviceToken()
  return NextResponse.json({ settings })
}
