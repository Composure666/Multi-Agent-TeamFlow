'use client'

import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { AgentRow } from '@/db/schema'
import { configureAgentToolResult, searchAgentTools, type ToolSearchResult, type ToolSearchType } from '@/lib/api'
import { useAppStore } from '@/stores/app-store'

export function AgentToolSearchDialog({ agents }: { agents: AgentRow[] }) {
  const upsertAgent = useAppStore((s) => s.upsertAgent)
  const addNotification = useAppStore((s) => s.addNotification)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [type, setType] = useState<ToolSearchType>('all')
  const [results, setResults] = useState<ToolSearchResult[]>([])
  const [targetAgentId, setTargetAgentId] = useState(agents[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [configuredIds, setConfiguredIds] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (targetAgentId || agents.length === 0) return
    setTargetAgentId(agents[0]?.id ?? '')
  }, [agents, targetAgentId])

  const runSearch = async () => {
    setBusy(true)
    setError(null)
    try {
      const response = await searchAgentTools({ keyword: query, type, source: 'github', page: 1, pageSize: 20 })
      setResults(response.results)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const attach = async (result: ToolSearchResult) => {
    if (!targetAgentId || busy) return
    const resultId = result.id
    setImportingId(resultId)
    setBusy(true)
    setError(null)
    setFeedback(null)
    try {
      const response = await configureAgentToolResult(targetAgentId, {
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
      const targetName = agents.find((a) => a.id === targetAgentId)?.name ?? targetAgentId
      const label = result.type === 'skill' ? 'Skill' : 'MCP'
      const importedText = response.configured?.imported ? '(首次导入)' : '(已更新)'
      setFeedback({
        type: 'success',
        message: `已配置：${result.name} → ${targetName} ${importedText}`,
      })
      setConfiguredIds((prev) => new Set(prev).add(resultId))
      addNotification({
        id: `ntf_import_${resultId}`,
        title: `${label} 导入配置成功`,
        body: `已将 ${result.name} 配置给 ${targetName}${importedText}。`,
        level: 'success',
        source: 'ui',
        category: 'configuration',
        createdAt: new Date().getTime(),
        toast: true,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setFeedback({ type: 'error', message: `导入失败：${message}` })
      setError(message)
    } finally {
      setBusy(false)
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
        <DialogContent className="grid max-h-[calc(100vh-2rem)] grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>联网搜索 Skills / MCP</DialogTitle>
            <DialogDescription>
              在 GitHub 远程搜索可安装的 Skills / MCP，选择结果后导入并配置给指定 Agent。这里不会搜索本地 Skills 或本地 MCP。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="输入关键词搜索远程 Skill / MCP，例如 github、browser、database"
              />
              <select
                value={type}
                onChange={(event) => setType(event.target.value as ToolSearchType)}
                className="rounded-md border bg-background px-2 py-1.5 text-xs"
              >
                <option value="all">全部类型</option>
                <option value="skill">Skill</option>
                <option value="mcp_server">MCP</option>
              </select>
              <Button type="button" onClick={() => void runSearch()} disabled={busy}>联网搜索</Button>
            </div>
            <select value={targetAgentId} onChange={(event) => setTargetAgentId(event.target.value)} className="rounded-md border bg-background px-2 py-1.5 text-xs">
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>配置目标：{agent.name} · {agent.adapterName}</option>
              ))}
            </select>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
              远程 MCP 导入后会作为本地 stdio MCP 配置运行，执行前请检查 manifest 中的 command/args。
            </div>
            {feedback && (
              <div className={`rounded-md border px-2 py-1 text-xs ${feedback.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : feedback.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
                {feedback.message}
              </div>
            )}
            {error && <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{error}</div>}
          </div>
          <div className="min-h-0 overflow-y-auto pr-1">
            <div className="grid gap-2">
              {results.length === 0 && !busy && (
                <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
                  还没有远程搜索结果，请输入关键词后联网搜索。
                </div>
              )}
              {results.length === 0 && busy && (
                <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
                  正在搜索中...
                </div>
              )}
              {results.map((result) => {
                const resultId = result.id
                const target = agents.find((agent) => agent.id === targetAgentId)
                const compatible = target ? result.compatibility[target.adapterName] === 'supported' : false
                const isImporting = importingId === resultId
                const isConfigured = configuredIds.has(resultId)
                return (
                  <div key={`${result.kind}:${result.id}`} className={`min-w-0 rounded-md border bg-background p-2 text-left ${isConfigured ? 'border-green-300 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30' : ''} ${isImporting ? 'opacity-70' : ''}`}>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                      <span className="break-words">{result.name}</span>
                      <code className="text-[10px] text-muted-foreground">{result.type}</code>
                      <span className="text-[10px] text-muted-foreground">GitHub · {result.status}</span>
                      {isConfigured && <span className="rounded bg-green-100 px-1 py-0.5 text-[10px] text-green-700 dark:bg-green-900 dark:text-green-300">已配置</span>}
                    </div>
                    <p className="mt-1 break-words text-[11px] text-muted-foreground">{result.description}</p>
                    <div className="mt-2 grid gap-1 text-[10px] text-muted-foreground">
                      {result.githubUrl && <p className="break-all">GitHub：{result.githubUrl}</p>}
                      {result.installUrl && <p className="break-all">安装地址：{result.installUrl}</p>}
                      {result.manifestUrl && <p className="break-all">Manifest：{result.manifestUrl}</p>}
                      {result.tags.length > 0 && <p className="break-words">标签：{result.tags.join(', ')}</p>}
                    </div>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[10px] text-muted-foreground">
                        {isConfigured ? '已配置给目标 Agent' : isImporting ? '正在导入并配置...' : compatible ? '可导入并配置给目标 Agent' : `不兼容 ${target?.adapterName ?? '当前 Agent'}`}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!compatible || busy || isConfigured}
                        onClick={() => void attach(result)}
                      >
                        {isImporting ? '导入中...' : isConfigured ? '已配置' : '导入并配置给目标 Agent'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
