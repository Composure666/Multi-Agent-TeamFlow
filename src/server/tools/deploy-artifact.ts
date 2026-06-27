import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db, schema } from '@/db/client'
import { artifactPreviewPath } from '@/lib/artifact-preview'
import {
  createLocalStaticDeployment,
  publishDeploymentToStaticDirectory,
} from '@/server/deployment-service'
import { newDeploymentId } from '@/server/ids'
import { getAppSettings } from '@/server/settings-service'
import type { ArtifactContent, DeployStatusRecord } from '@/shared/types'

import type { ToolDef } from './types'

const ArgsSchema = z.object({
  artifactId: z.string().min(1),
})

const EXTERNAL_DEPLOYMENT_SUMMARY_INSTRUCTION =
  'User-facing summaries may quote the returned previewPath/publicUrl exactly. Do not invent or rewrite hostnames. If localPreviewPath is present, mention it only as a local fallback inside AgentHub.'

export const deployArtifactTool: ToolDef = {
  name: 'deploy_artifact',
  description:
    'Create a local static deployment for a web_app artifact and return its stable previewPath plus downloadable packages. The previewPath is a relative path for the current AgentHub instance; do not invent or print a public hostname. In user-facing summaries, tell the user to use the deployment card buttons or quote previewPath exactly.',
  parameters: {
    type: 'object',
    required: ['artifactId'],
    properties: {
      artifactId: {
        type: 'string',
        description: 'Id of the web_app artifact to deploy, format art_xxx',
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
      value: await deployArtifactForConversation(ctx.conversationId, parsed.data.artifactId),
    }
  },
}

export async function deployArtifactForConversation(
  conversationId: string,
  artifactId: string,
): Promise<DeployStatusRecord> {
  const artifact = await db.query.artifacts.findFirst({
    where: and(
      eq(schema.artifacts.id, artifactId),
      eq(schema.artifacts.conversationId, conversationId),
    ),
  })
  if (!artifact) {
    return failedDeployment(artifactId, 'Unknown artifact', 'Artifact not found')
  }

  const content = artifact.content as ArtifactContent
  if (content.type !== 'web_app') {
    return failedDeployment(
      artifact.id,
      artifact.title,
      `Artifact type "${content.type}" cannot be deployed as a web app`,
      artifact.version,
    )
  }

  try {
    const local = createLocalStaticDeployment({
      id: newDeploymentId(),
      artifactId: artifact.id,
      title: artifact.title,
      version: artifact.version,
      content,
    })
    return maybePublishExternally(local)
  } catch (error) {
    return failedDeployment(
      artifact.id,
      artifact.title,
      error instanceof Error ? error.message : 'Failed to create deployment',
      artifact.version,
    )
  }
}

export async function maybePublishExternally(local: DeployStatusRecord): Promise<DeployStatusRecord> {
  const settings = await getAppSettings()
  if (!settings.deploymentPublishEnabled) return local

  if (!settings.deploymentPublishDir || !settings.deploymentPublicBaseUrl) {
    return {
      ...local,
      status: 'failed',
      deploymentType: 'external_static',
      localPreviewPath: local.previewPath,
      error:
        'External static publishing is enabled, but deployment publish directory or public base URL is not configured',
    }
  }

  try {
    const published = publishDeploymentToStaticDirectory(local.id, {
      publishDir: settings.deploymentPublishDir,
      publicBaseUrl: settings.deploymentPublicBaseUrl,
    })
    return {
      ...local,
      previewPath: published.publicUrl,
      deploymentPath: published.publicUrl,
      deploymentType: 'external_static',
      localPreviewPath: local.previewPath,
      publicUrl: published.publicUrl,
      publishPath: published.publishPath,
      publishTargetType: published.publishTargetType,
      summaryInstruction: EXTERNAL_DEPLOYMENT_SUMMARY_INSTRUCTION,
    }
  } catch (error) {
    return {
      ...local,
      status: 'failed',
      deploymentType: 'external_static',
      localPreviewPath: local.previewPath,
      error: `External static publish failed: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    }
  }
}

function failedDeployment(
  artifactId: string,
  title: string,
  error: string,
  version = 0,
): DeployStatusRecord {
  return {
    id: newDeploymentId(),
    artifactId,
    title,
    version,
    previewPath: artifactPreviewPath(artifactId),
    status: 'failed',
    sourceType: 'artifact',
    error,
    createdAt: Date.now(),
  }
}
