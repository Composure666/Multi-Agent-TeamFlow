import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  deploySelectedArtifact,
  handleDeployCommand,
  listDeployCandidates,
} from '@/server/deploy-command-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

const DeployBody = z.object({
  artifactId: z.string().min(1).optional(),
})

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  try {
    const candidates = await listDeployCandidates(id)
    return NextResponse.json({ candidates })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  const raw = await req.json().catch(() => ({}))
  const parsed = DeployBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const result = parsed.data.artifactId
      ? await deploySelectedArtifact({
          conversationId: id,
          artifactId: parsed.data.artifactId,
        })
      : await handleDeployCommand({ conversationId: id })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
