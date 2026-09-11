import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { clearAssignments, listAssignments, upsertAssignments } from '@/server/model-assignment-service'
import type { AssignmentUpsertInput } from '@/lib/llm-shared'

const AssignmentItem = z.object({
  id: z.string().optional(),
  scope: z.enum(['global', 'system', 'agent']),
  capabilityKey: z.string(),
  providerId: z.string().nullable().optional(),
  modelName: z.string().nullable().optional(),
  priority: z.number().optional(),
})

const PutBody = z.object({
  assignments: z.array(AssignmentItem),
  // 可选：先清空这些 capabilityKey 的旧分配再写入（用于「重置并保存」）
  clearKeys: z.array(z.string()).optional(),
})

/** GET /api/model-assignments —— 所有模型分配 */
export async function GET() {
  const assignments = await listAssignments()
  return NextResponse.json({ assignments })
}

/** PUT /api/model-assignments —— 批量 upsert（可选先清空指定 capabilityKey） */
export async function PUT(req: NextRequest) {
  const raw = await req.json().catch(() => null)
  const parsed = PutBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }
  if (parsed.data.clearKeys) {
    for (const key of parsed.data.clearKeys) {
      await clearAssignments(key)
    }
  }
  const assignments = await upsertAssignments(parsed.data.assignments as AssignmentUpsertInput[])
  return NextResponse.json({ assignments })
}
