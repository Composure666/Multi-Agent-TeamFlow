import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { clearAssignments, upsertAssignments } from '@/server/model-assignment-service'
import { getPriorityList } from '@/server/provider-router'

const PriorityItem = z.object({
  providerId: z.string(),
  modelName: z.string().nullable().optional(),
  priority: z.number().int().min(0),
})

const PutBody = z.object({
  capabilityKey: z.string(),
  scope: z.enum(['global', 'system', 'agent']),
  useGlobal: z.boolean().optional(),
  assignments: z.array(PriorityItem),
})

/** GET /api/provider-priority?capabilityKey=global:default —— 优先级列表（含状态） */
export async function GET(req: NextRequest) {
  const capabilityKey = req.nextUrl.searchParams.get('capabilityKey') ?? 'global:default'
  const list = await getPriorityList(capabilityKey)
  return NextResponse.json({ assignments: list })
}

/** PUT /api/provider-priority —— 批量保存优先级（先清空再写入） */
export async function PUT(req: NextRequest) {
  const raw = await req.json().catch(() => null)
  const parsed = PutBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }
  const { capabilityKey, scope, useGlobal, assignments } = parsed.data
  // 先清空该 capabilityKey 的旧记录
  await clearAssignments(capabilityKey)
  // 写入新记录
  const saved = await upsertAssignments(
    assignments.map((a, i) => ({
      scope,
      capabilityKey,
      providerId: a.providerId,
      modelName: a.modelName ?? null,
      priority: a.priority ?? i,
      ...(useGlobal !== undefined ? { useGlobal } : {}),
    })),
  )
  return NextResponse.json({ assignments: saved })
}
