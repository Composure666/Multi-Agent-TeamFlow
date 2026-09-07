import { NextResponse } from 'next/server'
import { z } from 'zod'

import { listAgentRunsForConversationPage } from '@/server/agent-run-debug-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

const RunsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  beforeStartedAt: z.coerce.number().int().positive().optional(),
  beforeRunId: z.string().trim().min(1).optional(),
}).superRefine((value, ctx) => {
  if (Boolean(value.beforeStartedAt) !== Boolean(value.beforeRunId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'beforeStartedAt and beforeRunId must be provided together',
    })
  }
})

export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  try {
    const url = new URL(_req.url)
    const parsed = RunsQuery.safeParse({
      limit: url.searchParams.get('limit') ?? undefined,
      beforeStartedAt: url.searchParams.get('beforeStartedAt') ?? undefined,
      beforeRunId: url.searchParams.get('beforeRunId') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', issues: parsed.error.issues }, { status: 400 })
    }
    const { limit, beforeStartedAt, beforeRunId } = parsed.data
    const page = await listAgentRunsForConversationPage(id, {
      limit,
      before: typeof beforeStartedAt === 'number' && beforeRunId
        ? { startedAt: beforeStartedAt, runId: beforeRunId }
        : undefined,
    })
    return NextResponse.json(page)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
