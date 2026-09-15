import { describe, expect, it } from 'vitest'

import type { AgentRunRow, MessageRow } from '@/db/schema'
import { formatElapsed } from '@/components/run-status-summary'
import type { DispatchState } from '@/stores/app-store'
import {
  describeRunningActivity,
  describeRunningTaskProgress,
  shortTaskLabel,
} from '@/stores/app-store'
import type { MessagePart } from '@/shared/types'

/**
 * 「正在运行」条的取值逻辑 —— 聊天页在 agent 长时间执行期间唯一会变的东西。
 *
 * 这几个函数刻意做成不依赖 React 的纯函数（入参是 store 的切片），这样「界面上到底
 * 显示什么」可以被直接断言，而不必渲染组件。
 */

function run(id: string, status: AgentRunRow['status'], conversationId = 'conv_1'): AgentRunRow {
  return {
    id,
    conversationId,
    agentId: 'ag_1',
    triggerMessageId: 'msg_1',
    status,
    error: null,
    parentRunId: null,
    usage: null,
    startedAt: 1_000,
    finishedAt: null,
  }
}

function agentMessage(id: string, runId: string, parts: MessagePart[]): MessageRow {
  return {
    id,
    conversationId: 'conv_1',
    role: 'agent',
    agentId: 'ag_1',
    parts,
    status: 'streaming',
    parentMessageId: null,
    mentionedAgentIds: [],
    runId,
    usage: null,
    createdAt: 2_000,
  }
}

describe('formatElapsed', () => {
  it('formats as m:ss below an hour and h:mm:ss above', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(7_000)).toBe('0:07')
    expect(formatElapsed(75_000)).toBe('1:15')
    expect(formatElapsed(12 * 60_000 + 34_000)).toBe('12:34')
    expect(formatElapsed(3_600_000 + 5 * 60_000 + 9_000)).toBe('1:05:09')
  })

  it('clamps negative values (clock skew would otherwise render -1:-1)', () => {
    expect(formatElapsed(-5_000)).toBe('0:00')
  })
})

describe('shortTaskLabel', () => {
  it('takes the first meaningful line and strips list markers', () => {
    expect(shortTaskLabel('- 核查清华计算机录取分数线')).toBe('核查清华计算机录取分数线')
    expect(shortTaskLabel('1. 撰写报告\n2. 复核')).toBe('撰写报告')
  })

  it('truncates long labels', () => {
    expect(shortTaskLabel('x'.repeat(50))).toHaveLength(23)
    expect(shortTaskLabel('x'.repeat(50)).endsWith('…')).toBe(true)
  })
})

describe('describeRunningActivity', () => {
  const state = (
    runs: AgentRunRow[],
    messages: MessageRow[],
  ): Parameters<typeof describeRunningActivity>[0] => ({
    runsByConv: { conv_1: Object.fromEntries(runs.map((r) => [r.id, r])) },
    messages: Object.fromEntries(messages.map((m) => [m.id, m])),
    messageIdsByConv: { conv_1: messages.map((m) => m.id) },
  })

  it('reports the in-flight tool call of the running run', () => {
    const activity = describeRunningActivity(
      state(
        [run('run_1', 'running')],
        [
          agentMessage('msg_a', 'run_1', [
            { type: 'tool_use', callId: 'c1', toolName: 'read_artifact' } as MessagePart,
            { type: 'tool_result', callId: 'c1', result: 'ok' } as MessagePart,
            { type: 'tool_use', callId: 'c2', toolName: 'bash' } as MessagePart,
          ]),
        ],
      ),
      'conv_1',
    )
    // c1 已有结果 → 当前动作应该是还没拿到结果的 c2
    expect(activity).toBe('正在执行命令')
  })

  it('falls back to generating-a-reply when no tool call is pending', () => {
    const activity = describeRunningActivity(
      state(
        [run('run_1', 'running')],
        [agentMessage('msg_a', 'run_1', [{ type: 'text', content: '思考中' } as MessagePart])],
      ),
      'conv_1',
    )
    expect(activity).toBe('正在生成回复')
  })

  it('returns null when nothing is running', () => {
    const activity = describeRunningActivity(
      state([run('run_1', 'complete')], [agentMessage('msg_a', 'run_1', [])]),
      'conv_1',
    )
    expect(activity).toBeNull()
  })

  it('ignores messages belonging to finished runs', () => {
    const activity = describeRunningActivity(
      state(
        [run('run_1', 'running'), run('run_2', 'complete')],
        [
          agentMessage('msg_old', 'run_2', [
            { type: 'tool_use', callId: 'c9', toolName: 'bash' } as MessagePart,
          ]),
          agentMessage('msg_live', 'run_1', [{ type: 'text', content: 'hi' } as MessagePart]),
        ],
      ),
      'conv_1',
    )
    expect(activity).toBe('正在生成回复')
  })
})

describe('describeRunningTaskProgress', () => {
  const dispatch = (runId: string, statuses: DispatchState['taskStatus']): DispatchState => ({
    runId,
    messageId: 'msg_1',
    plan: [
      { id: 't1', agentId: 'ag_1', task: '核查录取分数线' },
      { id: 't2', agentId: 'ag_1', task: '撰写最终报告' },
      { id: 't3', agentId: 'ag_1', task: '生成封面图' },
    ],
    taskStatus: statuses,
    childRunIds: {},
  })

  const state = (
    runs: AgentRunRow[],
    dispatches: DispatchState[],
  ): Parameters<typeof describeRunningTaskProgress>[0] => ({
    runsByConv: { conv_1: Object.fromEntries(runs.map((r) => [r.id, r])) },
    dispatchesByRunId: Object.fromEntries(dispatches.map((d) => [d.runId, d])),
  })

  it('reports position and the active task title', () => {
    const progress = describeRunningTaskProgress(
      state(
        [run('run_1', 'running')],
        [dispatch('run_1', { t1: 'complete', t2: 'running', t3: 'pending' })],
      ),
      'conv_1',
    )
    expect(progress).toBe('子任务 2/3 · 撰写最终报告')
  })

  it('reports finished count when nothing is running yet', () => {
    const progress = describeRunningTaskProgress(
      state(
        [run('run_1', 'running')],
        [dispatch('run_1', { t1: 'complete', t2: 'pending', t3: 'pending' })],
      ),
      'conv_1',
    )
    expect(progress).toBe('子任务 1/3')
  })

  it('counts failed and skipped tasks as finished', () => {
    const progress = describeRunningTaskProgress(
      state(
        [run('run_1', 'running')],
        [dispatch('run_1', { t1: 'failed', t2: 'skipped', t3: 'running' })],
      ),
      'conv_1',
    )
    expect(progress).toBe('子任务 3/3 · 生成封面图')
  })

  it('returns null for a run without a dispatched plan', () => {
    expect(describeRunningTaskProgress(state([run('run_1', 'running')], []), 'conv_1')).toBeNull()
  })
})
