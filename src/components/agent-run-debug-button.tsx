'use client'

import { Bug, Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { fetchAgentRunDebugDetail, fetchAgentRuns } from '@/lib/api'
import {
  getAgentRunToolTraceKind,
  projectAgentRunAgentTaskChains,
  projectAgentRunArtifacts,
  projectAgentRunAskUserInteractions,
  projectAgentRunOperations,
  projectAgentRunPlanDag,
  projectAgentRunPlanTasks,
  projectAgentRunRelations,
  projectAgentRunTaskResults,
  projectAgentRunTimeline,
  projectAgentRunToolTrace,
  summarizeAgentRunToolTraceArgs,
  summarizeAgentRunToolTraceResult,
  type AgentRunAgentTaskChain,
  type AgentRunAskUserInteraction,
  type AgentRunArtifactDebugItem,
  type AgentRunDebugOperationSummary,
  type AgentRunMessageSummary,
  type AgentRunPlanDagProjection,
  type AgentRunRelationsSummary,
  type AgentRunTaskResultTrace,
  type AgentRunTimelineItem,
  type AgentRunToolTraceItem,
} from '@/lib/agent-run-debug-projection'
import { cn } from '@/lib/utils'
import { useAgentRunDebugDetail, useAgentRunDebugList, useAppStore } from '@/stores/app-store'
import type { AgentRunDebugDetail, AgentRunDebugListItem, AgentRunDebugSnapshot, DispatchPlanItem } from '@/shared/types'

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
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>{formatDuration(run.startedAt, run.finishedAt)}</span>
        <span>{total > 0 ? `${formatNumber(total)} tok` : '无用量'}</span>
      </div>
      {!run.hasDebugSnapshot && <div className="mt-2 text-xs text-amber-600">无快照</div>}
    </button>
  )
}

function RunDetail({ detail }: { detail: AgentRunDebugDetail }) {
  const snapshot = detail.snapshot
  const toolTrace = projectAgentRunToolTrace(detail)
  const planTasks = projectAgentRunPlanTasks(toolTrace)
  const planDag = projectAgentRunPlanDag(planTasks)
  const operations = projectAgentRunOperations(toolTrace)
  const relations = projectAgentRunRelations(detail)
  const timeline = projectAgentRunTimeline(detail)
  const artifacts = projectAgentRunArtifacts(detail)
  const askUserInteractions = projectAgentRunAskUserInteractions(toolTrace)
  const taskResults = projectAgentRunTaskResults(toolTrace)
  const agentChains = projectAgentRunAgentTaskChains(planTasks, taskResults, operations)
  const [tab, setTab] = useState<'overview' | 'trace' | 'plan' | 'runs' | 'artifacts'>('overview')
  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="space-y-3">
      <TabsList className="grid h-auto w-full grid-cols-5 rounded-xl bg-slate-100 p-1">
        <TabsTrigger value="overview">概览</TabsTrigger>
        <TabsTrigger value="trace">轨迹</TabsTrigger>
        <TabsTrigger value="plan">计划</TabsTrigger>
        <TabsTrigger value="runs">链路</TabsTrigger>
        <TabsTrigger value="artifacts">产物</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-3 outline-none">
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
                  snapshot.tools.skills.map((skill, index) => (
                    <div key={`${skill.id}-${skill.sourcePath}-${index}`} className="rounded-lg border bg-slate-50 px-3 py-2">
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
      </TabsContent>

      <TabsContent value="trace" className="space-y-3 outline-none">
        <ToolTraceSection items={toolTrace} />
        <OperationsSection operations={operations} />
        <TimelineSection items={timeline} />
      </TabsContent>

      <TabsContent value="plan" className="space-y-3 outline-none">
        <PlanDagSection dag={planDag} />
        <PlanTasksSection tasks={planTasks} />
      </TabsContent>

      <TabsContent value="runs" className="space-y-3 outline-none">
        <RelationsSection relations={relations} />
        <AgentChainsSection chains={agentChains} />
        <MessagesSection trigger={relations.triggerMessage} outputs={relations.outputMessages} />
      </TabsContent>

      <TabsContent value="artifacts" className="space-y-3 outline-none">
        <ArtifactsSection items={artifacts} />
        <AskUserSection interactions={askUserInteractions} />
        <TaskResultsSection results={taskResults} />
      </TabsContent>
    </Tabs>
  )
}

function RelationsSection({ relations }: { relations: AgentRunRelationsSummary }) {
  const relatedCount = (relations.parent ? 1 : 0) + relations.children.length
  return (
    <Section title={`Run 关系 · ${relatedCount} 个关联 run`}>
      <div className="space-y-2">
        <RelationCard label="Current" run={relations.current} />
        {relations.parent ? <RelationCard label="Parent" run={relations.parent} /> : <div className="text-slate-500">无 parent run</div>}
        {relations.children.length > 0 ? (
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Children</div>
            {relations.children.map((run) => (
              <RelationCard key={run.id} label="Child" run={run} />
            ))}
          </div>
        ) : (
          <div className="text-slate-500">无 children runs</div>
        )}
      </div>
    </Section>
  )
}

function RelationCard({ label, run }: { label: string; run: AgentRunRelationsSummary['current'] }) {
  return (
    <div className="rounded-lg border bg-slate-50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-slate-800">{label} · {run.agentName ?? run.agentId}</div>
          <div className="mt-0.5 break-all font-mono text-3xs text-slate-500">{run.id}</div>
        </div>
        <StatusBadge status={run.status} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500">
        <div>adapter: {run.adapterName ?? '-'}</div>
        <div>model: {run.modelId ?? '-'}</div>
        <div>duration: {formatDuration(run.startedAt, run.finishedAt)}</div>
      </div>
    </div>
  )
}

function MessagesSection({ trigger, outputs }: { trigger: AgentRunMessageSummary | null; outputs: AgentRunMessageSummary[] }) {
  return (
    <Section title={`Messages · ${outputs.length} 条输出`}>
      <div className="space-y-2">
        {trigger ? <MessageSummaryCard label="Trigger" message={trigger} /> : <div className="text-slate-500">无 trigger message</div>}
        {outputs.length > 0 ? (
          outputs.map((message, index) => (
            <MessageSummaryCard key={message.messageId} label={`Output #${index + 1}`} message={message} />
          ))
        ) : (
          <div className="text-slate-500">无 output messages</div>
        )}
      </div>
    </Section>
  )
}

function MessageSummaryCard({ label, message }: { label: string; message: AgentRunMessageSummary }) {
  return (
    <div className="rounded-lg border bg-slate-50 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-slate-800">{label} · {message.role}</div>
          <div className="mt-0.5 break-all font-mono text-3xs text-slate-500">
            {shortId(message.messageId)} · run {message.runId ? shortId(message.runId) : '-'}
          </div>
        </div>
        <Badge variant={message.status === 'complete' ? 'secondary' : 'outline'} className="h-5 px-1.5 text-3xs">{message.status}</Badge>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500">
        <div>parts: {message.partCount}</div>
        <div>text: {formatNumber(message.textChars)} chars</div>
        <div>thinking: {formatNumber(message.thinkingChars)} chars</div>
        <div>tool use: {message.toolUseCount}</div>
        <div>tool result: {message.toolResultCount}</div>
        <div>artifact: {message.artifactRefCount}</div>
        <div>deploy: {message.deployPartCount}</div>
      </div>
      <TracePayload label="Preview" value={message.preview} />
    </div>
  )
}

function TimelineSection({ items }: { items: AgentRunTimelineItem[] }) {
  return (
    <Section title={`Timeline · ${items.length} 个事件`}>
      {items.length === 0 ? (
        <div className="text-slate-500">本 run 没有可投影的时间线事件。</div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.id} className={cn('grid grid-cols-[72px_1fr_auto] gap-2 rounded-lg bg-slate-50 px-2 py-1.5', item.status === 'error' && 'bg-red-50 text-red-700')}>
              <div className="text-3xs uppercase tracking-wide text-slate-400">{item.kind}</div>
              <div className="min-w-0">
                <div className="truncate font-medium text-slate-800">{item.label}</div>
                <div className="mt-0.5 break-all font-mono text-3xs text-slate-500">{shortId(item.messageId)}:{item.partIndex}</div>
                <div className="mt-1 break-all text-xs text-slate-600">{item.detail}</div>
              </div>
              <Badge variant={item.status === 'error' ? 'destructive' : item.status === 'pending' ? 'outline' : 'secondary'} className="h-5 px-1.5 text-3xs">{item.status}</Badge>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function ArtifactsSection({ items }: { items: AgentRunArtifactDebugItem[] }) {
  return (
    <Section title={`Artifacts / Deploy · ${items.length} 条`}>
      {items.length === 0 ? (
        <div className="text-slate-500">本 run 没有 artifact 或部署记录。</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className={cn('rounded-lg border bg-slate-50 px-3 py-2', item.isError && 'border-red-200 bg-red-50 text-red-700')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800">{item.title ?? item.artifactId}</div>
                  <div className="mt-0.5 break-all font-mono text-3xs text-slate-500">
                    {item.kind} · {shortId(item.messageId)}:{item.partIndex}
                  </div>
                </div>
                <Badge variant={item.isError ? 'destructive' : 'outline'} className="h-5 px-1.5 text-3xs">
                  {item.status ?? item.kind}
                </Badge>
              </div>
              <div className="mt-2 grid gap-1 text-xs text-slate-500">
                <div><span className="text-slate-400">artifact:</span> <span className="font-mono">{item.artifactId}</span></div>
                {item.version !== null ? <div><span className="text-slate-400">version:</span> {item.version}</div> : null}
                {item.previewPath ? <div><span className="text-slate-400">preview:</span> <span className="font-mono">{item.previewPath}</span></div> : null}
                <div><span className="text-slate-400">detail:</span> {item.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function ToolTraceSection({ items }: { items: AgentRunToolTraceItem[] }) {
  const errorCount = items.filter((item) => item.isError).length
  const title = `工具轨迹 · ${items.length} 次调用${errorCount > 0 ? ` · ${errorCount} 个错误` : ''}`
  return (
    <Section title={title}>
      {items.length === 0 ? (
        <div className="text-slate-500">本 run 没有工具调用轨迹。</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <ToolTraceCard key={`${item.messageId}-${item.callId}`} item={item} />
          ))}
        </div>
      )}
    </Section>
  )
}

function ToolTraceCard({ item }: { item: AgentRunToolTraceItem }) {
  const kind = getAgentRunToolTraceKind(item.toolName)
  const variant = item.isError ? 'destructive' : item.completed ? 'secondary' : 'outline'
  const status = item.isError ? 'error' : item.completed ? 'done' : 'pending'
  return (
    <div className="rounded-lg border bg-slate-50 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-800">{item.toolName}</div>
          <div className="mt-0.5 break-all font-mono text-3xs text-slate-500">
            {shortId(item.callId)} · message {shortId(item.messageId)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant="outline" className="h-5 px-1.5 text-3xs">{kind}</Badge>
          <Badge variant={variant} className="h-5 px-1.5 text-3xs">{status}</Badge>
        </div>
      </div>
      <TracePayload label="Args" value={summarizeAgentRunToolTraceArgs(item)} />
      {item.completed && <TracePayload label="Result" value={summarizeAgentRunToolTraceResult(item)} />}
    </div>
  )
}

function TracePayload({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2 rounded bg-white px-2 py-1.5">
      <div className="text-3xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 break-all font-mono text-xs leading-4 text-slate-700">{value}</div>
    </div>
  )
}

function AskUserSection({ interactions }: { interactions: AgentRunAskUserInteraction[] }) {
  return (
    <Section title={`Ask User · ${interactions.length} 次交互`}>
      {interactions.length === 0 ? (
        <div className="text-slate-500">本 run 没有 ask_user 交互。</div>
      ) : (
        <div className="space-y-2">
          {interactions.map((interaction) => (
            <div key={`${interaction.messageId}-${interaction.callId}`} className="rounded-lg border bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-3xs text-slate-500">{shortId(interaction.callId)} · {interaction.questionCount} question(s)</div>
                <Badge variant={interaction.isError ? 'destructive' : interaction.answered ? 'secondary' : 'outline'} className="h-5 px-1.5 text-3xs">
                  {interaction.isError ? 'error' : interaction.answered ? 'answered' : 'pending'}
                </Badge>
              </div>
              <div className="mt-2 space-y-2">
                {interaction.questions.map((question, index) => (
                  <div key={`${question.question}-${index}`} className="rounded bg-white px-2 py-1.5">
                    <div className="font-medium text-slate-800">{question.header ? `${question.header}: ` : ''}{question.question}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {question.multiSelect ? 'multi' : 'single'} · options: {question.options.join(', ') || '-'}
                    </div>
                    <div className="mt-1 text-xs text-slate-700">answer: {question.answer ?? '-'}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function TaskResultsSection({ results }: { results: AgentRunTaskResultTrace[] }) {
  return (
    <Section title={`Task Results · ${results.length} 次上报`}>
      {results.length === 0 ? (
        <div className="text-slate-500">本 run 没有 report_task_result 上报。</div>
      ) : (
        <div className="space-y-2">
          {results.map((result) => (
            <div key={`${result.messageId}-${result.callId}`} className="rounded-lg border bg-slate-50 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800">{result.summary}</div>
                  <div className="mt-0.5 font-mono text-3xs text-slate-500">{shortId(result.callId)} · message {shortId(result.messageId)}</div>
                </div>
                <Badge variant={result.status === 'complete' ? 'secondary' : 'destructive'} className="h-5 px-1.5 text-3xs">{result.status}</Badge>
              </div>
              <div className="mt-2 grid gap-1 text-xs text-slate-500">
                {result.filesChanged?.length ? <div><span className="text-slate-400">files:</span> {result.filesChanged.map((file) => `${file.action ?? 'changed'}:${file.path}`).join(', ')}</div> : null}
                {result.commandsRun?.length ? <div><span className="text-slate-400">commands:</span> {result.commandsRun.map((command) => `${command.exitCode ?? '-'}:${command.command}`).join(' | ')}</div> : null}
                {result.tests?.length ? <div><span className="text-slate-400">tests:</span> {result.tests.map((test) => `${test.passed ? 'pass' : 'fail'}:${test.command}`).join(' | ')}</div> : null}
                {result.acceptanceResults?.length ? <div><span className="text-slate-400">acceptance:</span> {result.acceptanceResults.map((item) => `${item.passed ? 'pass' : 'fail'}:${item.criterion}`).join(' | ')}</div> : null}
                <OptionalList label="blockers" values={result.blockers} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function PlanDagSection({ dag }: { dag: AgentRunPlanDagProjection }) {
  const nodeById = new Map(dag.nodes.map((node) => [node.id, node]))
  const title = `Plan DAG · ${dag.nodes.length} 节点 / ${dag.edges.length} 边${dag.hasCycle ? ' · 存在循环' : ''}${dag.missingDependencyCount > 0 ? ` · ${dag.missingDependencyCount} 个缺失依赖` : ''}`
  return (
    <Section title={title}>
      {dag.nodes.length === 0 ? (
        <div className="text-slate-500">本 run 没有可视化计划。</div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <Badge variant="outline" className="h-5 px-1.5 text-3xs">root: {dag.nodes.filter((node) => node.isRoot).length}</Badge>
            <Badge variant="outline" className="h-5 px-1.5 text-3xs">leaf: {dag.nodes.filter((node) => node.isLeaf).length}</Badge>
            {dag.hasCycle && <Badge variant="destructive" className="h-5 px-1.5 text-3xs">cycle</Badge>}
            {dag.missingDependencyCount > 0 && <Badge variant="destructive" className="h-5 px-1.5 text-3xs">missing deps</Badge>}
          </div>
          <div className="overflow-x-auto rounded-xl border bg-slate-50 p-3">
            <div className="flex min-w-max items-start gap-3">
              {dag.layers.map((layer, layerIndex) => (
                <div key={`layer-${layerIndex}`} className="w-56 shrink-0">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Step {layerIndex + 1}</div>
                  <div className="space-y-2">
                    {layer.map((nodeId) => {
                      const node = nodeById.get(nodeId)
                      if (!node) return null
                      return <PlanDagNodeCard key={node.id} node={node} />
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {dag.edges.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Dependencies</div>
              <div className="flex flex-wrap gap-1.5">
                {dag.edges.map((edge) => (
                  <Badge key={`${edge.from}-${edge.to}`} variant="outline" className="h-5 px-1.5 font-mono text-3xs">
                    {edge.from} → {edge.to}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

function PlanDagNodeCard({ node }: { node: AgentRunPlanDagProjection['nodes'][number] }) {
  return (
    <div className={cn('rounded-lg border bg-white px-3 py-2 shadow-sm', node.hasCycle && 'border-red-200 bg-red-50')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-mono text-xs font-semibold text-slate-800">{node.id}</div>
          <div className="mt-0.5 truncate text-xs text-slate-500">agent: {node.agentId}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {node.taskKind && <Badge variant="outline" className="h-5 px-1.5 text-3xs">{node.taskKind}</Badge>}
          {node.hasCycle && <Badge variant="destructive" className="h-5 px-1.5 text-3xs">cycle</Badge>}
        </div>
      </div>
      <div className="mt-2 line-clamp-3 text-xs leading-4 text-slate-700">{node.task}</div>
      <div className="mt-2 space-y-1 text-3xs text-slate-500">
        <div>depends: {node.dependsOn.length ? node.dependsOn.join(', ') : node.isRoot ? 'root' : '-'}</div>
        {node.missingDependsOn.length > 0 && <div className="text-red-600">missing: {node.missingDependsOn.join(', ')}</div>}
        <div>next: {node.dependents.length ? node.dependents.join(', ') : node.isLeaf ? 'leaf' : '-'}</div>
      </div>
    </div>
  )
}

function AgentChainsSection({ chains }: { chains: AgentRunAgentTaskChain[] }) {
  return (
    <Section title={`Agent 任务链路 · ${chains.length} 个 Agent`}>
      {chains.length === 0 ? (
        <div className="text-slate-500">本 run 没有可归属到 Agent 的任务链路。</div>
      ) : (
        <div className="space-y-2">
          {chains.map((chain) => (
            <div key={chain.agentId} className="rounded-lg border bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-slate-800">{chain.agentId}</div>
                <Badge variant="outline" className="h-5 px-1.5 text-3xs">
                  {chain.tasks.length} tasks · {chain.commands.length} commands
                </Badge>
              </div>
              <div className="mt-2 space-y-2">
                {chain.tasks.length > 0 && (
                  <div className="rounded bg-white px-2 py-1.5">
                    <div className="text-3xs uppercase tracking-wide text-slate-400">Task chain</div>
                    <div className="mt-1 space-y-1 text-xs text-slate-700">
                      {chain.tasks.map((task) => (
                        <div key={task.id} className="grid grid-cols-[72px_1fr] gap-2">
                          <span className="font-mono text-slate-500">{task.id}</span>
                          <span className="line-clamp-2">{task.task}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {chain.commands.length > 0 && (
                  <div className="rounded bg-white px-2 py-1.5">
                    <div className="text-3xs uppercase tracking-wide text-slate-400">Terminal output</div>
                    <div className="mt-1 space-y-1">
                      {chain.commands.map((command, index) => (
                        <div key={`${command.callId}-${index}`} className={cn('rounded bg-slate-950 px-2 py-1.5 font-mono text-3xs leading-4 text-slate-100', command.isError && 'bg-red-950')}>
                          <div>{command.command}</div>
                          <div className="mt-0.5 text-slate-400">{command.exitCode === null ? command.status ?? 'running' : `exit ${command.exitCode}`}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {chain.taskResults.length > 0 && (
                  <div className="rounded bg-white px-2 py-1.5">
                    <div className="text-3xs uppercase tracking-wide text-slate-400">Reports</div>
                    <div className="mt-1 space-y-1 text-xs text-slate-700">
                      {chain.taskResults.map((result) => (
                        <div key={result.callId}>{result.status}: {result.summary}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function PlanTasksSection({ tasks }: { tasks: DispatchPlanItem[] }) {
  return (
    <Section title={`Plan Tasks · ${tasks.length} 个任务`}>
      {tasks.length === 0 ? (
        <div className="text-slate-500">本 run 没有 plan_tasks 计划。</div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div key={task.id} className="rounded-lg border bg-slate-50 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800">{task.id} · {task.agentId}</div>
                  <div className="mt-1 whitespace-pre-wrap text-slate-700">{task.task}</div>
                </div>
                {task.taskKind && <Badge variant="outline" className="h-5 px-1.5 text-3xs">{task.taskKind}</Badge>}
              </div>
              <div className="mt-2 grid gap-1 text-xs text-slate-500">
                <OptionalList label="depends" values={task.dependsOn} />
                <OptionalList label="targets" values={task.targetPaths} />
                <OptionalList label="accept" values={task.acceptanceCriteria} />
                <OptionalList label="evidence" values={task.requiredEvidence} />
                {task.requiredCommands?.length ? (
                  <div><span className="text-slate-400">commands:</span> {task.requiredCommands.map((cmd) => cmd.command).join(' | ')}</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function OperationsSection({ operations }: { operations: AgentRunDebugOperationSummary }) {
  const total = operations.files.length + operations.commands.length + operations.network.length
  return (
    <Section title={`文件 / 命令 / 网络 · ${total} 条`}>
      {total === 0 ? (
        <div className="text-slate-500">本 run 没有可归类的文件、命令或网络调用。</div>
      ) : (
        <div className="space-y-3">
          <OperationGroup title="Files" empty="无文件记录">
            {operations.files.map((file, index) => (
              <OperationRow
                key={`${file.callId}-${file.path}-${index}`}
                title={`${file.kind}${file.detail ? `:${file.detail}` : ''}`}
                value={file.path}
                error={file.isError}
              />
            ))}
          </OperationGroup>
          <OperationGroup title="Commands" empty="无命令记录">
            {operations.commands.map((command, index) => (
              <OperationRow
                key={`${command.callId}-${index}`}
                title={command.exitCode === null ? command.status ?? 'command' : `exit ${command.exitCode}`}
                value={command.command}
                error={command.isError}
              />
            ))}
          </OperationGroup>
          <OperationGroup title="Network" empty="无网络记录">
            {operations.network.map((network, index) => (
              <OperationRow
                key={`${network.callId}-${index}`}
                title={network.status ?? network.kind}
                value={network.target}
                error={network.isError}
              />
            ))}
          </OperationGroup>
        </div>
      )}
    </Section>
  )
}

function OptionalList({ label, values }: { label: string; values?: string[] }) {
  if (!values?.length) return null
  return <div><span className="text-slate-400">{label}:</span> {values.join(', ')}</div>
}

function OperationGroup({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      {hasChildren ? <div className="space-y-1">{children}</div> : <div className="text-slate-500">{empty}</div>}
    </div>
  )
}

function OperationRow({ title, value, error }: { title: string; value: string; error: boolean }) {
  return (
    <div className={cn('grid grid-cols-[84px_1fr] gap-2 rounded bg-slate-50 px-2 py-1.5', error && 'bg-red-50 text-red-700')}>
      <div className="text-slate-500">{title}</div>
      <div className="break-all font-mono text-xs">{value}</div>
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
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500">
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
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: AgentRunDebugListItem['status'] }) {
  const variant = status === 'failed' || status === 'aborted' ? 'destructive' : status === 'complete' ? 'secondary' : 'outline'
  return <Badge variant={variant} className="h-5 px-1.5 text-3xs">{status}</Badge>
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
