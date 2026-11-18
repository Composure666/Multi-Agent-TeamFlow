'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, CheckCircle2, Loader2, Plus, Save, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/workbench-primitives'
import { BUILTIN_PROVIDERS } from '@/lib/llm-shared'
import type { LlmProviderRow } from '@/db/schema'

interface PriorityItem {
  providerId: string
  modelName: string | null
  priority: number
  status: 'healthy' | 'degraded' | 'unavailable' | 'unknown'
}

interface ProviderPriorityPanelProps {
  refreshKey?: number
}

const GLOBAL_KEY = 'global:default'

export function ProviderPriorityPanel({ refreshKey }: ProviderPriorityPanelProps) {
  const [providers, setProviders] = useState<LlmProviderRow[]>([])
  const [priority, setPriority] = useState<PriorityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  const retry = () => setRetryKey((k) => k + 1)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    Promise.all([
      fetch('/api/providers').then((r) => r.json()),
      fetch(`/api/provider-priority?capabilityKey=${encodeURIComponent(GLOBAL_KEY)}`).then((r) => r.json()),
    ])
      .then(([pData, prData]) => {
        if (cancelled) return
        setProviders(pData.providers ?? [])
        setPriority(prData.assignments ?? [])
      })
      .catch((err) => {
        console.error('[ProviderPriorityPanel] load failed', err)
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey, retryKey])

  const moveItem = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= priority.length) return
    const next = [...priority]
    ;[next[index], next[newIndex]] = [next[newIndex], next[index]]
    // 重新编号 priority
    next.forEach((item, i) => (item.priority = i))
    setPriority(next)
  }

  const removeItem = (index: number) => {
    const next = priority.filter((_, i) => i !== index)
    next.forEach((item, i) => (item.priority = i))
    setPriority(next)
  }

  const addProvider = (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId)
    if (!provider) return
    const defaultModel = provider.models[0] ?? null
    setPriority((prev) => [...prev, { providerId, modelName: defaultModel, priority: prev.length, status: 'unknown' }])
    setShowAdd(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch('/api/provider-priority', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capabilityKey: GLOBAL_KEY,
          scope: 'global',
          assignments: priority.map((p) => ({ providerId: p.providerId, modelName: p.modelName, priority: p.priority })),
        }),
      })
    } catch (err) {
      console.error('[ProviderPriorityPanel] save failed', err)
    } finally {
      setSaving(false)
    }
  }

  const availableProviders = providers.filter((p) => p.apiKey && !priority.some((pr) => pr.providerId === p.id))

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">正在加载供应商优先级…</p>
        <Button type="button" variant="outline" size="sm" className="mt-1" onClick={retry}>
          重新加载
        </Button>
      </div>
    )
  }

  if (loadError) {
    return <InlineError message={`供应商优先级加载失败：${loadError}`} onRetry={retry} />
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">全局 Provider 优先级（额度耗尽/不可用时自动切换到下一个）</div>
        <div className="flex items-center gap-2">
          {availableProviders.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAdd((v) => !v)}>
              <Plus className="size-3.5" />
              添加
            </Button>
          )}
          <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            <Save className="size-3.5" />
            保存
          </Button>
        </div>
      </div>

      {showAdd && availableProviders.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-md border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] p-2">
          {availableProviders.map((p) => (
            <Button key={p.id} type="button" variant="outline" size="sm" onClick={() => addProvider(p.id)}>
              + {p.displayName}
            </Button>
          ))}
        </div>
      )}

      {priority.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-[var(--agenthub-border)] py-6 text-center">
          <ArrowUp className="size-4 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">尚未配置优先级，点击「添加」把已配置的供应商加入优先级列表</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {priority.map((item, index) => {
            const provider = providers.find((p) => p.id === item.providerId)
            const displayName = provider?.displayName ?? BUILTIN_PROVIDERS[item.providerId]?.displayName ?? item.providerId
            return (
              <div
                key={item.providerId}
                className="flex items-center gap-3 rounded-md border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] px-3 py-2"
              >
                <span className="w-5 text-center text-xs font-medium text-muted-foreground">{index + 1}</span>
                <StatusDot status={item.status} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{displayName}</div>
                  {item.modelName && <div className="text-xs text-muted-foreground">{item.modelName}</div>}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0"
                    onClick={() => moveItem(index, -1)}
                    disabled={index === 0}
                    aria-label="上移"
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0"
                    onClick={() => moveItem(index, 1)}
                    disabled={index === priority.length - 1}
                    aria-label="下移"
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0 text-red-500 hover:text-red-600"
                    onClick={() => removeItem(index)}
                    aria-label="移除"
                  >
                    <XCircle className="size-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  if (status === 'healthy') {
    return <CheckCircle2 className="size-4 text-green-500" />
  }
  if (status === 'degraded') {
    return <CheckCircle2 className="size-4 text-amber-500" />
  }
  if (status === 'unavailable') {
    return <XCircle className="size-4 text-red-500" />
  }
  return <div className="size-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />
}
