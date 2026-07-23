import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const script = readFileSync('scripts/agenthub-codex-mcp.mjs', 'utf8')

describe('agenthub Codex MCP bridge', () => {
  it('keeps write_artifact schema aligned with previewable artifact types', () => {
    const match = script.match(/registerTool\(\s*'write_artifact',[\s\S]*?type:\s*z\.enum\(\[([^\]]+)\]\)/)

    expect(match?.[1]).toBeDefined()
    expect(match![1]).toContain("'web_app'")
    expect(match![1]).toContain("'document'")
    expect(match![1]).toContain("'image'")
    expect(match![1]).toContain("'ppt'")
    expect(match![1]).toContain("'diagram'")
  })

  it('documents complete payloads for PPT and diagram artifacts', () => {
    const match = script.match(/registerTool\(\s*'write_artifact',[\s\S]*?registerTool\(\s*'read_artifact'/)

    expect(match?.[0]).toContain('PPT')
    expect(match?.[0]).toContain('slides')
    expect(match?.[0]).toContain('diagram')
    expect(match?.[0]).toContain('syntax: "mermaid"')
  })

  it('registers web_fetch with safety-focused schema', () => {
    const match = script.match(/registerTool\(\s*'web_fetch',[\s\S]*?registerTool\(\s*'ask_user'/)

    expect(match?.[0]).toContain('public HTTPS URL')
    expect(match?.[0]).toContain('url: z.string()')
    expect(match?.[0]).toContain('maxChars')
    expect(match?.[0]).toContain('timeoutMs')
    expect(match?.[0]).toContain('private IP ranges')
  })
})
