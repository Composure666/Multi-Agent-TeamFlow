import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getFailoverConfig, updateFailoverConfig } from '@/server/provider-router'

const PatchBody = z.object({
  enabled: z.boolean().optional(),
  triggerBalance: z.boolean().optional(),
  triggerAuth: z.boolean().optional(),
  triggerRateLimit: z.boolean().optional(),
  triggerServerError: z.boolean().optional(),
  triggerTimeout: z.boolean().optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  cooldownSeconds: z.number().int().min(0).max(3600).optional(),
  autoRecover: z.boolean().optional(),
})

/** GET /api/failover-config —— 故障转移配置 */
export async function GET() {
  const config = await getFailoverConfig()
  return NextResponse.json({ config })
}

/** PUT /api/failover-config —— 更新故障转移配置 */
export async function PUT(req: NextRequest) {
  const raw = await req.json().catch(() => null)
  const parsed = PatchBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }
  const config = await updateFailoverConfig(parsed.data)
  return NextResponse.json({ config })
}
