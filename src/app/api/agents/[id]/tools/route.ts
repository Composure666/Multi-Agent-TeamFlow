import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { configureAgentTool } from '@/server/agent-service'
import { importGithubTool } from '@/server/github-tool-catalog-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

const ToolType = z.enum(['skill', 'mcp_server'])

const Body = z
  .object({
    action: z.enum(['attach', 'detach']),
    kind: ToolType.optional(),
    type: ToolType.optional(),
    source: z.enum(['local', 'github']).default('local'),
    id: z.string().min(1).optional(),
    installUrl: z.string().url().nullable().optional(),
    manifestUrl: z.string().url().nullable().optional(),
    githubUrl: z.string().url().nullable().optional(),
  })
  .strict()

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id: agentId } = await ctx.params
  const raw = await req.json().catch(() => null)
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  const toolType = parsed.data.type ?? parsed.data.kind
  if (!toolType) {
    return NextResponse.json({ error: 'Tool type is required' }, { status: 400 })
  }

  try {
    if (parsed.data.source === 'github') {
      if (parsed.data.action !== 'attach') {
        return NextResponse.json({ error: 'GitHub tool detach requires a local tool id' }, { status: 400 })
      }
      if (!parsed.data.manifestUrl && !parsed.data.installUrl) {
        return NextResponse.json({ error: 'GitHub tool requires installUrl or manifestUrl' }, { status: 400 })
      }

      const imported = await importGithubTool(
        {
          type: toolType,
          remoteId: parsed.data.id,
          installUrl: parsed.data.installUrl,
          manifestUrl: parsed.data.manifestUrl,
          githubUrl: parsed.data.githubUrl,
        },
        req.signal,
      )
      const agent = await configureAgentTool(agentId, {
        action: 'attach',
        kind: toolType,
        id: imported.id,
      })
      return NextResponse.json({
        agent,
        configured: {
          id: imported.id,
          type: toolType,
          source: parsed.data.source,
          imported: imported.imported,
        },
      })
    }

    if (!parsed.data.id) {
      return NextResponse.json({ error: 'Local tool id is required' }, { status: 400 })
    }

    const agent = await configureAgentTool(agentId, {
      action: parsed.data.action,
      kind: toolType,
      id: parsed.data.id,
    })
    return NextResponse.json({
      agent,
      configured: {
        id: parsed.data.id,
        type: toolType,
        source: parsed.data.source,
        imported: false,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
