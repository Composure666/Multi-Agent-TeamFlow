'use client'

import { Loader2, RotateCw, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge, WorkspaceStateView } from '@/components/workbench-primitives'
import {
  createMcpServer,
  deleteMcpServer,
  fetchMcpServers,
  testMcpServer,
  updateMcpServer,
  type McpConnectionTestResult,
  type McpServerListItem,
} from '@/lib/api'
import { cn } from '@/lib/utils'

interface McpForm {
  name: string
  command: string
  argsText: string
  envText: string
  trust: 'ask' | 'always'
  enabled: boolean
}

const EMPTY_FORM: McpForm = {
  name: '',
  command: '',
  argsText: '',
  envText: '',
  trust: 'ask',
  enabled: true,
}

export function McpServersSettings() {
  const [servers, setServers] = useState<McpServerListItem[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<McpForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, McpConnectionTestResult>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setServers(await fetchMcpServers())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const body = {
        name: form.name.trim(),
        command: form.command.trim(),
        args: form.argsText.split(/\s+/).map((arg) => arg.trim()).filter(Boolean),
        env: parseEnv(form.envText),
        trust: form.trust,
        enabled: form.enabled,
      }
      if (editingId) await updateMcpServer(editingId, body)
      else await createMcpServer(body)
      setForm(EMPTY_FORM)
      setEditingId(null)
      setServers(await fetchMcpServers())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const edit = (server: McpServerListItem) => {
    setEditingId(server.id)
    setForm({
      name: server.name,
      command: server.command,
      argsText: server.args.join(' '),
      envText: Object.entries(server.env).map(([key, value]) => `${key}=${value}`).join('\n'),
      trust: server.trust,
      enabled: server.enabled,
    })
  }

  const remove = async (serverId: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteMcpServer(serverId)
      setServers(await fetchMcpServers())
      if (editingId === serverId) {
        setEditingId(null)
        setForm(EMPTY_FORM)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const runTest = async (serverId: string) => {
    setBusy(true)
    setError(null)
    try {
      const result = await testMcpServer(serverId)
      setTestResults((prev) => ({ ...prev, [serverId]: result }))
      setServers(await fetchMcpServers())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const state = error ? 'error' : loading && servers.length === 0 ? 'loading' : servers.length === 0 ? 'empty' : 'ready'

  return (
    <section className="min-w-0 space-y-3 overflow-hidden rounded-xl border bg-card p-3">
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <ShieldAlert className="mt-0.5 size-4 flex-none" />
        <p className="min-w-0 break-words text-[11px] leading-4">
          外部 MCP server 是本机进程，不受 AgentHub 内置 workspace 工具沙箱保护。只添加信任来源；env 在列表中会脱敏。
        </p>
      </div>

      <div className="grid min-w-0 gap-2 rounded-xl border bg-background p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="name: filesystem" />
          <Input value={form.command} onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))} placeholder="command: npx" />
        </div>
        <Input value={form.argsText} onChange={(e) => setForm((f) => ({ ...f, argsText: e.target.value }))} placeholder="args，用空格分隔" />
        <textarea
          value={form.envText}
          onChange={(e) => setForm((f) => ({ ...f, envText: e.target.value }))}
          placeholder="ENV_KEY=value，每行一个"
          className="min-h-16 w-full resize-y break-all rounded-lg border bg-background px-2 py-1.5 text-xs"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
            启用
          </label>
          <div className="flex items-center gap-2">
            <select
              value={form.trust}
              onChange={(e) => setForm((f) => ({ ...f, trust: e.target.value as McpForm['trust'] }))}
              className="rounded-lg border bg-background px-2 py-1 text-xs"
            >
              <option value="ask">ask（每次调用前确认）</option>
              <option value="always">always（自动允许）</option>
            </select>
            <Button type="button" size="sm" disabled={busy} onClick={() => void submit()}>
              {editingId ? '保存 MCP' : '新增 MCP'}
            </Button>
          </div>
        </div>
        {form.trust === 'always' && (
          <p className="text-[11px] leading-4 text-amber-600 dark:text-amber-300">
            trust=always 会在不弹确认的情况下直接执行该 MCP 工具，请只用于完全信任的来源。
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">MCP Servers</h3>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
          刷新
        </Button>
      </div>

      <WorkspaceStateView
        state={state}
        title="暂无 MCP Servers"
        emptyDescription="在上方添加一个 stdio MCP server，也可以从能力中心联网搜索并导入 GitHub MCP。"
        errorDescription={error ?? undefined}
        action={error ? { label: '重试', onClick: () => void load() } : undefined}
      >
      <div className="grid min-w-0 gap-2">
        {servers.map((server, index) => {
          const result = testResults[server.id]
          return (
            <div key={server.id} className="agenthub-motion-item min-w-0 rounded-xl border bg-background p-3" style={{ animationDelay: `${Math.min(index, 6) * 35}ms` }}>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                    <span className="break-all">{server.name}</span>
                    <StatusBadge tone={server.trust === 'always' ? 'warning' : 'neutral'}>trust: {server.trust}</StatusBadge>
                    <StatusBadge tone={server.enabled ? 'success' : 'neutral'}>{server.enabled ? '已启用' : '已禁用'}</StatusBadge>
                    <StatusBadge tone={server.lastCheckStatus === 'ok' ? 'success' : server.lastCheckStatus ? 'danger' : 'neutral'}>
                      {server.lastCheckStatus === 'ok' ? '连接正常' : server.lastCheckStatus ? `状态: ${server.lastCheckStatus}` : '未检测'}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{server.command} {server.args.join(' ')}</p>
                  <p className="mt-1 break-words text-[10px] text-muted-foreground">
                    env: {Object.keys(server.env).join(', ') || 'none'} · tools: {server.lastToolCount ?? '-'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 sm:flex-nowrap">
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void runTest(server.id)}>测试</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => edit(server)}>编辑</Button>
                  <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => void remove(server.id)}>删除</Button>
                </div>
              </div>
              {result && (
                <div
                  className={cn(
                    'mt-2 min-w-0 break-words rounded-lg border px-3 py-2 text-[11px]',
                    result.status === 'ok'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
                      : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300',
                  )}
                >
                  <div className="font-medium">{result.status === 'ok' ? '连接成功' : '连接失败'}</div>
                  <div className="mt-0.5">{result.message}</div>
                  {result.tools.length > 0 && (
                    <div className="mt-1 break-all">tools: {result.tools.map((tool) => tool.name).join(', ')}</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      </WorkspaceStateView>
    </section>
  )
}

function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const index = trimmed.indexOf('=')
    if (index <= 0) continue
    env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim()
  }
  return env
}
