import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { deleteProvider, getProvider, upsertProvider } from '@/server/provider-service'
import { looksMasked, maskSecret } from '@/server/secret-mask'

/** GET /api/providers/[id] —— 供应商详情（apiKey 脱敏，见 server/secret-mask.ts） */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const provider = await getProvider(id)
  if (!provider) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
  }
  return NextResponse.json({ provider: { ...provider, apiKey: maskSecret(provider.apiKey) } })
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
  // 兜底：GET 返回的是脱敏串，前端若把它原样回写会把真 key 覆盖成星号。
  // 命中即视作「没改 key」，保留原值。（真实 key 不会以 4 个以上连续星号开头。）
  const patch = { ...parsed.data }
  if (typeof patch.apiKey === 'string' && looksMasked(patch.apiKey.trim())) {
    delete patch.apiKey
  }
  const provider = await upsertProvider({ id, ...patch })
  return NextResponse.json({ provider: { ...provider, apiKey: maskSecret(provider.apiKey) } })
}

/** DELETE /api/providers/[id] —— 删除供应商（内置供应商只清空 Key） */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deleteProvider(id)
  return NextResponse.json({ ok: true })
}
