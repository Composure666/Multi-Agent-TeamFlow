import { describe, expect, it } from 'vitest'

import type { AgentRow } from '@/db/schema'

import { filterAgentPresets, filterMyAgents, getVisibleAgentPresets, projectMyAgents, type AgentPresetView } from './agent-workspace-model'

const presets: AgentPresetView[] = [
  { id: 'explore', name: 'Explore', displayName: '代码探索助手', category: '研发协作', description: '理解代码结构', capabilities: ['代码探索', '搜索'] },
  { id: 'report', name: 'Report', displayName: '报告写作助手', category: '文档', description: '生成结构化报告', capabilities: ['写作'] },
]

function agent(patch: Partial<AgentRow>): AgentRow {
  return {
    id: 'agent-1',
    name: 'Custom Agent',
    avatar: '',
    description: '自定义助手',
    capabilities: [],
    systemPrompt: '',
    adapterName: 'custom',
    modelProvider: null,
    modelId: null,
    apiKey: null,
    apiBaseUrl: null,
    toolNames: [],
    mcpServerIds: [],
    skillIds: [],
    supportsVision: false,
    isBuiltin: false,
    isOrchestrator: false,
    createdAt: 1,
    ...patch,
  }
}

describe('agent workspace projections', () => {
  it('searches presets by display name, original name, description, and capabilities', () => {
    expect(filterAgentPresets(presets, '代码探索', '全部')).toHaveLength(1)
    expect(filterAgentPresets(presets, 'Report', '全部')).toHaveLength(1)
    expect(filterAgentPresets(presets, '结构化', '文档')).toHaveLength(1)
    expect(filterAgentPresets(presets, '搜索', '文档')).toHaveLength(0)
  })

  it('keeps custom agents and only explicitly featured preset-backed agents', () => {
    const custom = agent({ id: 'custom' })
    const builtin = agent({ id: 'builtin', isBuiltin: true })
    const presetHidden = agent({ id: 'preset-hidden', name: 'Explore' })
    const presetFeatured = agent({ id: 'preset-featured', name: 'Report' })

    expect(projectMyAgents(
      [custom, builtin, presetHidden, presetFeatured],
      new Set(['preset-featured']),
      (item) => item.name === 'Explore' || item.name === 'Report',
    ).map((item) => item.id)).toEqual(['custom', 'preset-featured'])
  })

  it('filters my agents and caps visible presets without mutating input', () => {
    const agents = [agent({ id: 'one', name: '数据助手', description: '分析报表' }), agent({ id: 'two', name: '写作助手' })]
    expect(filterMyAgents(agents, '报表', (item) => item.name).map((item) => item.id)).toEqual(['one'])
    expect(getVisibleAgentPresets(presets, 1)).toEqual([presets[0]])
    expect(presets).toHaveLength(2)
  })
})
