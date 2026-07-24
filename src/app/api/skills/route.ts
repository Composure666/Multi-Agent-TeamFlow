import { NextResponse } from 'next/server'

import { listSkills } from '@/server/skill-service'

export async function GET() {
  const skills = await listSkills()
  return NextResponse.json({ skills })
}
