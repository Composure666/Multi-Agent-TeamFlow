import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createMcpServer, listMcpServers } from '@/server/mcp-server-service'

const EnvSchema = z.record(z.string().min(1), z.string())

const CreateBody = z
  .object({
    name: z.string().min(1).max(64),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    env: EnvSchema.default({}),
    trust: z.enum(['always', 'ask']).default('ask'),
    enabled: z.boolean().default(true),
  })
  .strict()

export async function GET() {
  const servers = await listMcpServers()
  return NextResponse.json({ servers })
}

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null)
  const parsed = CreateBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const server = await createMcpServer(parsed.data)
    return NextResponse.json({ server }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
