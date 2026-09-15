import { desc, eq, inArray } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type { ArtifactRow } from '@/db/schema'
import { countArtifactImages } from '@/shared/artifact-images'
import { buildArtifactContent, describeArtifactContentError } from '@/server/artifact-content'
import { repairBrokenImageArtifacts } from '@/server/artifact-image-repair'
import { ensureImageStored } from '@/server/oss-image-store'
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
  /** 图集张数（图片产物一次任务连出多张时 > 1）；非图片类型为 undefined。 */
  imageCount?: number
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
        const count = countArtifactImages(c)
        const suffix = count > 1 ? ` · 共 ${count} 张` : dim
        return alt ? `${alt}${suffix}` : `图片产物${suffix}`
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

  // 存量坏图（工作区相对路径 / /deployments/… 等）在读取时顺手本地化并回写，
  // 拿到的 repaired 覆盖下面的 imageUrl，本次请求即可预览。
  let repaired = new Map<string, string>()
  try {
    repaired = await repairBrokenImageArtifacts(rows)
  } catch (err) {
    console.warn('[artifact-service] image repair skipped:', err)
  }

  // 图集成员（已并入别的产物的那几张图）不再单独出现 —— 产物库里一次任务只显示 1 张卡片。
  return rows
    .filter((r) => !r.mergedInto)
    .map((r) => {
      let imageUrl: string | undefined
      let imageCount: number | undefined
      if (r.type === 'image') {
        imageUrl = repaired.get(r.id) ?? (r.content as unknown as { url?: string })?.url
        imageCount = countArtifactImages(r.content)
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
        imageCount,
        description: extractDescription(r),
        pptCover: extractPptCover(r),
      }
    })
}

export async function deleteArtifact(artifactId: string): Promise<void> {
  // 图集：一并删掉被并入本产物的那些成员行，否则它们会在库里永不可见地烂掉
  await db.delete(schema.artifacts).where(eq(schema.artifacts.mergedInto, artifactId))
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

  // 图片产物统一存储：已配置 OSS → 上传 OSS（稳定远程，不落本地）；否则本地化兜底
  if (content.type === 'image') {
    const stored = await ensureImageStored(content.url)
    if (stored.ok) {
      content.url = stored.url
    } else {
      console.warn(`[createArtifactVersion] image store failed (${stored.error}); keep original url`)
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
