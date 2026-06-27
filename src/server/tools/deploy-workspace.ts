import path from 'node:path'

import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db, schema } from '@/db/client'
import { createWorkspaceStaticDeployment } from '@/server/deployment-service'
import { newDeploymentId } from '@/server/ids'
import { assertPathWithinWorkspace, getEffectiveCwd } from '@/server/workspace-utils'
import type { DeployStatusRecord } from '@/shared/types'

import { maybePublishExternally } from './deploy-artifact'
import type { ToolDef } from './types'

const ArgsSchema = z.object({
  path: z.string().min(1),
  title: z.string().min(1).optional(),
  entry: z.string().min(1).optional(),
})

export const deployWorkspaceTool: ToolDef = {
  name: 'deploy_workspace',
  description:
    'Create a deployment card from a static directory inside the current workspace, such as dist, build, out, or client/dist. Use this after building a local project. It copies existing static files only; it does not run npm/pnpm/build commands. The directory must contain index.html unless entry is provided.',
  parameters: {
    type: 'object',
    required: ['path'],
    properties: {
      path: {
        type: 'string',
        description:
          'Static output directory inside the workspace, for example "dist", "build", "out", "client/dist", or "apps/web/dist".',
      },
      title: {
        type: 'string',
        description: 'Optional human-readable deployment title. Defaults to the directory name.',
      },
      entry: {
        type: 'string',
        description: 'Optional HTML entry file relative to path. Defaults to index.html.',
      },
    },
  },
  async handler(args, ctx) {
    const parsed = ArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: `Invalid args: ${parsed.error.message}` }
    }

    return {
      ok: true,
      value: await deployWorkspaceForConversation(ctx.conversationId, parsed.data),
    }
  },
}

export async function deployWorkspaceForConversation(
  conversationId: string,
  args: z.infer<typeof ArgsSchema>,
): Promise<DeployStatusRecord> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.conversationId, conversationId),
  })
  if (!workspace) {
    return failedWorkspaceDeployment(args.path, 'Workspace not found')
  }

  let sourceDir: string
  try {
    sourceDir = assertPathWithinWorkspace(workspace, args.path)
  } catch (error) {
    return failedWorkspaceDeployment(
      args.path,
      error instanceof Error ? error.message : 'Deployment path is outside workspace',
    )
  }

  const cwd = getEffectiveCwd(workspace)
  const workspacePath = path.relative(cwd, sourceDir) || '.'
  const title = args.title?.trim() || `Workspace ${workspacePath}`

  try {
    const local = createWorkspaceStaticDeployment({
      id: newDeploymentId(),
      title,
      sourceDir,
      workspacePath,
      entry: args.entry,
    })
    return maybePublishExternally(local)
  } catch (error) {
    return failedWorkspaceDeployment(
      workspacePath,
      error instanceof Error ? error.message : 'Failed to create workspace deployment',
      title,
    )
  }
}

function failedWorkspaceDeployment(
  workspacePath: string,
  error: string,
  title = `Workspace ${workspacePath}`,
): DeployStatusRecord {
  return {
    id: newDeploymentId(),
    artifactId: `workspace:${workspacePath}`,
    title,
    version: 0,
    previewPath: '',
    status: 'failed',
    sourceType: 'workspace',
    workspacePath,
    error,
    createdAt: Date.now(),
  }
}
