import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { deleteProvider, getProvider, upsertProvider } from '@/server/provider-service'

/** GET /api/providers/[id] —— 供应商详情 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const provider = await getProvider(id)
  if (!provider) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
  }
  return NextResponse.json({ provider })
}

const PatchBody = z.object({
  displayName: z.string().optional(),
  apiKey: z.string().nullable().optional(),
  baseUrl: z.string().nullable().optional(),
  models: z.array(z.string()).optional(),
  isConnected: z.boolean().optional(),
})

/** PATCH /api/providers/[id] —— 更新供应商 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const raw = await req.json().catch(() => null)
  const parsed = PatchBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }
  const existing = await getProvider(id)
  if (!existing) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
  }
  const provider = await upsertProvider({ id, ...parsed.data })
  return NextResponse.json({ provider })
}

/** DELETE /api/providers/[id] —— 删除供应商（内置供应商只清空 Key） */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deleteProvider(id)
  return NextResponse.json({ ok: true })
}
