import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { AgentRow } from '@/db/schema'

import { buildAgentCapabilityBindings, buildCapabilityBindings } from './capability-bindings'
import { sortRows, type CapabilityRow } from './capability-center-workspace'

function capabilityRow(patch: Partial<CapabilityRow> & { id: string }): CapabilityRow {
  return {
    kind: 'skill',
    name: patch.id,
    description: '',
    meta: '',
    enabled: true,
    updatedAt: 0,
    bindingCount: 0,
    ...patch,
  }
}

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

  it('sorts recent updates by updatedAt desc, not by name order', () => {
    const rows = [
      capabilityRow({ id: 'a', name: 'a-first-alphabetically', updatedAt: 100 }),
      capabilityRow({ id: 'b', name: 'b-second', updatedAt: 300 }),
      capabilityRow({ id: 'c', name: 'c-third', updatedAt: 200 }),
    ]
    expect(sortRows(rows, 'updated').map((row) => row.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('capability center: no invented numbers or actions', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src/components/capability-center-workspace.tsx'),
    'utf8',
  )

  it('recent updates are sorted by updatedAt and never invent an enable/disable event', () => {
    expect(source).toContain("sortRows(rows, 'updated')")
    expect(source).not.toContain('启用了能力')
    expect(source).not.toContain('停用了能力')
  })

  it('hot capabilities show the real binding count, never a "k 引用" figure', () => {
    expect(source).not.toContain('k 引用')
    expect(source).toContain('个 Agent 绑定')
  })

  it('no synthesized sparkline remains', () => {
    expect(source).not.toContain('buildUsageSparkline')
    expect(source).not.toContain('Sparkline')
  })
})

describe('capability center audit batch C–F (C5/D6/D8/D4/F16/D5)', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src/components/capability-center-workspace.tsx'),
    'utf8',
  )

  it('C5: MCP caption no longer shows a fabricated weekly call count', () => {
    expect(source).not.toContain('次调用')
    expect(source).not.toContain('weekRuns')
  })

  it('D6: binding relations card wires onViewAll to the bindings dialog', () => {
    expect(source).toContain("onViewAll={() => setShowAllSection('bindings')}")
    expect(source).toContain("showAllSection === 'bindings'")
  })

  it('D8: all three "view all" dialogs truncate at 50 rows and show the total', () => {
    expect(source.match(/slice\(0, 50\)/g)).toHaveLength(3)
    expect(source).toContain('共 {rows.length} 条')
    expect(source).toContain('共 {bindingRelations.length} 条')
  })

  it('D4: hand-rolled EmptyHint is gone, shared compact EmptyState is used instead', () => {
    expect(source).not.toContain('EmptyHint')
    expect(source).toContain('EmptyState')
    expect(source.match(/<EmptyState compact/g)).toHaveLength(6)
    expect(source).not.toContain('<EmptyState title=')
  })

  it('F16: disabled binding row button explains why it is disabled', () => {
    expect(source).toContain("title={firstAgentId ? '查看绑定的 Agent' : '暂无绑定 Agent'}")
  })

  it('D5: all three "查看全部" buttons open a modal, so the label stays', () => {
    expect(source.match(/查看全部/g)).toHaveLength(3)
  })
})

describe('capability center binding projections (continued)', () => {
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
