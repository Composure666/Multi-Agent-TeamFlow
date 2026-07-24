import { NextResponse } from 'next/server'

import { refreshSkillsFromDisk } from '@/server/skill-service'

export async function POST() {
  const skills = await refreshSkillsFromDisk()
  return NextResponse.json({ skills })
}
