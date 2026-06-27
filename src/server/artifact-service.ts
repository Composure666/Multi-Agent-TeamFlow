import { desc, eq, inArray } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type { ArtifactRow } from '@/db/schema'
import { buildArtifactContent, describeArtifactContentError } from '@/server/artifact-content'
import { newArtifactId } from '@/server/ids'

/**
 * Artifact 全局服务。
 *
 * 列表查询时一次性 JOIN 出会话标题（避免前端 N+1 查询）。
 */

export interface ArtifactWithMeta {
  id: string
  conversationId: string
  conversationTitle: string | null
  type: string
  title: string
  version: number
  parentArtifactId: string | null
  createdByAgentId: string
  createdAt: number
}

export async function listArtifacts(): Promise<ArtifactWithMeta[]> {
  const rows = await db.query.artifacts.findMany({
    orderBy: [desc(schema.artifacts.createdAt)],
  })
  if (rows.length === 0) return []

  const convIds = Array.from(new Set(rows.map((r) => r.conversationId)))
  const convs = await db.query.conversations.findMany({
    where: inArray(schema.conversations.id, convIds),
  })
  const titleById = new Map(convs.map((c) => [c.id, c.title]))

  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversationId,
    conversationTitle: titleById.get(r.conversationId) ?? null,
    type: r.type,
    title: r.title,
    version: r.version,
    parentArtifactId: r.parentArtifactId,
    createdByAgentId: r.createdByAgentId,
    createdAt: r.createdAt,
  }))
}

export async function deleteArtifact(artifactId: string): Promise<void> {
  const deleted = await db
    .delete(schema.artifacts)
    .where(eq(schema.artifacts.id, artifactId))
    .returning({ id: schema.artifacts.id })

  if (deleted.length === 0) {
    throw new Error(`Artifact not found: ${artifactId}`)
  }
}

export type CreateArtifactVersionResult =
  | { ok: true; artifact: ArtifactRow }
  | { ok: false; error: string; status: 400 | 404 }

/**
 * 基于已有产物创建新版本 —— 用户在产物面板编辑后「提交为新版本」走的确定性路径
 * (区别于 agent 经 write_artifact 的 LLM 驱动写入)。
 *
 * 继承 parent 的 conversationId / type / createdByAgentId(免迁移、免 FK 问题),
 * version = parent.version + 1,parentArtifactId 链接父行。内容用 buildArtifactContent
 * 与 write_artifact 共用校验。
 */
export async function createArtifactVersion(
  parentArtifactId: string,
  rawContent: unknown,
  title?: string,
): Promise<CreateArtifactVersionResult> {
  const parent = await db.query.artifacts.findFirst({
    where: eq(schema.artifacts.id, parentArtifactId),
  })
  if (!parent) {
    return { ok: false, error: `Artifact not found: ${parentArtifactId}`, status: 404 }
  }

  const content = buildArtifactContent(parent.type, rawContent)
  if (!content) {
    return {
      ok: false,
      error: describeArtifactContentError(parent.type, rawContent) ?? `Invalid content for type ${parent.type}`,
      status: 400,
    }
  }

  const [artifact] = await db
    .insert(schema.artifacts)
    .values({
      id: newArtifactId(),
      conversationId: parent.conversationId,
      type: parent.type,
      title: title?.trim() || parent.title,
      content,
      version: parent.version + 1,
      parentArtifactId: parent.id,
      createdByAgentId: parent.createdByAgentId,
      createdAt: Date.now(),
    })
    .returning()

  return { ok: true, artifact }
}
