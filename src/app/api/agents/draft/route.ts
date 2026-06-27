import { NextRequest, NextResponse } from 'next/server'

import { AgentDraftRequestSchema, AgentDraftResponseSchema } from '@/server/agent-draft-schema'
import { createAgentConfigDraft } from '@/server/agent-draft-service'

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null)
  const parsed = AgentDraftRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const draft = await createAgentConfigDraft(parsed.data)
    return NextResponse.json(AgentDraftResponseSchema.parse({ draft }))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
