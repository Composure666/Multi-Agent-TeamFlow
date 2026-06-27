import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getAppSettings, updateAppSettings } from '@/server/settings-service'

/** GET /api/settings —— 返回全局设置（key 字段会原样返回；用户已自行选择填明文） */
export async function GET() {
  const settings = await getAppSettings()
  return NextResponse.json({ settings })
}

const PatchBody = z.object({
  // 显式 null 表示清空；undefined 表示不改
  anthropicApiKey: z.string().nullable().optional(),
  anthropicBaseUrl: z.string().nullable().optional(),
  openaiApiKey: z.string().nullable().optional(),
  deepseekApiKey: z.string().nullable().optional(),
  arkApiKey: z.string().nullable().optional(),
  companionMode: z.enum(['off', 'lan', 'tailnet']).optional(),
  mobileDeviceToken: z.string().nullable().optional(),
  deploymentPublishEnabled: z.boolean().optional(),
  deploymentPublishDir: z.string().nullable().optional(),
  deploymentPublicBaseUrl: z.string().nullable().optional(),
})

/** PATCH /api/settings —— upsert 部分字段 */
export async function PATCH(req: NextRequest) {
  const raw = await req.json().catch(() => null)
  const parsed = PatchBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const settings = await updateAppSettings(parsed.data)
  return NextResponse.json({ settings })
}
