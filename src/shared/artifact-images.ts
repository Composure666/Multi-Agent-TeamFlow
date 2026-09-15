import type { ArtifactImageItem } from '@/shared/types'

/**
 * 图片产物的「图集」读取工具 —— 前后端共用。
 *
 * 历史数据只有 `{ url, alt }` 一张图；一次任务连出 7、8 张图的场景会把它们合并进
 * 同一个产物的 `content.images`。所有读图的地方都必须走这里，不要直接读 `content.url`，
 * 否则图集里后面的几张图会消失。
 */

/** 取出图集里的全部图片；老数据（只有 url）兜底成单图数组。 */
export function readArtifactImages(content: unknown): ArtifactImageItem[] {
  if (!content || typeof content !== 'object') return []
  const c = content as { url?: unknown; alt?: unknown; images?: unknown }
  const items: ArtifactImageItem[] = []
  if (Array.isArray(c.images)) {
    for (const raw of c.images) {
      const item = normalizeImageItem(raw)
      if (item) items.push(item)
    }
  }
  if (items.length > 0) return dedupeByUrl(items)
  const url = typeof c.url === 'string' ? c.url.trim() : ''
  if (!url) return []
  return [{ url, alt: typeof c.alt === 'string' ? c.alt : '' }]
}

/** 图集张数（用于产物卡片的「N 张」角标）。 */
export function countArtifactImages(content: unknown): number {
  return readArtifactImages(content).length
}

function normalizeImageItem(raw: unknown): ArtifactImageItem | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const url = typeof item.url === 'string' ? item.url.trim() : ''
  if (!url) return null
  return {
    url,
    ...(typeof item.alt === 'string' ? { alt: item.alt } : {}),
    ...(typeof item.title === 'string' ? { title: item.title } : {}),
    ...(typeof item.width === 'number' ? { width: item.width } : {}),
    ...(typeof item.height === 'number' ? { height: item.height } : {}),
  }
}

function dedupeByUrl(items: ArtifactImageItem[]): ArtifactImageItem[] {
  const seen = new Set<string>()
  const out: ArtifactImageItem[] = []
  for (const item of items) {
    if (seen.has(item.url)) continue
    seen.add(item.url)
    out.push(item)
  }
  return out
}
