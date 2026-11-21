import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { ArtifactListItem } from '@/lib/api'

import { artifactExportUrl, buildArtifactReference } from './artifact-workspace'

const source = readFileSync(path.join(__dirname, 'artifact-workspace.tsx'), 'utf8')

function artifact(patch: Partial<ArtifactListItem> = {}): ArtifactListItem {
  return {
    id: 'artifact/with spaces',
    conversationId: 'conversation-1',
    conversationTitle: '产品会议',
    type: 'document',
    title: '项目说明',
    version: 3,
    parentArtifactId: null,
    createdByAgentId: 'agent-1',
    createdAt: 100,
    ...patch,
  }
}

describe('artifact workspace actions', () => {
  it('encodes artifact ids in export URLs', () => {
    expect(artifactExportUrl('artifact/with spaces')).toBe('/api/artifacts/artifact%2Fwith%20spaces/export')
  })

  it('builds a stable artifact reference for chat reuse', () => {
    expect(buildArtifactReference(artifact())).toBe('请参考产物「项目说明」v3（artifactId: artifact/with spaces）。')
  })
})

describe('artifact workspace header (U-P1-3)', () => {
  it('PageHeader carries the sidebar icon Layers', () => {
    expect(source).toMatch(/<PageHeader[\s\S]*?icon=\{Layers\}/)
  })
})

describe('artifact workspace list header (U-P1-5)', () => {
  it('列表头注明总数与加载方式', () => {
    expect(source).toContain('共 {filteredGroups.length} 组 · 滚动加载，每批 {ARTIFACT_GROUP_PAGE_SIZE} 条')
  })
})
