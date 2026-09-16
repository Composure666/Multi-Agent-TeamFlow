import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createCustomAgent, listAgentsOrdered } from '@/server/agent-service'

export async function GET() {
  const agents = await listAgentsOrdered()
  return NextResponse.json({ agents })
}

const CreateBody = z
  .object({
    name: z.string().min(1).max(64),
    avatar: z.string().max(8).optional(),
    description: z.string().min(1).max(280),
    capabilities: z.array(z.string()).default([]),
    systemPrompt: z.string().min(1),
    adapterName: z.enum(['custom', 'claude-code', 'codex', 'image-gen']).default('custom'),
    modelProvider: z
      .enum(['anthropic', 'openai', 'deepseek', 'volcano-ark', 'openai-compatible'])
      .optional(),
    modelId: z.string().min(1).optional(),
    toolNames: z.array(z.string()).default([]),
    mcpServerIds: z.array(z.string()).default([]),
    skillIds: z.array(z.string()).default([]),
    supportsVision: z.boolean().optional(),
    modality: z.string().min(1).max(32).optional(),
    apiKey: z.string().optional(),
    apiBaseUrl: z.string().optional(),
  })
  .refine(
    (d) => {
      if (d.adapterName === 'custom') return !!(d.modelProvider && d.modelId)
      // image-gen 的凭证（apiKey + apiBaseUrl）由服务端按模型分配从供应商中心补全，
      // 因此这里只要求有模型；缺凭证时 createCustomAgent 会给出可操作的错误信息。
      if (d.adapterName === 'image-gen') return !!d.modelId
      return true
    },
    { message: 'Adapter requires specific configuration' },
  )

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null)
  const parsed = CreateBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const agent = await createCustomAgent({
      ...parsed.data,
      avatar: parsed.data.avatar ?? '',
    })
    return NextResponse.json({ agent }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
