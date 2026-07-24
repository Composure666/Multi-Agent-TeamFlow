'use client'

import { Bug, Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { fetchAgentRunDebugDetail, fetchAgentRuns } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAgentRunDebugDetail, useAgentRunDebugList, useAppStore } from '@/stores/app-store'
import type { AgentRunDebugDetail, AgentRunDebugListItem, AgentRunDebugSnapshot } from '@/shared/types'

export function AgentRunDebugButton({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const runs = useAgentRunDebugList(conversationId)
  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null,
    [runs, selectedRunId],
  )
  const detail = useAgentRunDebugDetail(selectedRun?.id ?? null)
  const setAgentRunDebugList = useAppStore((s) => s.setAgentRunDebugList)
  const setAgentRunDebugDetail = useAppStore((s) => s.setAgentRunDebugDetail)

  const loadRuns = useCallback(async () => {
    setLoadingList(true)
    setError(null)
    try {
      const list = await fetchAgentRuns(conversationId)
      setAgentRunDebugList(conversationId, list)
      setSelectedRunId((current) => list.find((run) => run.id === current)?.id ?? list[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingList(false)
    }
  }, [conversationId, setAgentRunDebugList])

  const loadDetail = useCallback(async (runId: string) => {
    setLoadingDetail(true)
    setError(null)
    try {
      setAgentRunDebugDetail(runId, await fetchAgentRunDebugDetail(conversationId, runId))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingDetail(false)
    }
  }, [conversationId, setAgentRunDebugDetail])

  useEffect(() => {
    if (!open) return
    void loadRuns()
  }, [open, loadRuns])

  useEffect(() => {
    if (!open || !selectedRun?.id) return
    if (detail?.agentRun.id === selectedRun.id) return
    void loadDetail(selectedRun.id)
  }, [detail?.agentRun.id, loadDetail, open, selectedRun?.id])

  const shownDetail = detail?.agentRun.id === selectedRun?.id ? detail : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button size="icon-sm" variant="ghost" title="Run 调试" className="rounded-lg text-slate-500 transition hover:bg-slate-100" />}>
        <Bug className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="flex max-h-[680px] w-[760px] flex-col gap-0 p-0">
        <PopoverHeader className="border-b px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <PopoverTitle className="flex items-center gap-2 text-sm">
                <Bug className="size-4 text-muted-foreground" />
                Agent Run 调试
              </PopoverTitle>
              <PopoverDescription className="text-xs leading-5">
                查看当前会话 run 的上下文快照、用量、工具与关联消息；不展示完整 prompt 或密钥。
              </PopoverDescription>
            </div>
            <Button size="xs" variant="outline" className="gap-1.5" onClick={loadRuns} disabled={loadingList}>
              {loadingList ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
              刷新
            </Button>
          </div>
        </PopoverHeader>

        {error && (
          <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr] gap-0 overflow-hidden">
          <div className="max-h-[560px] overflow-y-auto border-r bg-slate-50/60 p-3">
            {loadingList && runs.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500">
                <Loader2 className="size-3.5 animate-spin" />
                加载 run 列表
              </div>
            ) : runs.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-white py-8 text-center text-xs text-slate-500">
                当前会话还没有 run
              </div>
            ) : (
              <div className="space-y-2">
                {runs.map((run) => (
                  <RunListItem
                    key={run.id}
                    run={run}
                    selected={run.id === selectedRun?.id}
                    onClick={() => setSelectedRunId(run.id)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="max-h-[560px] overflow-y-auto p-4">
            {loadingDetail && !shownDetail ? (
              <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500">
                <Loader2 className="size-3.5 animate-spin" />
                加载调试详情
              </div>
            ) : shownDetail ? (
              <RunDetail detail={shownDetail} />
            ) : selectedRun ? (
              <div className="text-xs text-slate-500">选择 run 后加载详情。</div>
            ) : (
              <div className="text-xs text-slate-500">暂无可调试 run。</div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function RunListItem({ run, selected, onClick }: { run: AgentRunDebugListItem; selected: boolean; onClick: () => void }) {
  const total = run.usage
    ? run.usage.inputTokens + run.usage.outputTokens + run.usage.cacheReadTokens + run.usage.cacheCreationTokens
    : 0
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border bg-white p-3 text-left text-xs transition hover:border-blue-200 hover:bg-blue-50/40',
        selected ? 'border-blue-300 bg-blue-50' : 'border-slate-100',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono font-semibold text-slate-800">{shortId(run.id)}</span>
        <StatusBadge status={run.status} />
      </div>
      <div className="mt-1 truncate text-slate-600">{run.agentName ?? run.agentId}</div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>{formatDuration(run.startedAt, run.finishedAt)}</span>
        <span>{total > 0 ? `${formatNumber(total)} tok` : '无用量'}</span>
      </div>
      {!run.hasDebugSnapshot && <div className="mt-2 text-[11px] text-amber-600">无快照</div>}
    </button>
  )
}

function RunDetail({ detail }: { detail: AgentRunDebugDetail }) {
  const snapshot = detail.snapshot
  return (
    <div className="space-y-3 text-xs">
      {!snapshot && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
          该 run 没有调试快照，仅展示可从 DB 还原的信息。
        </div>
      )}
      <Section title="基本信息">
        <KeyValue label="Run" value={detail.agentRun.id} mono />
        <KeyValue label="Agent" value={detail.agentRun.agentName ?? detail.agentRun.agentId} />
        <KeyValue label="Adapter" value={snapshot?.agent.adapterName ?? detail.agentRun.adapterName ?? '-'} />
        <KeyValue label="Model" value={snapshot?.agent.modelId ?? detail.agentRun.modelId ?? detail.agentRun.usage?.model ?? '-'} />
        <KeyValue label="Parent" value={detail.agentRun.parentRunId ?? '-'} mono />
        <KeyValue label="Trigger" value={detail.agentRun.triggerMessageId ?? '-'} mono />
      </Section>

      <Section title="用量">
        <UsageGrid run={detail.agentRun} />
      </Section>

      {snapshot && (
        <>
          <Section title="Workspace">
            <KeyValue label="Mode" value={snapshot.workspace.mode} />
            <KeyValue label="CWD" value={snapshot.workspace.effectiveCwd} mono />
            <KeyValue label="Bound" value={snapshot.workspace.boundPath ?? '-'} mono />
          </Section>
          <PromptSections snapshot={snapshot} />
          <Section title="Context">
            <KeyValue label="Summary" value={snapshot.context.summaryInjected ? snapshot.context.summaryId ?? 'yes' : 'no'} />
            <KeyValue label="Memory notes" value={String(snapshot.context.workspaceMemoryNoteCount)} />
            <KeyValue label="History" value={`${snapshot.context.historyMessageCount} messages`} />
            <KeyValue label="History budget" value={snapshot.context.historyTokenBudget?.toLocaleString() ?? '-'} />
            <KeyValue label="History estimate" value={snapshot.context.historyTokenEstimate?.toLocaleString() ?? '-'} />
          </Section>
          <Section title="Tools">
            <KeyValue label="Tool names" value={snapshot.tools.toolNames.length ? snapshot.tools.toolNames.join(', ') : '-'} />
            <div className="space-y-2">
              {snapshot.tools.skills.length === 0 ? (
                <div className="text-slate-500">无 Skills</div>
              ) : (
                snapshot.tools.skills.map((skill) => (
                  <div key={skill.id} className="rounded-lg border bg-slate-50 px-3 py-2">
                    <div className="font-medium text-slate-800">{skill.name}</div>
                    <div className="mt-1 text-slate-500">tags: {skill.tags.join(', ') || '-'}</div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-2 space-y-2">
              {snapshot.tools.externalMcpServers.length === 0 ? (
                <div className="text-slate-500">无外部 MCP</div>
              ) : (
                snapshot.tools.externalMcpServers.map((server) => (
                  <div key={server.id} className="rounded-lg border bg-slate-50 px-3 py-2">
                    <div className="font-medium text-slate-800">{server.name} · {server.trust}</div>
                    <div className="mt-1 text-slate-500">env keys: {server.envKeys.join(', ') || '-'}</div>
                  </div>
                ))
              )}
            </div>
          </Section>
        </>
      )}

      <Section title="Messages">
        <KeyValue label="Trigger message" value={detail.triggerMessage ? detail.triggerMessage.id : '-'} mono />
        <KeyValue label="Output messages" value={String(detail.outputMessages.length)} />
        <KeyValue label="Children runs" value={String(detail.childrenRuns.length)} />
      </Section>
    </div>
  )
}

function PromptSections({ snapshot }: { snapshot: AgentRunDebugSnapshot }) {
  return (
    <Section title="Prompt sections">
      <div className="space-y-1">
        {snapshot.prompt.systemPromptSections.map((section, index) => (
          <div key={`${section.kind}-${index}`} className="grid grid-cols-[1fr_auto_auto] gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <span className={section.present ? 'text-slate-800' : 'text-slate-400'}>{section.kind}</span>
            <span className="text-slate-500">{formatNumber(section.chars)} chars</span>
            <span className="text-slate-500">~{formatNumber(section.tokenEstimate)} tok</span>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-500">
        <div>user: {formatNumber(snapshot.prompt.userPromptChars)} chars</div>
        <div>effective: {formatNumber(snapshot.prompt.effectivePromptChars)} chars</div>
        <div>system: {formatNumber(snapshot.prompt.systemPromptChars)} chars</div>
      </div>
    </Section>
  )
}

function UsageGrid({ run }: { run: AgentRunDebugListItem }) {
  const usage = run.usage
  if (!usage) return <div className="text-slate-500">无用量数据</div>
  return (
    <div className="grid grid-cols-5 gap-2">
      <Metric label="Input" value={usage.inputTokens} />
      <Metric label="Output" value={usage.outputTokens} />
      <Metric label="Cache write" value={usage.cacheCreationTokens} />
      <Metric label="Cache read" value={usage.cacheReadTokens} />
      <Metric label="Last input" value={usage.lastInputTokens ?? usage.inputTokens} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3">
      <div className="mb-2 text-xs font-semibold text-slate-800">{title}</div>
      {children}
    </div>
  )
}

function KeyValue({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2 py-0.5">
      <div className="text-slate-500">{label}</div>
      <div className={cn('min-w-0 break-all text-slate-800', mono && 'font-mono')}>{value}</div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2 text-center">
      <div className="font-semibold text-slate-800">{formatNumber(value)}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{label}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: AgentRunDebugListItem['status'] }) {
  const variant = status === 'failed' || status === 'aborted' ? 'destructive' : status === 'complete' ? 'secondary' : 'outline'
  return <Badge variant={variant} className="h-5 px-1.5 text-[10px]">{status}</Badge>
}

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 10)}…` : id
}

function formatNumber(value: number): string {
  return value.toLocaleString()
}

function formatDuration(startedAt: number, finishedAt: number | null): string {
  const end = finishedAt ?? Date.now()
  const ms = Math.max(0, end - startedAt)
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
