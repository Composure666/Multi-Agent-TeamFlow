import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createExperience, getRevisionCounts, listExperiences } from '@/server/experience-service'
import type { ExperienceKind } from '@/db/schema'

const CreateBody = z
  .object({
    kind: z.enum(['experience', 'reflection', 'profile_fact']).optional(),
    agentId: z.string().nullable().optional(),
    scope: z.enum(['agent', 'global']).optional(),
    conversationId: z.string().nullable().optional(),
    runId: z.string().nullable().optional(),
    title: z.string().min(1).max(80),
    trigger: z.string().min(1).max(200),
    content: z.string().min(1).max(8000),
    tags: z.array(z.string().max(32)).max(10).optional(),
    active: z.boolean().optional(),
  })
  .strict()

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const agentId = searchParams.get('agentId') || undefined
  const kindParam = searchParams.get('kind')
  const activeParam = searchParams.get('active')
  const q = searchParams.get('q')

  const kind =
    kindParam === 'experience' || kindParam === 'reflection' || kindParam === 'profile_fact'
      ? (kindParam as ExperienceKind)
      : undefined
  const active =
    activeParam === 'true' ? true : activeParam === 'false' ? false : undefined
  const sourceParam = searchParams.get('source')
  const source =
    sourceParam === 'auto' || sourceParam === 'manual' ? sourceParam : undefined

  const experiences = await listExperiences({ agentId, kind, active, source, q })
  // 迭代次数（自动复盘 + 人工修订）列表页要显示成徽标，一次 group-by 带出来，避免逐条请求
  const revisionCounts = await getRevisionCounts(experiences.map((row) => row.id))
  return NextResponse.json({ experiences, revisionCounts })
}

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null)
  const parsed = CreateBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const experience = await createExperience({
      kind: parsed.data.kind,
      agentId: parsed.data.agentId,
      scope: parsed.data.scope,
      conversationId: parsed.data.conversationId,
      runId: parsed.data.runId,
      title: parsed.data.title,
      trigger: parsed.data.trigger,
      content: parsed.data.content,
      tags: parsed.data.tags,
      active: parsed.data.active,
      source: 'manual',
    })
    return NextResponse.json({ experience }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
