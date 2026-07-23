import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { deleteMcpServer, updateMcpServer } from '@/server/mcp-server-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

const EnvSchema = z.record(z.string().min(1), z.string())

const PatchBody = z
  .object({
    name: z.string().min(1).max(64).optional(),
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    env: EnvSchema.optional(),
    trust: z.enum(['always', 'ask']).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  const raw = await req.json().catch(() => null)
  const parsed = PatchBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const server = await updateMcpServer(id, parsed.data)
    return NextResponse.json({ server })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  try {
    await deleteMcpServer(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
