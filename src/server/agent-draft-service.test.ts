import { describe, expect, it } from 'vitest'

import { AgentDraftRequestSchema } from './agent-draft-schema'
import { buildHeuristicAgentConfigDraft } from './agent-draft-service'

describe('agent draft service', () => {
  it('maps local code intent to workspace tools', () => {
    const draft = buildHeuristicAgentConfigDraft({
      intent: '我想创建一个能修改本地仓库代码、运行测试并修复 bug 的 Agent',
    })

    expect(draft.name).toBe('代码工程师')
    expect(draft.toolNames).toContain('fs_write')
    expect(draft.toolNames).toContain('bash')
    expect(draft.toolNames).toContain('deploy_workspace')
    expect(draft.toolNames).not.toContain('write_artifact')
    expect(draft.toolPermissionSummaries.map((summary) => summary.toolName)).toEqual(
      draft.toolNames,
    )
  })

  it('maps review intent to read and verification tools without write permission', () => {
    const draft = buildHeuristicAgentConfigDraft({
      intent: '帮我审查验证已有代码和产物，发现风险并给出修改建议',
    })

    expect(draft.name).toBe('审查验证助手')
    expect(draft.toolNames).toContain('fs_read')
    expect(draft.toolNames).toContain('bash')
    expect(draft.toolNames).not.toContain('fs_write')
    expect(draft.toolNames).not.toContain('write_artifact')
  })

  it('keeps generated drafts as non-orchestrator custom agents', () => {
    const draft = buildHeuristicAgentConfigDraft({
      intent: '创建一个负责拆任务调度其他 agent 的 plan_tasks orchestrator',
    })

    expect(draft.adapterName).toBe('custom')
    expect(draft.modelProvider).toBe('deepseek')
    expect(draft.modelId).toBe('deepseek-v4-flash')
    expect(draft.toolNames).not.toEqual(expect.arrayContaining(['plan_tasks']))
  })

  it('rejects invalid draft requests at the schema boundary', () => {
    expect(AgentDraftRequestSchema.safeParse({ intent: '' }).success).toBe(false)
    expect(AgentDraftRequestSchema.safeParse({ intent: '做一个代码助手' }).success).toBe(true)
  })
})
