import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { listProviders, migrateProvidersFromAppSettings, upsertProvider } from '@/server/provider-service'
import type { ProviderType } from '@/lib/llm-shared'

const PostBody = z.object({
  id: z.string().optional(),
  providerType: z.enum(['anthropic', 'openai', 'deepseek', 'ark', 'custom']).optional(),
  displayName: z.string().optional(),
  apiKey: z.string().nullable().optional(),
  baseUrl: z.string().nullable().optional(),
  models: z.array(z.string()).optional(),
})

/** GET /api/providers —— 供应商列表（自动从 app_settings 迁移旧数据） */
export async function GET() {
  await migrateProvidersFromAppSettings()
  const providers = await listProviders()
  return NextResponse.json({ providers })
}

/** POST /api/providers —— 新建供应商 */
export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null)
  const parsed = PostBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }
  const provider = await upsertProvider(parsed.data as { providerType?: ProviderType })
  return NextResponse.json({ provider })
}
