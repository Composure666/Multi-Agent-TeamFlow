export const DISPATCH_PROGRESS_PREFIX = '[进度]'
export const DISPATCH_FAILURE_PREFIX = '[失败]'

export function formatDispatchProgressMessage(args: {
  taskId: string
  attempt: number
  maxAttempts: number
  phase: 'retry' | 'failed' | 'blocked'
  reason: string
}): string {
  if (args.phase === 'retry') {
    return `${DISPATCH_PROGRESS_PREFIX} 子任务 ${args.taskId} 第 ${args.attempt}/${args.maxAttempts} 次未通过验收，原因：${args.reason}\n已自动继续同一任务，下一次会基于现有文件补齐缺口。`
  }

  if (args.phase === 'blocked') {
    return `${DISPATCH_PROGRESS_PREFIX} 子任务 ${args.taskId} 已暂停，原因：${args.reason}`
  }

  return `${DISPATCH_FAILURE_PREFIX} 子任务 ${args.taskId} 在 ${args.maxAttempts} 次尝试后仍未通过验收，原因：${args.reason}`
}
