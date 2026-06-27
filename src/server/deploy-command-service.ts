import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

import { and, desc, eq } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type { MessageInsert, MessageRow } from '@/db/schema'
import { newMessageId } from '@/server/ids'
import { deployArtifactForConversation } from '@/server/tools/deploy-artifact'
import { deployWorkspaceForConversation } from '@/server/tools/deploy-workspace'
import { getEffectiveCwd } from '@/server/workspace-utils'
import type { DeployCandidateRecord, DeployStatusRecord, MessagePart } from '@/shared/types'

export interface DeployCommandIntent {
  artifactId?: string
}

export type DeployCommandDecision =
  | { kind: 'no_candidates' }
  | { kind: 'deploy'; artifactId: string }
  | { kind: 'select'; candidates: DeployCandidateRecord[] }

export type DeployCommandResult =
  | {
      kind: 'no_candidates'
      candidates: []
      message: MessageRow
    }
  | {
      kind: 'candidate_selection'
      candidates: DeployCandidateRecord[]
      message: MessageRow
    }
  | {
      kind: 'deployed'
      deployment: DeployStatusRecord
      message: MessageRow
    }

const DEPLOY_COMMAND_RE = /^(?:\/deploy|部署|发布|上线)(?:\s+(art_[0-9A-Za-z]+))?$/i

export function parseDeployCommand(content: string): DeployCommandIntent | null {
  const trimmed = content.trim()
  const match = DEPLOY_COMMAND_RE.exec(trimmed)
  if (!match) return null
  return match[1] ? { artifactId: match[1] } : {}
}

export function decideDeployCommand(
  candidates: DeployCandidateRecord[],
  artifactId?: string,
): DeployCommandDecision {
  if (artifactId) return { kind: 'deploy', artifactId }
  if (candidates.length === 0) return { kind: 'no_candidates' }
  if (candidates.length === 1) return { kind: 'deploy', artifactId: candidates[0].artifactId }
  return { kind: 'select', candidates }
}

export async function listDeployCandidates(
  conversationId: string,
): Promise<DeployCandidateRecord[]> {
  return db
    .select({
      artifactId: schema.artifacts.id,
      title: schema.artifacts.title,
      version: schema.artifacts.version,
      createdByAgentId: schema.artifacts.createdByAgentId,
      createdAt: schema.artifacts.createdAt,
    })
    .from(schema.artifacts)
    .where(
      and(
        eq(schema.artifacts.conversationId, conversationId),
        eq(schema.artifacts.type, 'web_app'),
      ),
    )
    .orderBy(desc(schema.artifacts.createdAt))
}

export async function handleDeployCommand(args: {
  conversationId: string
  artifactId?: string
  afterCreatedAt?: number
}): Promise<DeployCommandResult> {
  const candidates = args.artifactId ? [] : await listDeployCandidates(args.conversationId)
  const decision = decideDeployCommand(candidates, args.artifactId)

  switch (decision.kind) {
    case 'no_candidates': {
      const workspaceDeploy = await deployFirstWorkspaceCandidate({
        conversationId: args.conversationId,
        afterCreatedAt: args.afterCreatedAt,
      })
      if (workspaceDeploy) return workspaceDeploy

      const message = await insertSystemMessage({
        conversationId: args.conversationId,
        parts: [
          {
            type: 'text',
            content:
              '当前会话还没有可部署的网页产物，也没有找到常见的本地静态输出目录（dist/build/out/client/dist）。请先让 Agent 生成 web_app 产物，或构建本地项目后再部署。',
          },
        ],
        afterCreatedAt: args.afterCreatedAt,
      })
      return { kind: 'no_candidates', candidates: [], message }
    }
    case 'select': {
      const message = await insertSystemMessage({
        conversationId: args.conversationId,
        parts: [{ type: 'deploy_candidates', candidates: decision.candidates }],
        afterCreatedAt: args.afterCreatedAt,
      })
      return { kind: 'candidate_selection', candidates: decision.candidates, message }
    }
    case 'deploy':
      return deploySelectedArtifact({
        conversationId: args.conversationId,
        artifactId: decision.artifactId,
        afterCreatedAt: args.afterCreatedAt,
      })
  }
}

async function deployFirstWorkspaceCandidate(args: {
  conversationId: string
  afterCreatedAt?: number
}): Promise<Extract<DeployCommandResult, { kind: 'deployed' }> | null> {
  const candidate = await findWorkspaceDeployCandidate(args.conversationId)
  if (!candidate) return null

  const deployment = await deployWorkspaceForConversation(args.conversationId, {
    path: candidate.path,
    title: candidate.title,
  })
  const message = await insertSystemMessage({
    conversationId: args.conversationId,
    parts: [{ type: 'deploy_status', deployment }],
    afterCreatedAt: args.afterCreatedAt,
  })
  return { kind: 'deployed', deployment, message }
}

const WORKSPACE_DEPLOY_CANDIDATES = [
  'dist',
  'build',
  'out',
  'public',
  'client/dist',
  'client/build',
  'client/out',
  'apps/web/dist',
  'apps/web/build',
  'apps/web/out',
]

async function findWorkspaceDeployCandidate(
  conversationId: string,
): Promise<{ path: string; title: string } | null> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.conversationId, conversationId),
  })
  if (!workspace) return null
  const cwd = getEffectiveCwd(workspace)
  for (const relPath of WORKSPACE_DEPLOY_CANDIDATES) {
    const absPath = path.resolve(cwd, relPath)
    const stat = statSync(absPath, { throwIfNoEntry: false })
    if (!stat?.isDirectory()) continue
    if (!existsSync(path.join(absPath, 'index.html'))) continue
    return { path: relPath, title: `Workspace ${relPath}` }
  }
  return null
}

export async function deploySelectedArtifact(args: {
  conversationId: string
  artifactId: string
  afterCreatedAt?: number
}): Promise<Extract<DeployCommandResult, { kind: 'deployed' }>> {
  const deployment = await deployArtifactForConversation(args.conversationId, args.artifactId)
  const message = await insertSystemMessage({
    conversationId: args.conversationId,
    parts: [{ type: 'deploy_status', deployment }],
    afterCreatedAt: args.afterCreatedAt,
  })
  return { kind: 'deployed', deployment, message }
}

async function insertSystemMessage(args: {
  conversationId: string
  parts: MessagePart[]
  afterCreatedAt?: number
}): Promise<MessageRow> {
  const now = Math.max(Date.now(), (args.afterCreatedAt ?? 0) + 1)
  const message: MessageInsert = {
    id: newMessageId(),
    conversationId: args.conversationId,
    role: 'system',
    agentId: null,
    parts: args.parts,
    status: 'complete',
    parentMessageId: null,
    mentionedAgentIds: [],
    runId: null,
    usage: null,
    createdAt: now,
  }

  await db.insert(schema.messages).values(message)
  await db
    .update(schema.conversations)
    .set({ updatedAt: now })
    .where(eq(schema.conversations.id, args.conversationId))

  return message as MessageRow
}
