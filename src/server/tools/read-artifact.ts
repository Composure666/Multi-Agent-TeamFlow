import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db, schema } from '@/db/client'

import type { ToolDef } from './types'

const ArgsSchema = z.object({
  artifactId: z.string().min(1),
})

export const readArtifactTool: ToolDef = {
  name: 'read_artifact',
  description: 'Read full content of an existing artifact in the current conversation. Use when you need the actual body of an artifact referenced by id.',
  parameters: {
    type: 'object',
    required: ['artifactId'],
    properties: {
      artifactId: { type: 'string', description: 'Id of the artifact, format art_xxx' },
    },
  },
  async handler(args, ctx) {
    const parsed = ArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: `Invalid args: ${parsed.error.message}` }
    }

    const artifact = await db.query.artifacts.findFirst({
      where: and(
        eq(schema.artifacts.id, parsed.data.artifactId),
        eq(schema.artifacts.conversationId, ctx.conversationId),
      ),
    })
    if (!artifact) {
      return { ok: false, error: `Artifact not found: ${parsed.data.artifactId}` }
    }

    return {
      ok: true,
      value: {
        id: artifact.id,
        type: artifact.type,
        title: artifact.title,
        content: artifact.content,
        version: artifact.version,
      },
    }
  },
}
