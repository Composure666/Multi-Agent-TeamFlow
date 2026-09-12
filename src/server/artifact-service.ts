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
  imageUrl?: string
  description?: string
  pptCover?: {
    title?: string
    subtitle?: string
    bullets?: string[]
    primaryColor?: string
    bgColor?: string
  }
}

function extractPptCover(row: ArtifactRow) {
  if (row.type !== 'ppt') return undefined
  try {
    const c = row.content as unknown as { slides?: Array<{ title?: string; subtitle?: string; bullets?: string[] }>; theme?: { primary?: string; background?: string } }
    const firstSlide = c.slides?.[0]
    if (!firstSlide) return undefined
    return {
      title: firstSlide.title,
      subtitle: firstSlide.subtitle,
      bullets: firstSlide.bullets?.slice(0, 3),
      primaryColor: c.theme?.primary,
      bgColor: c.theme?.background,
    }
  } catch {
    return undefined
  }
}

function extractDescription(row: ArtifactRow): string | undefined {
  try {
    const c = row.content as unknown as Record<string, unknown>
    switch (row.type) {
      case 'document': {
        const text = String(c.content ?? '')
        // 取第一段非空文本，去掉 markdown 符号
        const firstPara = text
          .split(/\n\n/)
          .map((s) => s.trim())
          .find((s) => s.length > 0 && !s.startsWith('#'))
        if (firstPara) return firstPara.replace(/[#*_`>\-]/g, '').slice(0, 60)
        const firstLine = text.split('\n').find((s) => s.trim().length > 0)
        return firstLine ? firstLine.replace(/[#*_`>]/g, '').trim().slice(0, 60) : undefined
      }
      case 'code_file': {
        const lang = String(c.language ?? '代码')
        const path = String(c.workspacePath ?? '')
        const size = Number(c.sizeBytes ?? 0)
        const sizeStr = size > 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`
        return `${lang} 代码文件 · ${path.split('/').pop() ?? path} · ${sizeStr}`
      }
      case 'web_app': {
        const files = c.files as Record<string, string> | undefined
        const count = files ? Object.keys(files).length : 0
        return `Web 应用原型 · ${count} 个文件 · 入口 ${String(c.entry ?? 'index.html')}`
      }
      case 'project': {
        const files = c.files as Array<{ path: string }> | undefined
        const count = files?.length ?? 0
        const exts = new Set((files ?? []).map((f) => f.path.split('.').pop() ?? '').filter(Boolean))
        const tech = Array.from(exts).slice(0, 3).join(' / ')
        return `项目工程 · ${count} 个文件${tech ? ` · ${tech}` : ''}`
      }
      case 'image': {
        const alt = String(c.alt ?? '')
        const w = c.width, h = c.height
        const dim = w && h ? ` · ${w}×${h}` : ''
        return alt ? `${alt}${dim}` : `图片产物${dim}`
      }
      case 'diagram': {
        const source = String(c.source ?? '')
        const firstLine = source.split('\n').find((s) => s.trim().length > 0 && !s.trim().startsWith('%%'))
        return firstLine ? `架构图 · ${firstLine.trim().slice(0, 50)}` : '架构图 / 流程图'
      }
      case 'ppt': {
        const slides = c.slides as Array<unknown> | undefined
        const count = slides?.length ?? 0
        return `PPT 演示文稿 · ${count} 页幻灯片`
      }
      default:
        return undefined
    }
  } catch {
    return undefined
  }
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

  return rows.map((r) => {
    let imageUrl: string | undefined
    if (r.type === 'image') {
      imageUrl = (r.content as unknown as { url?: string })?.url
    }
    return {
      id: r.id,
      conversationId: r.conversationId,
      conversationTitle: titleById.get(r.conversationId) ?? null,
      type: r.type,
      title: r.title,
      version: r.version,
      parentArtifactId: r.parentArtifactId,
      createdByAgentId: r.createdByAgentId,
      createdAt: r.createdAt,
      imageUrl,
      description: extractDescription(r),
      pptCover: extractPptCover(r),
    }
  })
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
