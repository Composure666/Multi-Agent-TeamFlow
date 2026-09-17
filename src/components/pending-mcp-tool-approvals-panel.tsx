'use client'

import { Check, Loader2, PlugZap, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { AgentAvatar } from '@/components/agent-avatar'
import { Button } from '@/components/ui/button'
import {
  approvePendingMcpToolApproval,
  fetchPendingMcpToolApprovals,
  rejectPendingMcpToolApproval,
} from '@/lib/api'
import { BRAND_NAME } from '@/lib/brand'
import { cn } from '@/lib/utils'
import { useAppStore, usePendingMcpToolApprovals } from '@/stores/app-store'
import type { PendingMcpToolApproval } from '@/shared/types'

const MAX_ARGS_PREVIEW = 1200

export function PendingMcpToolApprovalsPanel({ conversationId }: { conversationId: string }) {
  const pending = usePendingMcpToolApprovals(conversationId)
  const setPendingMcpToolApprovalsForConversation = useAppStore(
    (s) => s.setPendingMcpToolApprovalsForConversation,
  )

  useEffect(() => {
    let cancelled = false
    fetchPendingMcpToolApprovals(conversationId)
      .then((list) => {
        if (!cancelled) setPendingMcpToolApprovalsForConversation(conversationId, list)
      })
      .catch((err) => {
        console.warn('[PendingMcpToolApprovalsPanel] fetch failed', err)
      })
    return () => {
      cancelled = true
    }
  }, [conversationId, setPendingMcpToolApprovalsForConversation])

  if (pending.length === 0) return null

  return (
    <div className="shrink-0 space-y-2 border-t bg-violet-50/45 px-4 py-2.5 dark:bg-violet-950/10">
      {pending.map((approval) => (
        <PendingMcpToolApprovalCard
          key={approval.id}
          conversationId={conversationId}
          pending={approval}
        />
      ))}
    </div>
  )
}

function PendingMcpToolApprovalCard({
  conversationId,
  pending,
}: {
  conversationId: string
  pending: PendingMcpToolApproval
}) {
  const agent = useAppStore((s) => s.agents[pending.agentId])
  const [busy, setBusy] = useState<null | 'approve' | 'reject'>(null)
  const [error, setError] = useState<string | null>(null)
  const argsPreview = useMemo(() => formatArgsPreview(pending.args), [pending.args])

  const handleApprove = useCallback(async () => {
    setBusy('approve')
    setError(null)
    try {
      await approvePendingMcpToolApproval(conversationId, pending.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }, [conversationId, pending.id])

  const handleReject = useCallback(async () => {
    setBusy('reject')
    setError(null)
    try {
      await rejectPendingMcpToolApproval(conversationId, pending.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }, [conversationId, pending.id])

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border border-violet-200 bg-card px-3 py-2 text-xs shadow-sm',
        'dark:border-violet-900/50',
      )}
    >
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {agent ? <AgentAvatar agent={agent} size="sm" /> : <div className="size-6 rounded-md bg-muted" />}
        <PlugZap className="size-4 text-violet-600" />
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 font-medium">{agent?.name ?? 'Agent'}</span>
          <span className="shrink-0 text-muted-foreground">请求调用外部 MCP 工具</span>
          <code className="truncate font-mono text-[11px]">{pending.namespacedToolName}</code>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          <span>Server：{pending.serverName}</span>
          <span>Tool：{pending.toolName}</span>
          {error && <span className="text-destructive">· {error}</span>}
        </div>
        <div className="rounded border bg-muted/40 px-2 py-1 font-mono text-[10px] text-muted-foreground">
          <span className="select-none font-sans text-[10px]">Args：</span>
          <span className="whitespace-pre-wrap break-words">{argsPreview}</span>
        </div>
        <div className="text-[10px] leading-4 text-amber-700 dark:text-amber-300">
          外部 MCP server 在 {BRAND_NAME} workspace 沙箱和 bash 黑名单保护之外运行；仅在信任该 server 与本次工具参数时批准。
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleReject}
          disabled={!!busy}
          className="h-7 px-2.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30"
          title="拒绝"
        >
          {busy === 'reject' ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
          拒绝
        </Button>
        <Button
          size="sm"
          onClick={handleApprove}
          disabled={!!busy}
          className="h-7 bg-[#3370FF] px-2.5 text-white hover:bg-[#2860e5]"
          title="批准"
        >
          {busy === 'approve' ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          批准
        </Button>
      </div>
    </div>
  )
}

function formatArgsPreview(value: unknown): string {
  let text: string
  try {
    text = JSON.stringify(value, null, 2)
  } catch {
    text = String(value)
  }
  if (text.length <= MAX_ARGS_PREVIEW) return text
  return `${text.slice(0, MAX_ARGS_PREVIEW)}…`
}
