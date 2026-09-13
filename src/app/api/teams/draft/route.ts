import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createTeamDraft } from '@/server/team-draft-service'

const DraftBody = z.object({
  goal: z.string().trim().min(4).max(2000),
})

/** POST /api/teams/draft —— 根据目标生成团队草稿 */
export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null)
  const parsed = DraftBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }
  try {
    const draft = await createTeamDraft(parsed.data)
    return NextResponse.json({ draft })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
