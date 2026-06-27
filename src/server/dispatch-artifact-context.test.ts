import { describe, expect, it } from 'vitest'

import { renderExistingArtifactsContext } from './dispatch-artifact-context'

describe('renderExistingArtifactsContext', () => {
  it('gives Orchestrator real artifact ids and forbids guessing ids', () => {
    const context = renderExistingArtifactsContext([
      {
        id: 'art_prd123',
        type: 'document',
        title: 'PRD - Tourism System',
        createdByAgentId: 'ag_pm',
      },
      {
        id: 'art_design456',
        type: 'document',
        title: 'Tourism UI Style Guide',
        createdByAgentId: 'ag_designer',
      },
    ])

    expect(context).toContain('<existing_artifacts>')
    expect(context).toContain('id="art_prd123"')
    expect(context).toContain('title="PRD - Tourism System"')
    expect(context).toContain('id="art_design456"')
    expect(context).toContain('read_artifact')
    expect(context).toContain('Do not guess artifact ids')
  })
})
