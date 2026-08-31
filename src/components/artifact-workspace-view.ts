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
