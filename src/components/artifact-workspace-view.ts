import type { ArtifactListItem } from '@/lib/api'
import type { ArtifactVersionGroup } from '@/lib/artifact-groups'

export type ArtifactTabId = 'all' | 'document' | 'web_app' | 'ppt' | 'image' | 'project' | 'code'

export const ARTIFACT_TABS: Array<{ id: ArtifactTabId; label: string; types: string[] }> = [
  { id: 'all', label: '全部', types: [] },
  { id: 'document', label: '文档', types: ['document'] },
  { id: 'web_app', label: 'Web 原型', types: ['web_app'] },
  { id: 'ppt', label: 'PPT', types: ['ppt'] },
  { id: 'image', label: '图片', types: ['image'] },
  { id: 'project', label: '项目', types: ['project'] },
  { id: 'code', label: '代码', types: ['code_file', 'diff'] },
]

export function filterArtifactGroups(
  groups: ArtifactVersionGroup<ArtifactListItem>[],
  query: string,
  tabId: ArtifactTabId,
): ArtifactVersionGroup<ArtifactListItem>[] {
  const normalizedQuery = query.trim().toLowerCase()
  const tab = ARTIFACT_TABS.find((item) => item.id === tabId) ?? ARTIFACT_TABS[0]
  return groups.filter((group) => {
    const item = group.latest
    const matchesQuery = !normalizedQuery || `${item.title} ${item.type} ${item.conversationTitle ?? ''}`.toLowerCase().includes(normalizedQuery)
    const matchesTab = tab.id === 'all' || tab.types.includes(item.type)
    return matchesQuery && matchesTab
  })
}

export function getVisibleArtifactGroups(
  groups: ArtifactVersionGroup<ArtifactListItem>[],
  visibleCount: number,
): ArtifactVersionGroup<ArtifactListItem>[] {
  return groups.slice(0, Math.max(0, visibleCount))
}

export interface ArtifactConversationGroup {
  conversationId: string
  conversationTitle: string
  groups: ArtifactVersionGroup<ArtifactListItem>[]
  /** 组内最新产物的时间，用于会话之间的排序 */
  latestAt: number
}

/**
 * 把产物按来源会话归拢。
 *
 * 一次会话常常产出十几个产物，平铺在列表里很难看清「哪些是同一件事的」。
 * 按会话分组后，一组就是一个任务的交付集。
 */
export function groupArtifactsByConversation(
  groups: ArtifactVersionGroup<ArtifactListItem>[],
): ArtifactConversationGroup[] {
  const byConversation = new Map<string, ArtifactConversationGroup>()

  for (const group of groups) {
    const conversationId = group.latest.conversationId
    const existing = byConversation.get(conversationId)
    if (existing) {
      existing.groups.push(group)
      existing.latestAt = Math.max(existing.latestAt, group.latest.createdAt)
      continue
    }
    byConversation.set(conversationId, {
      conversationId,
      conversationTitle: group.latest.conversationTitle?.trim() || '未命名会话',
      groups: [group],
      latestAt: group.latest.createdAt,
    })
  }

  const out = [...byConversation.values()]
  out.sort((a, b) => b.latestAt - a.latestAt)
  for (const item of out) {
    item.groups.sort((a, b) => b.latest.createdAt - a.latest.createdAt)
  }
  return out
}
