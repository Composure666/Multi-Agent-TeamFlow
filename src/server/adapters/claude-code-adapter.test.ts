import { describe, expect, it } from 'vitest'

import { parseExternalMcpToolName } from './claude-code-adapter'
import type { ExternalMcpServerConfig } from './types'

const servers: ExternalMcpServerConfig[] = [
  {
    id: 'mcp_github',
    name: 'github',
    transport: 'stdio',
    command: 'node',
    args: ['github.js'],
    env: {},
    trust: 'ask',
  },
]

describe('Claude Code external MCP tool parsing', () => {
  it('parses enabled external MCP tool names', () => {
    expect(parseExternalMcpToolName('mcp__github__create_issue', servers)).toMatchObject({
      server: servers[0],
      toolName: 'create_issue',
      sdkToolName: 'mcp__github__create_issue',
    })
  })

  it('does not match internal AgentHub MCP or unrelated tools', () => {
    expect(parseExternalMcpToolName('mcp__agenthub__write_artifact', servers)).toBeNull()
    expect(parseExternalMcpToolName('Read', servers)).toBeNull()
  })
})
