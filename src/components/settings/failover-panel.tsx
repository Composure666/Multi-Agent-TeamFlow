'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw, Save, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { LlmFailoverConfigRow, LlmFailoverEventRow } from '@/db/schema'

interface FailoverPanelProps {
  refreshKey?: number
}

const TRIGGER_OPTIONS = [
  { key: 'triggerBalance', label: '额度耗尽', desc: '402 / insufficient_balance / quota_exceeded' },
  { key: 'triggerAuth', label: '鉴权失败', desc: '401 / 403 / invalid_api_key' },
  { key: 'triggerRateLimit', label: '限流', desc: '429 / rate_limit / too_many_requests' },
  { key: 'triggerServerError', label: '服务不可用', desc: '5xx / server_error / service_unavailable' },
  { key: 'triggerTimeout', label: '请求超时', desc: 'timeout / aborted / network_error' },
] as const

export function FailoverPanel({ refreshKey }: FailoverPanelProps) {
  const [config, setConfig] = useState<LlmFailoverConfigRow | null>(null)
  const [events, setEvents] = useState<LlmFailoverEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetch('/api/failover-config').then((r) => r.json()),
      fetch('/api/failover-events?limit=20').then((r) => r.json()),
    ])
      .then(([cData, eData]) => {
        if (cancelled) return
        setConfig(cData.config)
        setEvents(eData.events ?? [])
      })
      .catch((err) => console.error('[FailoverPanel] load failed', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const toggleTrigger = (key: keyof LlmFailoverConfigRow) => {
    if (!config) return
    setConfig((prev) => (prev ? { ...prev, [key]: !prev[key] } : prev))
  }

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    try {
      await fetch('/api/failover-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: config.enabled,
          triggerBalance: config.triggerBalance,
          triggerAuth: config.triggerAuth,
          triggerRateLimit: config.triggerRateLimit,
          triggerServerError: config.triggerServerError,
          triggerTimeout: config.triggerTimeout,
          maxRetries: config.maxRetries,
          cooldownSeconds: config.cooldownSeconds,
          autoRecover: config.autoRecover,
        }),
      })
    } catch (err) {
      console.error('[FailoverPanel] save failed', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 总开关 */}
      <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-900">
        <div className="flex items-center gap-2">
          <ShieldCheck className={`size-4 ${config.enabled ? 'text-green-500' : 'text-slate-400'}`} />
          <div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">自动故障转移</div>
            <div className="text-xs text-muted-foreground">当前供应商不可用时自动切换到优先级列表中的下一个</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setConfig((prev) => (prev ? { ...prev, enabled: !prev.enabled } : prev))}
          className={`relative h-6 w-11 rounded-full transition-colors ${config.enabled ? 'bg-[var(--agenthub-accent)]' : 'bg-slate-300 dark:bg-slate-600'}`}
          aria-label="故障转移开关"
        >
          <span
            className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${config.enabled ? 'translate-x-5' : 'translate-x-0.5'}`}
          />
        </button>
      </div>

      {/* 触发条件 */}
      <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-900">
        <div className="mb-2 text-sm font-medium text-slate-900 dark:text-slate-100">触发条件</div>
        <div className="flex flex-col gap-2">
          {TRIGGER_OPTIONS.map((opt) => (
            <label key={opt.key} className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(config[opt.key as keyof LlmFailoverConfigRow])}
                onChange={() => toggleTrigger(opt.key as keyof LlmFailoverConfigRow)}
                className="size-4 rounded border-slate-300 accent-[var(--agenthub-accent)]"
                disabled={!config.enabled}
              />
              <span className="text-sm text-slate-900 dark:text-slate-100">{opt.label}</span>
              <span className="text-xs text-muted-foreground">{opt.desc}</span>
            </label>
          ))}
        </div>
        <div className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
          参数错误（400）、业务错误、Prompt 过长等不会触发自动切换，避免不必要的 Provider 切换。
        </div>
      </div>

      {/* 重试与冷却 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-900">
          <div className="mb-1 text-xs text-muted-foreground">最大重试次数</div>
          <input
            type="number"
            min={0}
            max={10}
            value={config.maxRetries}
            onChange={(e) => setConfig((prev) => (prev ? { ...prev, maxRetries: Math.max(0, Math.min(10, Number(e.target.value))) } : prev))}
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-neutral-800"
            disabled={!config.enabled}
          />
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-900">
          <div className="mb-1 text-xs text-muted-foreground">切换冷却（秒）</div>
          <input
            type="number"
            min={0}
            max={3600}
            value={config.cooldownSeconds}
            onChange={(e) => setConfig((prev) => (prev ? { ...prev, cooldownSeconds: Math.max(0, Math.min(3600, Number(e.target.value))) } : prev))}
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-neutral-800"
            disabled={!config.enabled}
          />
        </div>
      </div>

      {/* 恢复策略 */}
      <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-900">
        <div className="flex items-center gap-2">
          <RefreshCw className="size-4 text-[var(--agenthub-accent)]" />
          <div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">首选供应商恢复后自动切回</div>
            <div className="text-xs text-muted-foreground">冷却期过后，优先供应商恢复可用时自动切回优先级最高的供应商</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setConfig((prev) => (prev ? { ...prev, autoRecover: !prev.autoRecover } : prev))}
          className={`relative h-6 w-11 rounded-full transition-colors ${config.autoRecover ? 'bg-[var(--agenthub-accent)]' : 'bg-slate-300 dark:bg-slate-600'}`}
          aria-label="自动恢复开关"
        >
          <span
            className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${config.autoRecover ? 'translate-x-5' : 'translate-x-0.5'}`}
          />
        </button>
      </div>

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          <Save className="size-3.5" />
          保存配置
        </Button>
      </div>

      {/* 切换记录 */}
      <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-900">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
          <AlertTriangle className="size-4 text-amber-500" />
          最近切换记录
        </div>
        {events.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">暂无切换记录</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {events.slice(0, 10).map((event) => (
              <div key={event.id} className="flex items-center gap-2 rounded bg-slate-50 px-2 py-1.5 text-xs dark:bg-white/5">
                <span className="text-muted-foreground">{new Date(event.createdAt).toLocaleTimeString()}</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">{event.fromProviderId ?? '—'}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-medium text-[var(--agenthub-accent)]">{event.toProviderId ?? '—'}</span>
                <span className="ml-auto text-muted-foreground">{event.reason}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
