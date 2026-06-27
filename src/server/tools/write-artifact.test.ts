import { describe, expect, it } from 'vitest'

import { writeArtifactTool } from './write-artifact'

describe('writeArtifactTool', () => {
  it('returns actionable guidance for empty tool calls', async () => {
    const result = await writeArtifactTool.handler(
      {},
      {
        conversationId: 'conv_test',
        workspacePath: 'C:/tmp/workspace',
        agentId: 'ag_test',
        runId: 'run_test',
        abortSignal: new AbortController().signal,
      },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('write_artifact requires complete args')
      expect(result.error).toContain('type')
      expect(result.error).toContain('title')
      expect(result.error).toContain('content')
      expect(result.error).toContain('document')
    }
  })
})
