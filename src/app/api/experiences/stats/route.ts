import { NextResponse } from 'next/server'

import { getExperienceStats } from '@/server/experience-service'

export async function GET() {
  const stats = await getExperienceStats()
  return NextResponse.json({ stats })
}
