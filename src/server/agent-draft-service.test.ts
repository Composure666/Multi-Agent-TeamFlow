import { describe, expect, it } from 'vitest'

import { AgentDraftRequestSchema } from './agent-draft-schema'
import { buildHeuristicAgentConfigDraft } from './agent-draft-service'

describe('agent draft service', () => {
  it('maps local code intent to workspace tools', () => {
    const draft = buildHeuristicAgentConfigDraft({
      intent: '我想创建一个能修改本地仓库代码、运行测试并修复 bug 的 Agent',
    })

    expect(draft.name).toBe('代码工程师')
    // SDK adapter 不写 toolNames（走 SDK 内置工具集），权限范围看 toolPermissionSummaries
    expect(draft.toolNames).toEqual([])
    const summaryTools = draft.toolPermissionSummaries.map((summary) => summary.toolName)
    expect(summaryTools).toContain('fs_write')
    expect(summaryTools).toContain('bash')
    expect(summaryTools).toContain('deploy_workspace')
    expect(summaryTools).not.toContain('write_artifact')
  })

  it('maps review intent to read and verification tools without write permission', () => {
    const draft = buildHeuristicAgentConfigDraft({
      intent: '帮我审查验证已有代码和产物，发现风险并给出修改建议',
    })

    expect(draft.name).toBe('审查验证助手')
    const summaryTools = draft.toolPermissionSummaries.map((summary) => summary.toolName)
    expect(summaryTools).toContain('fs_read')
    expect(summaryTools).toContain('bash')
    expect(summaryTools).not.toContain('fs_write')
    expect(summaryTools).not.toContain('write_artifact')
  })

  it('keeps generated drafts as non-orchestrator claude-code agents', () => {
    const draft = buildHeuristicAgentConfigDraft({
      intent: '创建一个负责拆任务调度其他 agent 的 plan_tasks orchestrator',
    })

    expect(draft.adapterName).toBe('claude-code')
    expect(draft.modelProvider).toBe('deepseek')
    expect(draft.modelId).toBe('deepseek-flash')
    expect(draft.toolNames).not.toEqual(expect.arrayContaining(['plan_tasks']))
  })

  it('rejects invalid draft requests at the schema boundary', () => {
    expect(AgentDraftRequestSchema.safeParse({ intent: '' }).success).toBe(false)
    expect(AgentDraftRequestSchema.safeParse({ intent: '做一个代码助手' }).success).toBe(true)
  })
})
