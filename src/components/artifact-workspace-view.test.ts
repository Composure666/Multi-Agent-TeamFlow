import { describe, expect, it } from 'vitest'

import type { ArtifactListItem } from '@/lib/api'
import { groupArtifactVersions } from '@/lib/artifact-groups'

import { filterArtifactGroups, getVisibleArtifactGroups } from './artifact-workspace-view'

function artifact(patch: Partial<ArtifactListItem>): ArtifactListItem {
  return {
    id: 'artifact-1',
    conversationId: 'conversation-1',
    conversationTitle: '产品会议',
    type: 'document',
    title: '项目说明',
    version: 1,
    parentArtifactId: null,
    createdByAgentId: 'agent-1',
    createdAt: 100,
    ...patch,
  }
}

describe('artifact workspace view projections', () => {
  it('filters latest versions by title, type, and conversation', () => {
    const groups = groupArtifactVersions([
      artifact({ id: 'doc-1', title: '项目说明', createdAt: 100 }),
      artifact({ id: 'ppt-1', title: '季度汇报', type: 'ppt', createdAt: 200 }),
    ])

    expect(filterArtifactGroups(groups, '', 'all')).toHaveLength(2)
    expect(filterArtifactGroups(groups, '季度', 'document')).toHaveLength(0)
    expect(filterArtifactGroups(groups, '产品会议', 'all')).toHaveLength(2)
    expect(filterArtifactGroups(groups, '汇报', 'ppt')).toHaveLength(1)
  })

  it('includes both code files and diffs in the code category', () => {
    const groups = groupArtifactVersions([
      artifact({ id: 'code-1', type: 'code_file', title: '入口文件' }),
      artifact({ id: 'diff-1', type: 'diff', title: '修改补丁' }),
      artifact({ id: 'doc-1', type: 'document', title: '说明文档' }),
    ])

    expect(filterArtifactGroups(groups, '', 'code').map((group) => group.latest.id)).toEqual(['code-1', 'diff-1'])
  })

  it('caps visible groups and reports remaining groups through the result size', () => {
    const groups = groupArtifactVersions([
      artifact({ id: 'doc-1', title: '一', createdAt: 100 }),
      artifact({ id: 'doc-2', title: '二', createdAt: 200 }),
      artifact({ id: 'doc-3', title: '三', createdAt: 300 }),
    ])

    expect(getVisibleArtifactGroups(groups, 2).map((group) => group.latest.id)).toEqual(['doc-3', 'doc-2'])
  })
})
