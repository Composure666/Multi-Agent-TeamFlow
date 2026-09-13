import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { deleteTeam, getTeam, updateTeam } from '@/server/team-service'

const UpdateTeamBody = z.object({
  name: z.string().min(1).max(64).optional(),
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

/** GET /api/teams/[id] — 团队详情 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const team = await getTeam(id)
    return NextResponse.json({ team })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 404 })
  }
}

/** PATCH /api/teams/[id] — 更新团队（含全量替换成员） */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const raw = await req.json().catch(() => null)
  const parsed = UpdateTeamBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }
  try {
    const { members, ...teamFields } = parsed.data
    let team = await updateTeam(id, teamFields)
    if (members !== undefined) {
      const { setTeamMembers } = await import('@/server/team-service')
      team = await setTeamMembers(id, members)
    }
    return NextResponse.json({ team })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/** DELETE /api/teams/[id] — 删除团队 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await deleteTeam(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 })
  }
}
