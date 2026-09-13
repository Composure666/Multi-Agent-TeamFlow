import { NextResponse } from 'next/server'

import { getExperienceUsage } from '@/server/experience-service'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const rows = await getExperienceUsage(id, 50)
    return NextResponse.json({ items: rows })
  } catch (err) {
    console.error('[api/experiences/[id]/usage] GET failed', err)
    return NextResponse.json({ error: 'failed_to_fetch_usage' }, { status: 500 })
  }
}
