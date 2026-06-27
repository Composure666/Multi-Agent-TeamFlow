import { describe, expect, it } from 'vitest'

import type { DeployCandidateRecord } from '@/shared/types'

import {
  decideDeployCommand,
  parseDeployCommand,
} from './deploy-command-service'

function candidate(id: string, createdAt: number): DeployCandidateRecord {
  return {
    artifactId: id,
    title: `App ${id}`,
    version: 1,
    createdByAgentId: 'ag_author',
    createdAt,
  }
}

describe('parseDeployCommand', () => {
  it('accepts exact deploy command phrases', () => {
    expect(parseDeployCommand('部署')).toEqual({})
    expect(parseDeployCommand(' 发布 ')).toEqual({})
    expect(parseDeployCommand('上线')).toEqual({})
    expect(parseDeployCommand('/deploy')).toEqual({})
  })

  it('accepts an explicit artifact id', () => {
    expect(parseDeployCommand('/deploy art_abcXYZ123456')).toEqual({
      artifactId: 'art_abcXYZ123456',
    })
    expect(parseDeployCommand('部署 art_abcXYZ123456')).toEqual({
      artifactId: 'art_abcXYZ123456',
    })
  })

  it('rejects non-command text and decorated requests', () => {
    expect(parseDeployCommand('帮我部署一下')).toBeNull()
    expect(parseDeployCommand('/deploy now')).toBeNull()
    expect(parseDeployCommand('部署 art_abc-123')).toBeNull()
  })
})

describe('decideDeployCommand', () => {
  it('asks for no-candidate feedback when no web apps exist', () => {
    expect(decideDeployCommand([])).toEqual({ kind: 'no_candidates' })
  })

  it('auto-deploys the only candidate', () => {
    expect(decideDeployCommand([candidate('art_one', 1)])).toEqual({
      kind: 'deploy',
      artifactId: 'art_one',
    })
  })

  it('asks the UI to select when multiple candidates exist', () => {
    const candidates = [candidate('art_new', 2), candidate('art_old', 1)]
    expect(decideDeployCommand(candidates)).toEqual({
      kind: 'select',
      candidates,
    })
  })

  it('uses an explicit artifact id without candidate selection', () => {
    expect(decideDeployCommand([candidate('art_other', 1)], 'art_selected')).toEqual({
      kind: 'deploy',
      artifactId: 'art_selected',
    })
  })
})
