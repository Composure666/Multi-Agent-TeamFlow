import { describe, expect, it } from 'vitest'

import { formatDuration, mapAutomationRun, mapRunItem } from '@/components/analytics-workspace'
import type { AutomationRunListItem, RunAnalyticsItem } from '@/lib/api'

/**
 * 数据概览页的展示层映射（纯函数，不需要 DOM）。
 *
 * 概览页的「数据是否完整、是否真实」最终体现为：后端给出的 run 字段
 * 能不能原样落到表格列上。这里守住 4 件事：
 *   1. 状态字面量不被改写（含 aborted → 已中止，旧版只有三态）；
 *   2. 运行中的 run 显示「进行中」而不是 -1 或 NaN；
 *   3. Token / 时长 / 会话 id / 子任务标记不丢；
 *   4. 自动化工作区复用的映射仍取 automation_runs 的形状。
 */

function makeItem(overrides: Partial<RunAnalyticsItem> = {}): RunAnalyticsItem {
  return {
    id: 'run_test123456',
    conversationId: 'conv_test',
    agentId: 'ag_test',
    agentName: '产品文案助手',
    title: '周报生成',
    category: '文本',
    status: 'success',
    durationMs: 65_000,
    startedAt: new Date('2026-09-15T10:00:00+08:00').getTime(),
    finishedAt: new Date('2026-09-15T10:01:05+08:00').getTime(),
    totalTokens: 12_345,
    isSubRun: false,
    ...overrides,
  }
}

describe('数据概览 · 展示层映射', () => {
  it('四种状态都映射到正确的中文文案', () => {
    expect(mapRunItem(makeItem({ status: 'success' })).status).toBe('成功')
    expect(mapRunItem(makeItem({ status: 'failed' })).status).toBe('失败')
    expect(mapRunItem(makeItem({ status: 'running' })).status).toBe('运行中')
    expect(mapRunItem(makeItem({ status: 'aborted' })).status).toBe('已中止')
  })

  it('运行中的 run 时长显示「进行中」，不显示负数或 0s', () => {
    const running = mapRunItem(makeItem({ status: 'running', finishedAt: null, durationMs: null }))
    expect(running.duration).toBe('进行中')
  })

  it('保留真实字段：Agent 名、会话标题、Token、子任务标记', () => {
    const record = mapRunItem(makeItem({ isSubRun: true, totalTokens: 999_999 }))
    expect(record.agentName).toBe('产品文案助手')
    expect(record.title).toBe('周报生成')
    expect(record.category).toBe('文本')
    expect(record.totalTokens).toBe(999_999)
    expect(record.isSubRun).toBe(true)
    expect(record.conversationId).toBe('conv_test')
    expect(record.id).toBe('run_test123456')
  })

  it('时长格式化覆盖 ms / s / 分秒 / 分', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(820)).toBe('820ms')
    expect(formatDuration(45_000)).toBe('45s')
    expect(formatDuration(65_000)).toBe('1分5秒')
    expect(formatDuration(180_000)).toBe('3分')
  })

  it('自动化工作区复用的映射仍产出三态与 automation_runs 字段', () => {
    const base: AutomationRunListItem = {
      id: 'arun_1',
      automationId: 'auto_1',
      title: '历史上的今天',
      category: '内容推送',
      status: 'success',
      trigger: 'schedule',
      agentRunId: 'run_x',
      conversationId: 'conv_y',
      durationMs: 12_000,
      startedAt: new Date('2026-09-15T09:00:00+08:00').getTime(),
      finishedAt: new Date('2026-09-15T09:00:12+08:00').getTime(),
      error: null,
    }
    const ok = mapAutomationRun(base)
    expect(ok.status).toBe('成功')
    expect(ok.duration).toBe('12s')
    expect(ok.category).toBe('内容推送')

    const running = mapAutomationRun({ ...base, status: 'running', finishedAt: null, durationMs: null })
    expect(running.status).toBe('运行中')
    expect(running.duration).toBe('进行中')

    const failed = mapAutomationRun({ ...base, status: 'failed' })
    expect(failed.status).toBe('失败')
  })
})
