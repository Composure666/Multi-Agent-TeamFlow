import { describe, expect, it } from 'vitest'

import type { ArtifactListItem } from '@/lib/api'

import { artifactExportUrl, buildArtifactReference } from './artifact-workspace'

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
