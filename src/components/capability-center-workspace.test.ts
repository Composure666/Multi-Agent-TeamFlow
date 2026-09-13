import { describe, expect, it } from 'vitest'

import type { AgentRow } from '@/db/schema'

import { buildAgentCapabilityBindings, buildCapabilityBindings } from './capability-bindings'

function createAgent(id: string, skillIds: string[] = [], mcpServerIds: string[] = []): AgentRow {
  return {
    id,
    name: id,
    avatar: '',
    description: '',
    capabilities: [],
    systemPrompt: '',
    adapterName: 'custom',
    modelProvider: null,
    modelId: null,
    apiKey: null,
    apiBaseUrl: null,
    toolNames: [],
    mcpServerIds,
    skillIds,
    isBuiltin: false,
    isOrchestrator: false,
    supportsVision: false,
    modality: 'text',
    createdAt: 0,
  }
}

describe('capability center binding projections', () => {
  it('sorts capabilities by binding count and preserves missing references', () => {
    const agents = [
      createAgent('alpha', ['skill-shared', 'skill-missing']),
      createAgent('beta', ['skill-shared']),
    ]

    expect(buildCapabilityBindings(agents, [{ id: 'skill-shared', name: 'Shared skill' }], 'skillIds')).toEqual([
      { id: 'skill-shared', name: 'Shared skill', agents, missing: false },
      { id: 'skill-missing', name: '未找到能力：skill-missing', agents: [agents[0]], missing: true },
    ])
  })

  it('groups skills and MCP servers by agent and orders the busiest agent first', () => {
    const agents = [
      createAgent('alpha', ['skill-one'], ['mcp-one']),
      createAgent('beta', ['skill-missing']),
      createAgent('idle'),
    ]

    const result = buildAgentCapabilityBindings(
      agents,
      [{ id: 'skill-one', name: 'Skill one' }],
      [{ id: 'mcp-one', name: 'MCP one' }],
    )

    expect(result.map((item) => item.agent.id)).toEqual(['alpha', 'beta'])
    expect(result[1]?.skills).toEqual([{ id: 'skill-missing', name: '未找到能力：skill-missing', missing: true }])
  })
})
