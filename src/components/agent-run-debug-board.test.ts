import { describe, expect, it } from 'vitest'

import type { AgentRunInspectorTask } from '@/lib/agent-run-debug-board'

import { currentTaskProgress, relativeTime } from './agent-run-debug-board'

function task(patch: Partial<AgentRunInspectorTask>): AgentRunInspectorTask {
  return {
    title: 'task',
    stepTitle: null,
    stepIndex: 0,
    stepTotal: 0,
    status: 'running',
    ...patch,
  }
}

describe('currentTaskProgress', () => {
  it('is 0 for a running task with no steps', () => {
    expect(currentTaskProgress(task({ stepTotal: 0, status: 'running' }))).toBe(0)
  })

  it('is 0 for a failed task with no steps', () => {
    expect(currentTaskProgress(task({ stepTotal: 0, status: 'failed' }))).toBe(0)
  })

  it('is 100 for a completed task with no steps', () => {
    expect(currentTaskProgress(task({ stepTotal: 0, status: 'completed' }))).toBe(100)
  })

  it('derives progress from stepIndex/stepTotal when steps exist', () => {
    expect(currentTaskProgress(task({ stepTotal: 4, stepIndex: 1, status: 'running' }))).toBe(25)
    expect(currentTaskProgress(task({ stepTotal: 3, stepIndex: 3, status: 'completed' }))).toBe(100)
  })
})

describe('relativeTime', () => {
  it('returns 刚刚 for under a minute', () => {
    expect(relativeTime(Date.now() - 30 * 1000)).toBe('刚刚')
  })

  it('suffixes minutes, hours and days with 前', () => {
    expect(relativeTime(Date.now() - 3 * 60 * 1000)).toBe('3 分钟前')
    expect(relativeTime(Date.now() - 2 * 60 * 60 * 1000)).toBe('2 小时前')
    expect(relativeTime(Date.now() - 5 * 24 * 60 * 60 * 1000)).toBe('5 天前')
  })
})
