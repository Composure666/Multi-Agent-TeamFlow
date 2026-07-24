'use client'

import { Loader2, RotateCw, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  createMcpServer,
  deleteMcpServer,
  fetchMcpServers,
  testMcpServer,
  updateMcpServer,
  type McpConnectionTestResult,
  type McpServerListItem,
} from '@/lib/api'

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

  return (
    <section className="min-w-0 space-y-3 overflow-hidden rounded-lg border bg-muted/30 p-3">
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
        <ShieldAlert className="mt-0.5 size-4 flex-none" />
        <p className="min-w-0 break-words text-[11px] leading-4">外部 MCP server 是本机进程，不受 AgentHub 内置 workspace 工具沙箱保护。只添加信任来源；env 在列表中会脱敏。</p>
      </div>

      <div className="grid min-w-0 gap-2 rounded-md border bg-background p-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="name: filesystem" />
          <Input value={form.command} onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))} placeholder="command: npx" />
        </div>
        <Input value={form.argsText} onChange={(e) => setForm((f) => ({ ...f, argsText: e.target.value }))} placeholder="args，用空格分隔" />
        <textarea value={form.envText} onChange={(e) => setForm((f) => ({ ...f, envText: e.target.value }))} placeholder="ENV_KEY=value，每行一个" className="min-h-16 w-full resize-y break-all rounded-md border bg-background px-2 py-1 text-xs" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />启用</label>
          <select value={form.trust} onChange={(e) => setForm((f) => ({ ...f, trust: e.target.value as McpForm['trust'] }))} className="rounded-md border bg-background px-2 py-1 text-xs">
            <option value="ask">ask</option>
            <option value="always">always</option>
          </select>
          <Button type="button" size="sm" disabled={busy} onClick={() => void submit()}>{editingId ? '保存 MCP' : '新增 MCP'}</Button>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">MCP Servers</h3>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}刷新</Button>
      </div>
      <div className="grid min-w-0 gap-2">
        {servers.map((server) => {
          const result = testResults[server.id]
          return (
            <div key={server.id} className="min-w-0 rounded-md border bg-background p-2">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium"><span className="break-all">{server.name}</span><code className="text-[10px] text-muted-foreground">{server.trust}</code>{!server.enabled && <span className="text-[10px] text-muted-foreground">disabled</span>}</div>
                  <p className="break-all font-mono text-[11px] text-muted-foreground">{server.command} {server.args.join(' ')}</p>
                  <p className="break-words text-[10px] text-muted-foreground">env: {Object.keys(server.env).join(', ') || 'none'} · health: {server.lastCheckStatus ?? 'unknown'} · tools: {server.lastToolCount ?? '-'}</p>
                </div>
                <div className="flex flex-wrap gap-1 sm:flex-nowrap">
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void runTest(server.id)}>测试</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => edit(server)}>编辑</Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void remove(server.id)}>删除</Button>
                </div>
              </div>
              {result && <div className="mt-2 min-w-0 break-words rounded bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">{result.status}: {result.message}{result.tools.length > 0 && <div className="break-all">tools: {result.tools.map((tool) => tool.name).join(', ')}</div>}</div>}
            </div>
          )
        })}
      </div>
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
