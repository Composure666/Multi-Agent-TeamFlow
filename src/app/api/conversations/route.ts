import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createConversation, listConversations } from '@/server/conversation-service'

const CreateBody = z.object({
  title: z.string().optional(),
  mode: z.enum(['single', 'group']),
  agentIds: z.array(z.string()).min(1),
  boundPath: z.string().optional(),
})

export async function GET() {
  const conversations = await listConversations()
  return NextResponse.json({ conversations })
}

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null)
  const parsed = CreateBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const conversation = await createConversation(parsed.data)
    return NextResponse.json({ conversation }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
