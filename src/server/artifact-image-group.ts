import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type { ArtifactRow } from '@/db/schema'
import { readArtifactImages } from '@/shared/artifact-images'
import type { ArtifactContent, ArtifactImageItem } from '@/shared/types'

/**
 * 图片产物的「图集聚合」。
 *
 * 背景：一次「电商爆图工厂」任务会在几秒内连出 7、8 个 image artifact，产物库里
 * 就是 8 张碎片卡片，用户找不到「这次任务交付了什么」。更糟的是 Agent 自检后重出
 * 一批，又多 8 张。
 *
 * 规则（同会话内，按时间判定）：
 *   1. 距上一个图集产物 ≤ BATCH_WINDOW   → **追加**：图塞进同一个产物的 content.images，
 *                                          不新增行、不涨版本号（一次任务的多次出图）。
 *   2. 距上一个图集产物 ≤ REVISION_WINDOW → **新版本**：parent 指向上一个版本，version+1
 *                                          （修改任务 / Agent 自检后的重做，仍然算一个产物）。
 *   3. 更久                                → 新开一个图集。
 *
 * 工具描述里也写了这条约定，Agent 显式传 parentArtifactId 时优先按它的意图走。
 */

/** 同一批次窗口：覆盖一次任务内多次出图之间的思考/重试间隔。 */
export const IMAGE_BATCH_WINDOW_MS = 5 * 60 * 1000
/** 修订窗口：超过批次窗口但仍在窗口内的再次出图，视为在上一个版本上修改。 */
export const IMAGE_REVISION_WINDOW_MS = 6 * 60 * 60 * 1000

export type ImageArtifactTarget =
  | { mode: 'append'; target: ArtifactRow }
  | { mode: 'version'; parent: ArtifactRow; version: number }
  | { mode: 'create' }

export interface ResolveImageTargetInput {
  conversationId: string
  /** 绝对时间；传进来是为了让调用方（与测试）能固定时间轴。 */
  now: number
}

/** 找出本会话「当前」那个图集产物（merged_into 为空 = 图集根/最新版本）。 */
async function findLatestGallery(conversationId: string): Promise<ArtifactRow | null> {
  const rows = await db
    .select()
    .from(schema.artifacts)
    .where(
      and(
        eq(schema.artifacts.conversationId, conversationId),
        eq(schema.artifacts.type, 'image'),
        isNull(schema.artifacts.mergedInto),
      ),
    )
    .orderBy(desc(sql`coalesce(${schema.artifacts.updatedAt}, ${schema.artifacts.createdAt})`))
    .limit(1)
  return rows[0] ?? null
}

export async function resolveImageArtifactTarget(input: ResolveImageTargetInput): Promise<ImageArtifactTarget> {
  const target = await findLatestGallery(input.conversationId)
  if (!target) return { mode: 'create' }
  const lastTouch = target.updatedAt ?? target.createdAt
  const gap = input.now - lastTouch
  if (gap >= 0 && gap <= IMAGE_BATCH_WINDOW_MS) return { mode: 'append', target }
  if (gap > 0 && gap <= IMAGE_REVISION_WINDOW_MS) {
    return { mode: 'version', parent: target, version: target.version + 1 }
  }
  return { mode: 'create' }
}

/**
 * 把一张图追加进已有图集产物（不新增行、不涨版本）。
 * 返回追加后的图片总数，便于工具回执告诉 Agent「这是第几张」。
 */
export async function appendImageToArtifact(
  target: ArtifactRow,
  image: ArtifactImageItem,
  now: number,
): Promise<{ images: ArtifactImageItem[] }> {
  const existing = readArtifactImages(target.content)
  const images = dedupe([...existing, image])
  const first = images[0]
  const content = {
    ...(target.content as unknown as Record<string, unknown>),
    url: first.url,
    alt: first.alt ?? '',
    images,
  } as unknown as ArtifactContent

  await db
    .update(schema.artifacts)
    .set({ content, updatedAt: now })
    .where(eq(schema.artifacts.id, target.id))

  return { images }
}

/** 图集里已有的图片条目（供写入侧构造新版本内容时继承上一版）。 */
export function imagesOf(row: ArtifactRow): ArtifactImageItem[] {
  return readArtifactImages(row.content)
}

function dedupe(items: ArtifactImageItem[]): ArtifactImageItem[] {
  const seen = new Set<string>()
  const out: ArtifactImageItem[] = []
  for (const item of items) {
    if (seen.has(item.url)) continue
    seen.add(item.url)
    out.push(item)
  }
  return out
}
