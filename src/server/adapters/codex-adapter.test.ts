import { describe, expect, it } from 'vitest'

import { buildExternalCodexMcpServers } from './codex-adapter'
import type { ExternalMcpServerConfig } from './types'

const servers: ExternalMcpServerConfig[] = [
  {
    id: 'mcp_always',
    name: 'trusted',
    transport: 'stdio',
    command: 'node',
    args: ['trusted.js'],
    env: { TOKEN: 'trusted' },
    trust: 'always',
  },
  {
    id: 'mcp_ask',
    name: 'ask_first',
    transport: 'stdio',
    command: 'node',
    args: ['ask.js'],
    env: { TOKEN: 'ask' },
    trust: 'ask',
  },
]

describe('Codex external MCP config', () => {
  it('passes only always-trusted external MCP servers', () => {
    expect(buildExternalCodexMcpServers(servers)).toEqual({
      trusted: {
        command: 'node',
        args: ['trusted.js'],
        env: { TOKEN: 'trusted' },
      },
    })
  })
})
