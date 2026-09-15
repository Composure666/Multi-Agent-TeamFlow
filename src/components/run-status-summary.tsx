import { CheckCircle2, CircleAlert, Loader2, MessageCircleQuestion, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'
import {
  usePendingBashCommands,
  usePendingMcpToolApprovals,
  usePendingPlanReviewForConversation,
  usePendingQuestions,
  usePendingWrites,
  useRunningActivity,
  useRunningTaskProgress,
  useTopLevelRunningRuns,
} from '@/stores/app-store'

export type RunStatusSummary = {
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
  label: string
  detail: string
}

export function summarizeRunStatus({
  runningCount,
  pendingPlan,
  pendingWrites,
  pendingBash,
  pendingMcp,
  pendingQuestions,
}: {
  runningCount: number
  pendingPlan: boolean
  pendingWrites: number
  pendingBash: number
  pendingMcp: number
  pendingQuestions: number
}): RunStatusSummary | null {
  if (pendingQuestions > 0) return { tone: 'warning', label: '等待你的回答', detail: `${pendingQuestions} 个问题需要处理` }
  if (pendingWrites + pendingBash + pendingMcp > 0) return { tone: 'warning', label: '等待审批', detail: `${pendingWrites + pendingBash + pendingMcp} 项操作等待确认` }
  if (pendingPlan) return { tone: 'info', label: '计划待确认', detail: 'Orchestrator 已生成执行计划' }
  if (runningCount > 0) return { tone: 'info', label: '正在运行', detail: `${runningCount} 个 Agent 正在工作` }
  return null
}

/**
 * 耗时文案：`m:ss`，超过一小时补上小时位。
 *
 * 为什么一定要显示秒数：工具调用动辄几分钟，期间页面上唯一变化的就是它 ——
 * 用户靠它判断「还在跑」而不是「卡死了」。
 */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600)
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/**
 * 每秒跳一次的已耗时。Date.now() 在渲染期取是 impure 的（React 19 会报错），
 * 所以统一走 state + effect：先给个初值，挂载后由 interval 推进。
 */
function useElapsedLabel(startedAt: number | null): string | null {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (startedAt === null) return
    setNowMs(Date.now())
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])

  if (startedAt === null) return null
  return formatElapsed(nowMs - startedAt)
}

export function RunStatusSummary({ conversationId }: { conversationId: string }) {
  const running = useTopLevelRunningRuns(conversationId)
  const pendingPlan = usePendingPlanReviewForConversation(conversationId)
  const pendingWrites = usePendingWrites(conversationId)
  const pendingBash = usePendingBashCommands(conversationId)
  const pendingMcp = usePendingMcpToolApprovals(conversationId)
  const pendingQuestions = usePendingQuestions(conversationId)
  const activity = useRunningActivity(conversationId)
  const taskProgress = useRunningTaskProgress(conversationId)

  const isRunning = running.length > 0
  const startedAt = isRunning ? Math.min(...running.map((run) => run.startedAt)) : null
  const elapsed = useElapsedLabel(startedAt)

  const summary = summarizeRunStatus({
    runningCount: running.length,
    pendingPlan: Boolean(pendingPlan),
    pendingWrites: pendingWrites.length,
    pendingBash: pendingBash.length,
    pendingMcp: pendingMcp.length,
    pendingQuestions: pendingQuestions.length,
  })

  if (!summary) return null

  const Icon = summary.tone === 'warning'
    ? pendingQuestions.length > 0 ? MessageCircleQuestion : ShieldAlert
    : summary.tone === 'info'
      ? running.length > 0 ? Loader2 : CircleAlert
      : CheckCircle2

  // 运行中：单独一种版式 —— 自转弧线（比 animate-spin 多一层呼吸）+ 当前动作 +
  // 子任务进度 + 每秒推进的耗时 + 底部不确定性进度条。四者都只走 transform/opacity，
  // 不触发重排，即使主线程被 agent 占满也照样在动。
  if (isRunning) {
    return (
      <div
        className="agenthub-motion-enter relative shrink-0 overflow-hidden border-b border-blue-100 bg-blue-50/70 text-xs text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 px-4 py-1.5">
          <Loader2 className="agenthub-orbit size-3.5 shrink-0" aria-hidden />
          <span className="shrink-0 font-semibold">正在运行</span>
          <span className="min-w-0 truncate opacity-80">{activity ?? summary.detail}</span>
          {taskProgress && (
            <span className="hidden min-w-0 shrink truncate rounded-full bg-blue-500/10 px-1.5 py-px text-[10px] tabular-nums opacity-90 md:inline dark:bg-blue-400/15">
              {taskProgress}
            </span>
          )}
          {elapsed && (
            <span
              className="ml-auto shrink-0 font-mono text-[11px] tabular-nums opacity-70"
              title="本次运行已耗时"
            >
              {elapsed}
            </span>
          )}
        </div>
        <div className="relative h-0.5 w-full overflow-hidden bg-blue-100/80 dark:bg-blue-400/15">
          <div className="agenthub-indeterminate-bar absolute inset-y-0 rounded-full bg-blue-500/80 dark:bg-blue-300/70" />
        </div>
      </div>
    )
  }

  return (
    <div className={cn('agenthub-motion-enter flex shrink-0 items-center gap-2 border-b px-4 py-1.5 text-xs', summary.tone === 'warning' ? 'border-amber-200 bg-amber-50/70 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200' : 'border-blue-100 bg-blue-50/60 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200')} role="status">
      <Icon className="size-3.5 shrink-0" />
      <span className="font-semibold">{summary.label}</span>
      <span className="truncate opacity-75">{summary.detail}</span>
    </div>
  )
}
