import { CheckCircle2, CircleAlert, Loader2, MessageCircleQuestion, ShieldAlert } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  usePendingBashCommands,
  usePendingMcpToolApprovals,
  usePendingPlanReviewForConversation,
  usePendingQuestions,
  usePendingWrites,
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

export function RunStatusSummary({ conversationId }: { conversationId: string }) {
  const running = useTopLevelRunningRuns(conversationId)
  const pendingPlan = usePendingPlanReviewForConversation(conversationId)
  const pendingWrites = usePendingWrites(conversationId)
  const pendingBash = usePendingBashCommands(conversationId)
  const pendingMcp = usePendingMcpToolApprovals(conversationId)
  const pendingQuestions = usePendingQuestions(conversationId)
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

  return (
    <div className={cn('agenthub-motion-enter flex shrink-0 items-center gap-2 border-b px-4 py-1.5 text-xs', summary.tone === 'warning' ? 'border-amber-200 bg-amber-50/70 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200' : 'border-blue-100 bg-blue-50/60 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200')} role="status">
      <Icon className={cn('size-3.5 shrink-0', running.length > 0 && 'animate-spin')} />
      <span className="font-semibold">{summary.label}</span>
      <span className="truncate opacity-75">{summary.detail}</span>
    </div>
  )
}
