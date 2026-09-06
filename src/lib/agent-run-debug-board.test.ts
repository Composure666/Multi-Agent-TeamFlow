import { describe, expect, it } from 'vitest'

import type { AgentRunDebugDetail, AgentRunDebugListItem, MessageRecord } from '@/shared/types'

import {
  buildAgentRunBoardGraph,
  getAgentRunBoardStageStatus,
  getBoardPanelTabForStage,
  projectAgentRunBoardStages,
} from './agent-run-debug-board'

function buildRun(overrides: Partial<AgentRunDebugListItem> = {}): AgentRunDebugListItem {
  return {
    id: 'run_1',
    conversationId: 'conv_1',
    agentId: 'agent_1',
    agentName: 'Agent',
    adapterName: 'codex',
    modelId: 'gpt-5-codex',
    triggerMessageId: 'msg_trigger',
    parentRunId: null,
    status: 'running',
    error: null,
    usage: null,
    startedAt: 1,
    finishedAt: null,
    hasDebugSnapshot: true,
    ...overrides,
  }
}

function buildMessage(id: string, parts: MessageRecord['parts']): MessageRecord {
  return {
    id,
    conversationId: 'conv_1',
    role: 'agent',
    agentId: 'agent_1',
    parts,
    status: 'complete',
    parentMessageId: null,
    mentionedAgentIds: [],
    runId: 'run_1',
    usage: null,
    createdAt: 1,
  }
}

function buildDetail(overrides: Partial<AgentRunDebugDetail> = {}): AgentRunDebugDetail {
  return {
    agentRun: buildRun(),
    snapshot: {
      runId: 'run_1',
      conversationId: 'conv_1',
      agent: {
        id: 'agent_1',
        name: 'Agent',
        adapterName: 'codex',
        modelProvider: 'openai',
        modelId: 'gpt-5-codex',
        isOrchestrator: true,
      },
      workspace: {
        mode: 'local',
        effectiveCwd: 'C:/workspace',
        boundPath: 'C:/workspace',
      },
      prompt: {
        overridePrompt: false,
        overrideSystemPrompt: false,
        userPromptChars: 12,
        effectivePromptChars: 24,
        systemPromptChars: 48,
        systemPromptSections: [],
      },
      context: {
        summaryInjected: true,
        summaryId: 'summary_1',
        workspaceMemoryInjected: true,
        workspaceMemoryNoteCount: 2,
        historyInjected: true,
        historyMessageCount: 4,
        historyTokenBudget: 1000,
        historyTokenEstimate: 400,
      },
      tools: {
        toolNames: ['plan_tasks', 'bash'],
        externalMcpServers: [],
        skills: [],
      },
      attachments: [],
    },
    triggerMessage: buildMessage('msg_trigger', [{ type: 'text', content: '执行任务' }]),
    outputMessages: [
      buildMessage('msg_output', [
        {
          type: 'tool_use',
          callId: 'call_1',
          toolName: 'plan_tasks',
          args: {
            tasks: [
              { id: 'design', agentId: 'designer', task: '设计页面', taskKind: 'design' },
              { id: 'code', agentId: 'coder', task: '实现页面', taskKind: 'code', dependsOn: ['design'] },
            ],
          },
        },
        { type: 'tool_result', callId: 'call_1', result: { ok: true }, isError: false },
        { type: 'tool_use', callId: 'call_2', toolName: 'bash', args: { command: 'pnpm test' } },
        { type: 'tool_result', callId: 'call_2', result: { exitCode: 0, status: 'completed' }, isError: false },
        { type: 'artifact_ref', artifactId: 'artifact_1' },
        { type: 'text', content: '完成' },
      ]),
    ],
    childrenRuns: [
      buildRun({ id: 'run_child', agentId: 'coder', agentName: 'Coder', parentRunId: 'run_1', status: 'running' }),
    ],
    parentRun: null,
    ...overrides,
  }
}

describe('agent run debug board projection', () => {
  it('projects a run into five presentation stages', () => {
    const stages = projectAgentRunBoardStages(buildDetail())

    expect(stages.map((stage) => stage.id)).toEqual(['trigger', 'context', 'plan', 'execute', 'output'])
    expect(stages).toMatchObject([
      { id: 'trigger', status: 'complete', metric: '1 条触发消息' },
      { id: 'context', status: 'complete', metric: '3 类上下文' },
      { id: 'plan', status: 'running', metric: '2 个任务' },
      { id: 'execute', status: 'running', metric: '2 次调用 · 1 个子 Agent' },
      { id: 'output', status: 'running', metric: '1 个产物' },
    ])
  })

  it('keeps a failed run visually actionable', () => {
    const detail = buildDetail({
      agentRun: buildRun({ status: 'failed', error: 'build failed' }),
    })

    expect(getAgentRunBoardStageStatus(detail.agentRun.status, true)).toBe('failed')
    expect(projectAgentRunBoardStages(detail).find((stage) => stage.id === 'execute')).toMatchObject({
      status: 'failed',
      tone: 'danger',
    })
  })

  it('marks context as unavailable for legacy runs without a snapshot', () => {
    const detail = buildDetail({
      agentRun: buildRun({ hasDebugSnapshot: false }),
      snapshot: null,
    })

    expect(projectAgentRunBoardStages(detail).find((stage) => stage.id === 'context')).toMatchObject({
      status: 'unavailable',
      metric: '快照不可用',
    })
  })

  it('builds a left-to-right graph with stable stage ids', () => {
    const graph = buildAgentRunBoardGraph(projectAgentRunBoardStages(buildDetail()))

    expect(graph.nodes.map((node) => node.id)).toEqual([
      'stage-trigger',
      'stage-context',
      'stage-plan',
      'stage-execute',
      'stage-output',
    ])
    expect(graph.edges).toMatchObject([
      { id: 'edge-trigger-context', source: 'stage-trigger', target: 'stage-context', animated: false },
      { id: 'edge-context-plan', source: 'stage-context', target: 'stage-plan', animated: true },
      { id: 'edge-plan-execute', source: 'stage-plan', target: 'stage-execute', animated: true },
      { id: 'edge-execute-output', source: 'stage-execute', target: 'stage-output', animated: true },
    ])
  })

  it('maps stages to the debugging tab that explains them', () => {
    expect(getBoardPanelTabForStage('trigger')).toBe('history')
    expect(getBoardPanelTabForStage('context')).toBe('variables')
    expect(getBoardPanelTabForStage('plan')).toBe('variables')
    expect(getBoardPanelTabForStage('execute')).toBe('trace')
    expect(getBoardPanelTabForStage('output')).toBe('output')
  })
})
