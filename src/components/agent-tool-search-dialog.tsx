'use client'

import { ExternalLink, Loader2, Search, ShieldAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { presentToolSearchResult } from '@/components/agent-tool-search-presentation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { InlineError, StatusBadge } from '@/components/workbench-primitives'
import type { AgentRow } from '@/db/schema'
import {
  configureAgentToolResult,
  searchAgentTools,
  type ToolSearchResponse,
  type ToolSearchResult,
  type ToolSearchType,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'

type SearchSourceStatus = ToolSearchResponse['sourceStatus']['github']
type Feedback = { type: 'success' | 'error'; message: string }

export function AgentToolSearchDialog({ agents }: { agents: AgentRow[] }) {
  const upsertAgent = useAppStore((state) => state.upsertAgent)
  const addNotification = useAppStore((state) => state.addNotification)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [type, setType] = useState<ToolSearchType>('all')
  const [results, setResults] = useState<ToolSearchResult[]>([])
  const [targetAgentId, setTargetAgentId] = useState(agents[0]?.id ?? '')
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [configuredKeys, setConfiguredKeys] = useState<Set<string>>(new Set())
  const [sourceStatus, setSourceStatus] = useState<SearchSourceStatus | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  const target = useMemo(() => agents.find((agent) => agent.id === targetAgentId), [agents, targetAgentId])
  const operationBusy = searching || importingId != null

  useEffect(() => {
    if (agents.some((agent) => agent.id === targetAgentId)) return
    setTargetAgentId(agents[0]?.id ?? '')
  }, [agents, targetAgentId])

  const runSearch = async () => {
    const keyword = query.trim()
    if (!keyword || operationBusy) return
    setSearching(true)
    setHasSearched(true)
    setSearchError(null)
    setFeedback(null)
    try {
      const response = await searchAgentTools({ keyword, type, source: 'github', page: 1, pageSize: 20 })
      setResults(response.results)
      setSourceStatus(response.sourceStatus.github)
      setTotal(response.total)
    } catch (error) {
      setResults([])
      setSourceStatus('failed')
      setTotal(null)
      setSearchError(error instanceof Error ? error.message : String(error))
    } finally {
      setSearching(false)
    }
  }

  const attach = async (result: ToolSearchResult) => {
    if (!target || operationBusy) return
    setImportingId(result.id)
    setFeedback(null)
    try {
      const response = await configureAgentToolResult(target.id, {
        action: 'attach',
        type: result.type,
        kind: result.kind,
        source: result.source,
        id: result.id,
        installUrl: result.installUrl,
        manifestUrl: result.manifestUrl,
        githubUrl: result.githubUrl,
      })
      upsertAgent(response.agent)
      const label = result.type === 'skill' ? 'Skill' : 'MCP'
      const importedText = response.configured?.imported ? '首次导入' : '已更新'
      setFeedback({ type: 'success', message: `已将 ${result.name} 配置给 ${target.name}，${importedText}。` })
      setConfiguredKeys((current) => new Set(current).add(`${target.id}:${result.id}`))
      addNotification({
        id: `ntf_import_${result.id}`,
        title: `${label} 导入配置成功`,
        body: `已将 ${result.name} 配置给 ${target.name}，${importedText}。`,
        level: 'success',
        source: 'ui',
        category: 'configuration',
        createdAt: new Date().getTime(),
        toast: true,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setFeedback({ type: 'error', message: `导入失败：${message}` })
    } finally {
      setImportingId(null)
    }
  }

  return (
    <>
      <Button type="button" className="w-full justify-start gap-2" variant="outline" onClick={() => setOpen(true)}>
        <Search className="size-4" />
        联网搜索 Skills / MCP 并配置
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="grid max-h-[calc(100vh-2rem)] grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>联网搜索 Skills / MCP</DialogTitle>
            <DialogDescription>从 GitHub 查找远程能力，核对兼容性和风险后导入并绑定给指定 Agent。</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2.5">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void runSearch()
                }}
                placeholder="搜索 github、browser、database 等能力"
              />
              <select
                value={type}
                onChange={(event) => setType(event.target.value as ToolSearchType)}
                className="h-9 rounded-md border bg-background px-2 text-xs"
                aria-label="能力类型"
              >
                <option value="all">全部类型</option>
                <option value="skill">Skill</option>
                <option value="mcp_server">MCP</option>
              </select>
              <Button type="button" onClick={() => void runSearch()} disabled={!query.trim() || operationBusy}>
                {searching ? <Loader2 className="size-4 motion-safe:animate-spin" /> : <Search className="size-4" />}
                搜索
              </Button>
            </div>

            <select
              value={targetAgentId}
              onChange={(event) => setTargetAgentId(event.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-xs"
              aria-label="配置目标 Agent"
              disabled={agents.length === 0 || operationBusy}
            >
              {agents.length === 0 ? (
                <option value="">暂无可配置 Agent</option>
              ) : (
                agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>配置给：{agent.name} · {agent.adapterName}</option>
                ))
              )}
            </select>

            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
              MCP 导入后会作为本机 stdio 进程运行。绑定前请检查 Manifest 中的 command、args 和环境变量要求。
            </div>

            {feedback && (
              <div
                aria-live="polite"
                className={cn(
                  'rounded-lg border px-3 py-2 text-xs',
                  feedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                    : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
                )}
              >
                {feedback.message}
              </div>
            )}
          </div>

          <div className="agenthub-hide-scrollbar min-h-0 overflow-y-auto">
            <div className="grid gap-2.5 pb-1">
              {hasSearched && !searching && !searchError && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>{results.length} 个结果{total != null ? ` · 共 ${total} 项` : ''}</span>
                  {sourceStatus && <StatusBadge tone={sourceStatus === 'ok' ? 'success' : 'warning'}>GitHub {sourceStatus}</StatusBadge>}
                </div>
              )}

              {searchError && <InlineError message={searchError} onRetry={() => void runSearch()} />}
              {!hasSearched && <SearchState title="搜索远程能力" description="输入关键词后查看兼容性、内容完整性和执行风险。" />}
              {searching && <SearchState loading title="正在搜索 GitHub" description="正在读取远程能力目录…" />}
              {hasSearched && !searching && !searchError && results.length === 0 && (
                <SearchState title="没有找到结果" description="尝试更换关键词，或切换 Skill / MCP 类型。" />
              )}

              {results.map((result, index) => {
                const presentation = presentToolSearchResult(result, target)
                const isImporting = importingId === result.id
                const isConfigured = presentation.bound || Boolean(target && configuredKeys.has(`${target.id}:${result.id}`))
                return (
                  <article
                    key={`${result.kind}:${result.id}`}
                    className={cn(
                      'agenthub-motion-item min-w-0 rounded-lg border bg-background p-3',
                      isConfigured && 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/5',
                      isImporting && 'opacity-70',
                    )}
                    style={{ animationDelay: `${Math.min(index, 6) * 35}ms` }}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                          <span className="break-words">{result.name}</span>
                          <StatusBadge>{result.type === 'skill' ? 'Skill' : 'MCP'}</StatusBadge>
                          <StatusBadge tone={presentation.compatibilityTone}>{presentation.compatibilityLabel}</StatusBadge>
                          <StatusBadge tone={presentation.completenessTone}>{presentation.completenessLabel}</StatusBadge>
                          <StatusBadge tone={presentation.riskTone}>{presentation.riskLabel}</StatusBadge>
                          {isConfigured && <StatusBadge tone="success">已绑定</StatusBadge>}
                        </div>
                        <p className="mt-1.5 break-words text-[11px] leading-5 text-muted-foreground">{result.description}</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="shrink-0"
                        disabled={!presentation.compatible || operationBusy || isConfigured}
                        onClick={() => void attach(result)}
                      >
                        {isImporting && <Loader2 className="size-3.5 motion-safe:animate-spin" />}
                        {isImporting ? '导入中' : isConfigured ? '已绑定' : '导入并绑定'}
                      </Button>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      {result.githubUrl && <SourceLink href={result.githubUrl} label="GitHub" />}
                      {result.installUrl && <SourceLink href={result.installUrl} label="安装内容" />}
                      {result.manifestUrl && <SourceLink href={result.manifestUrl} label="Manifest" />}
                      {result.tags.map((tag) => <span key={tag}>#{tag}</span>)}
                    </div>

                    {!presentation.compatible && (
                      <p className="mt-2 text-[10px] text-rose-600 dark:text-rose-300">当前目标 Agent 无法运行此能力，请更换兼容的 Adapter。</p>
                    )}
                  </article>
                )
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function SearchState({ title, description, loading = false }: { title: string; description: string; loading?: boolean }) {
  return (
    <div className="flex min-h-28 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-4 text-center">
      {loading ? <Loader2 className="mb-2 size-5 text-muted-foreground motion-safe:animate-spin" /> : <Search className="mb-2 size-5 text-muted-foreground" />}
      <div className="text-xs font-medium">{title}</div>
      <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
    </div>
  )
}

function SourceLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--agenthub-accent)] hover:underline">
      {label}
      <ExternalLink className="size-3" />
    </a>
  )
}
