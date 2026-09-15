import { eq, inArray } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type { ArtifactRow } from '@/db/schema'
import type { ArtifactContent } from '@/shared/types'
import { IMAGE_DIR, isServableImageUrl, localizeImageUrl } from '@/server/artifact-image-store'

/**
 * 存量坏图修复。
 *
 * 早期版本会把 agent 给的「磁盘路径」原样落库（如 `scene_assets/00_sheet.png`、
 * `/deployments/dep_x/infographic.png`），前端 <img src> 必然 404。写入链路修好之后
 * 只是「以后不再产生坏图」，库里已有的仍然裂着 —— 这里在做的是补齐存量。
 *
 * 触发点只有 `listArtifacts()`（产物库列表）：读取时顺手把坏链本地化并回写
 * content.url，本次请求就能拿到可用地址，不需要用户重跑会话。
 */

/** 已尝试过（成功或失败）的 artifact，避免每次列表都重复读盘。 */
const attempted = new Set<string>()

export function extractImageUrl(row: ArtifactRow): string | null {
  if (row.type !== 'image') return null
  const content = row.content as unknown
  if (!content || typeof content !== 'object') return null
  const url = (content as { url?: unknown }).url
  return typeof url === 'string' && url.length > 0 ? url : null
}

/**
 * 入参是本次要展示的 artifact 行；返回 `artifactId -> 修复后的 url`。
 * 只处理 type='image' 且 url 不可直接访问的条目，且每条最多尝试一次。
 */
export async function repairBrokenImageArtifacts(rows: ArtifactRow[]): Promise<Map<string, string>> {
  const fixed = new Map<string, string>()

  const candidates = rows.filter((row) => {
    const url = extractImageUrl(row)
    return url !== null && !isServableImageUrl(url) && !attempted.has(row.id)
  })
  if (candidates.length === 0) return fixed

  const convIds = Array.from(new Set(candidates.map((row) => row.conversationId)))
  const workspaces = await db.query.workspaces.findMany({
    where: inArray(schema.workspaces.conversationId, convIds),
  })
  const dirByConv = new Map(
    workspaces.map((w) => [w.conversationId, w.boundPath ?? w.rootPath]),
  )

  for (const row of candidates) {
    attempted.add(row.id)
    const url = extractImageUrl(row)
    if (!url) continue

    const workspaceDir = dirByConv.get(row.conversationId)
    const result = await localizeImageUrl(url, IMAGE_DIR, workspaceDir)
    if (!result.ok) {
      console.warn(
        `[artifact-image-repair] cannot localize ${row.id} (${url.slice(0, 64)}): ${result.error}`,
      )
      continue
    }

    const content = (row.content ?? {}) as Record<string, unknown>
    await db
      .update(schema.artifacts)
      .set({ content: { ...content, url: result.url } as unknown as ArtifactContent })
      .where(eq(schema.artifacts.id, row.id))
    fixed.set(row.id, result.url)
  }

  if (fixed.size > 0) {
    console.info(`[artifact-image-repair] repaired ${fixed.size} broken image artifact url(s)`)
  }
  return fixed
}
