import { describe, expect, it } from 'vitest'

import type { AgentRow } from '@/db/schema'
import type { ToolSearchResult } from '@/lib/api'

import { presentToolSearchResult } from './agent-tool-search-presentation'

function createAgent(adapterName: AgentRow['adapterName'], skillIds: string[] = [], mcpServerIds: string[] = []): AgentRow {
  return {
    id: 'agent-one',
    name: 'Agent one',
    avatar: '',
    description: '',
    capabilities: [],
    systemPrompt: '',
    adapterName,
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
    createdAt: 0,
  }
}

function createResult(patch: Partial<ToolSearchResult> = {}): ToolSearchResult {
  return {
    id: 'github:skill:owner/repo:SKILL.md',
    name: 'Repo skill',
    description: 'A remote skill',
    type: 'skill',
    kind: 'skill',
    source: 'github',
    githubUrl: 'https://github.com/owner/repo',
    installUrl: 'https://raw.githubusercontent.com/owner/repo/main/SKILL.md',
    manifestUrl: 'https://raw.githubusercontent.com/owner/repo/main/agenthub.skill.json',
    tags: ['github', 'skill'],
    status: 'remote',
    compatibility: { custom: 'supported' },
    ...patch,
  }
}

describe('presentToolSearchResult', () => {
  it('marks a complete compatible skill already bound to the target agent', () => {
    const result = createResult()
    const presentation = presentToolSearchResult(result, createAgent('custom', [result.id]))

    expect(presentation).toMatchObject({
      compatible: true,
      bound: true,
      compatibilityLabel: '兼容 custom',
      completenessLabel: '内容完整',
      riskLabel: '提示词规则',
    })
  })

  it('flags an unsupported MCP result with no manifest as high risk and incomplete', () => {
    const result = createResult({
      id: 'github:mcp_server:owner/repo:.agenthub/mcp.json',
      type: 'mcp_server',
      kind: 'mcp_server',
      installUrl: 'https://github.com/owner/repo#install',
      manifestUrl: null,
      compatibility: { codex: 'unsupported' },
    })
    const presentation = presentToolSearchResult(result, createAgent('codex'))

    expect(presentation).toMatchObject({
      compatible: false,
      bound: false,
      compatibilityLabel: '不兼容 codex',
      completenessLabel: '缺少 Manifest',
      completenessTone: 'danger',
      riskLabel: '本机进程',
      riskTone: 'warning',
    })
  })
})
