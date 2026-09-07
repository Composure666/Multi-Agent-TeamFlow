import { describe, expect, it } from 'vitest'

import type { AgentRunDebugListItem } from '@/shared/types'

import {
  filterAgentRunHistory,
  filterAgentRunTimeline,
  type AgentRunHistoryFilterState,
} from './agent-run-debug-view'

function buildRun(overrides: Partial<AgentRunDebugListItem>): AgentRunDebugListItem {
  return {
    id: overrides.id ?? 'run_1',
    conversationId: 'conv_1',
    agentId: 'agent_1',
    agentName: 'Agent',
    adapterName: 'codex',
    modelId: 'gpt-5-codex',
    triggerMessageId: null,
    parentRunId: null,
    status: 'running',
    error: null,
    usage: null,
    startedAt: 1_000_000,
    finishedAt: null,
    hasDebugSnapshot: false,
    ...overrides,
  }
}

describe('agent run debug view filters', () => {
  it('filters run history by status and time window', () => {
    const now = 2_000_000
    const runs = [
      buildRun({ id: 'run_recent_complete', status: 'complete', startedAt: now - 60 * 60 * 1000 }),
      buildRun({ id: 'run_recent_failed', status: 'failed', startedAt: now - 2 * 60 * 60 * 1000 }),
      buildRun({ id: 'run_old_failed', status: 'failed', startedAt: now - 4 * 24 * 60 * 60 * 1000 }),
    ]
    const filters: AgentRunHistoryFilterState = { status: 'failed', window: '24h' }

    expect(filterAgentRunHistory(runs, filters, now).map((run) => run.id)).toEqual(['run_recent_failed'])
  })

  it('filters timeline items by agent, tools, and errors', () => {
    const timeline = [
      { id: 'm', messageId: 'm', messageIndex: 0, partIndex: -1, kind: 'message', label: 'message', detail: 'x', status: 'done' },
      { id: 't', messageId: 'm', messageIndex: 0, partIndex: 0, kind: 'thinking', label: 'thinking', detail: 'x', status: 'done' },
      { id: 'c', messageId: 'm', messageIndex: 0, partIndex: 1, kind: 'tool_call', label: 'tool', detail: 'x', status: 'pending' },
      { id: 'r', messageId: 'm', messageIndex: 0, partIndex: 2, kind: 'tool_result', label: 'result', detail: 'x', status: 'error' },
      { id: 'a', messageId: 'm', messageIndex: 0, partIndex: 3, kind: 'artifact', label: 'artifact', detail: 'x', status: 'done' },
    ] as const

    expect(filterAgentRunTimeline(timeline, 'agent').map((item) => item.id)).toEqual(['m', 't'])
    expect(filterAgentRunTimeline(timeline, 'tools').map((item) => item.id)).toEqual(['c', 'r', 'a'])
    expect(filterAgentRunTimeline(timeline, 'errors').map((item) => item.id)).toEqual(['r'])
  })
})
