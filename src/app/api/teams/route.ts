import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createTeam, listTeams } from '@/server/team-service'

const CreateTeamBody = z.object({
  name: z.string().min(1).max(64),
  avatar: z.string().max(8).optional(),
  description: z.string().max(500).optional(),
  goal: z.string().max(1000).optional(),
  systemPrompt: z.string().max(5000).optional(),
  members: z
    .array(
      z.object({
        agentId: z.string().min(1),
        role: z.string().max(120).optional(),
        isLead: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }),
    )
    .max(20)
    .optional(),
})

/** GET /api/teams — 团队列表 */
export async function GET() {
  const teams = await listTeams()
  return NextResponse.json({ teams })
}

/** POST /api/teams — 创建团队 */
export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null)
  const parsed = CreateTeamBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }
  try {
    const team = await createTeam(parsed.data)
    return NextResponse.json({ team }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
