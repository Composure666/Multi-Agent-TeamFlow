import { eq, inArray } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type { ArtifactRow } from '@/db/schema'
import type { ArtifactContent } from '@/shared/types'
import { readArtifactImages } from '@/shared/artifact-images'
import { isServableImageUrl } from '@/server/artifact-image-store'
import { ensureImageStored } from '@/server/oss-image-store'

/**
 * 存量坏图修复。
 *
 * 早期版本会把 agent 给的「磁盘路径」原样落库（如 `scene_assets/00_sheet.png`、
 * `/deployments/dep_x/infographic.png`），前端 <img src> 必然 404。写入链路修好之后
 * 只是「以后不再产生坏图」，库里已有的仍然裂着 —— 这里在做的是补齐存量。
 *
 * 2026-09-15 扩大覆盖：写入链路曾只对顶层 content.url 做存储，而 buildArtifactContent
 * 会把封面原始 url 复制进 images[0]、agent 也会附带更多 gallery 条目 —— 图集里因此
 * 存了大量工作区相对路径。这里对顶层 url + images[] 全部条目做修复。
 *
 * 触发点只有 `listArtifacts()`（产物库列表）：读取时顺手把坏链重新存储并回写
 * content，本次请求就能拿到可用地址，不需要用户重跑会话。
 * 存储优先走 OSS（与写入链路同一入口 ensureImageStored），未配置 OSS 时本地化兜底。
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

/** 产物的全部图片 url：顶层封面 + 图集条目。 */
function extractAllImageUrls(row: ArtifactRow): string[] {
  const cover = extractImageUrl(row)
  if (cover === null) return []
  const content = row.content as { images?: unknown }
  const gallery = readArtifactImages(content)
    .map((img) => img.url)
    .filter((url): url is string => Boolean(url))
  return [...new Set([cover, ...gallery])]
}

/**
 * 入参是本次要展示的 artifact 行；返回 `artifactId -> 修复后的封面 url`。
 * 只处理 type='image' 且存在不可直接访问 url 的条目，且每条最多尝试一次。
 */
export async function repairBrokenImageArtifacts(rows: ArtifactRow[]): Promise<Map<string, string>> {
  const fixed = new Map<string, string>()

  const candidates = rows.filter((row) => {
    if (attempted.has(row.id)) return false
    return extractAllImageUrls(row).some((url) => !isServableImageUrl(url))
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
    const workspaceDir = dirByConv.get(row.conversationId)
    const content = (row.content ?? {}) as Record<string, unknown>
    let changed = false

    // 逐条重存（封面 + 图集），坏一条修一条，好的原样保留
    const cover = extractImageUrl(row)
    if (cover && !isServableImageUrl(cover)) {
      const stored = await ensureImageStored(cover, workspaceDir)
      if (stored.ok) {
        content.url = stored.url
        changed = true
      } else {
        console.warn(
          `[artifact-image-repair] cannot re-store ${row.id} cover (${cover.slice(0, 64)}): ${stored.error}`,
        )
      }
    }

    const gallery = readArtifactImages(content)
    if (gallery.length > 0) {
      const repaired = await Promise.all(
        gallery.map(async (img) => {
          if (isServableImageUrl(img.url)) return img
          const stored = await ensureImageStored(img.url, workspaceDir)
          if (stored.ok) {
            changed = true
            return { ...img, url: stored.url }
          }
          console.warn(
            `[artifact-image-repair] cannot re-store ${row.id} gallery item (${img.url.slice(0, 64)}): ${stored.error}`,
          )
          return img
        }),
      )
      content.images = repaired
    }

    if (!changed) continue

    await db
      .update(schema.artifacts)
      .set({ content: content as unknown as ArtifactContent })
      .where(eq(schema.artifacts.id, row.id))
    const fixedUrl = typeof content.url === 'string' ? content.url : undefined
    if (fixedUrl) fixed.set(row.id, fixedUrl)
  }

  if (fixed.size > 0) {
    console.info(`[artifact-image-repair] repaired ${fixed.size} broken image artifact url(s)`)
  }
  return fixed
}
