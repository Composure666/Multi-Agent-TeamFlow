import { describe, expect, it } from 'vitest'

import { formatDispatchProgressMessage } from './dispatch-progress-message'

describe('formatDispatchProgressMessage', () => {
  it('makes retry progress visible with task id, attempt count, and failure reason', () => {
    expect(
      formatDispatchProgressMessage({
        taskId: 't_backend',
        attempt: 2,
        maxAttempts: 4,
        phase: 'retry',
        reason: 'controller directory has 0 files',
      }),
    ).toBe(
      '[进度] 子任务 t_backend 第 2/4 次未通过验收，原因：controller directory has 0 files\n已自动继续同一任务，下一次会基于现有文件补齐缺口。',
    )
  })

  it('makes final failure visible instead of silently stopping', () => {
    expect(
      formatDispatchProgressMessage({
        taskId: 't_backend',
        attempt: 4,
        maxAttempts: 4,
        phase: 'failed',
        reason: 'missing report_task_result',
      }),
    ).toBe('[失败] 子任务 t_backend 在 4 次尝试后仍未通过验收，原因：missing report_task_result')
  })

  it('makes blocked child tasks visible', () => {
    expect(
      formatDispatchProgressMessage({
        taskId: 't_review',
        attempt: 1,
        maxAttempts: 4,
        phase: 'blocked',
        reason: 'upstream task failed',
      }),
    ).toBe('[进度] 子任务 t_review 已暂停，原因：upstream task failed')
  })
})
