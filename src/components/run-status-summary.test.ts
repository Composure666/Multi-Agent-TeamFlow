import { describe, expect, it } from 'vitest'

import { summarizeRunStatus } from './run-status-summary'

describe('summarizeRunStatus', () => {
  it('prioritizes user questions over other pending work', () => {
    expect(summarizeRunStatus({ runningCount: 1, pendingPlan: true, pendingWrites: 2, pendingBash: 0, pendingMcp: 0, pendingQuestions: 1 })).toEqual({
      tone: 'warning',
      label: '等待你的回答',
      detail: '1 个问题需要处理',
    })
  })

  it('summarizes running agents and approval queues', () => {
    expect(summarizeRunStatus({ runningCount: 2, pendingPlan: false, pendingWrites: 0, pendingBash: 0, pendingMcp: 0, pendingQuestions: 0 })?.label).toBe('正在运行')
    expect(summarizeRunStatus({ runningCount: 0, pendingPlan: false, pendingWrites: 1, pendingBash: 1, pendingMcp: 1, pendingQuestions: 0 })?.detail).toBe('3 项操作等待确认')
  })

  it('returns no summary when the conversation is idle', () => {
    expect(summarizeRunStatus({ runningCount: 0, pendingPlan: false, pendingWrites: 0, pendingBash: 0, pendingMcp: 0, pendingQuestions: 0 })).toBeNull()
  })
})
