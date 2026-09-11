'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus, Settings2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ProviderConfigDialog } from '@/components/settings/provider-config-dialog'
import type { LlmProviderRow } from '@/db/schema'
import type { LlmModelAssignmentRow } from '@/db/schema'
import {
  AGENT_CAPABILITIES,
  SYSTEM_CAPABILITIES,
  type ProviderUsage,
} from '@/lib/llm-shared'

interface ProvidersPanelProps {
  /** 父组件可以触发刷新（比如保存设置后） */
  refreshKey?: number
}

export function ProvidersPanel({ refreshKey }: ProvidersPanelProps) {
  const [providers, setProviders] = useState<LlmProviderRow[]>([])
  const [assignments, setAssignments] = useState<LlmModelAssignmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [configOpen, setConfigOpen] = useState(false)
  const [configProviderId, setConfigProviderId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([fetch('/api/providers').then((r) => r.json()), fetch('/api/model-assignments').then((r) => r.json())])
      .then(([pData, aData]) => {
        if (cancelled) return
        setProviders(pData.providers ?? [])
        setAssignments(aData.assignments ?? [])
      })
      .catch((err) => console.error('[ProvidersPanel] load failed', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey, configOpen]) // configOpen 变化时刷新（关闭对话框后重新拉取）

  const usageMap = buildUsageMap(assignments)

  const openConfig = (providerId: string | null) => {
    setConfigProviderId(providerId)
    setConfigOpen(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const configured = providers.filter((p) => p.apiKey)
  const unconfigured = providers.filter((p) => !p.apiKey)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          已配置 {configured.length} 个 · 未配置 {unconfigured.length} 个
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => openConfig(null)}>
          <Plus className="size-4" />
          添加供应商
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {providers.map((provider) => (
          <ProviderCard key={provider.id} provider={provider} usage={usageMap.get(provider.id)} onConfig={() => openConfig(provider.id)} />
        ))}
      </div>

      <ProviderConfigDialog open={configOpen} onOpenChange={setConfigOpen} providerId={configProviderId} />
    </div>
  )
}

// ─── 供应商卡片 ─────────────────────────────────────────────────

function ProviderCard({
  provider,
  usage,
  onConfig,
}: {
  provider: LlmProviderRow
  usage?: ProviderUsage
  onConfig: () => void
}) {
  const isConfigured = !!provider.apiKey
  const isConnected = provider.isConnected
  const totalUsage = (usage?.systemCapabilities.length ?? 0) + (usage?.agentCapabilities.length ?? 0)

  const systemLabels = (usage?.systemCapabilities ?? []).map((k) => capabilityLabel(k, 'system'))
  const agentLabels = (usage?.agentCapabilities ?? []).map((k) => capabilityLabel(k, 'agent'))

  return (
    <div
      className={`rounded-lg border p-3 transition ${
        isConfigured
          ? 'border-slate-200 bg-white dark:border-white/10 dark:bg-neutral-900'
          : 'border-dashed border-slate-200 bg-slate-50/50 dark:border-white/10 dark:bg-white/[0.02]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{provider.displayName}</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                isConnected
                  ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400'
                  : isConfigured
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
                    : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400'
              }`}
            >
              <span className={`size-1.5 rounded-full ${isConnected ? 'bg-green-500' : isConfigured ? 'bg-amber-500' : 'bg-slate-400'}`} />
              {isConnected ? '已连接' : isConfigured ? '未测试' : '未配置'}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {provider.providerType === 'custom' ? '自定义供应商' : provider.models.slice(0, 3).join(' · ') || '暂无模型'}
          </div>

          {totalUsage > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">使用中：</span>
              {[...systemLabels, ...agentLabels].slice(0, 4).map((label) => (
                <span
                  key={label}
                  className="rounded bg-[var(--agenthub-accent-soft)] px-1.5 py-0.5 text-[11px] text-[var(--agenthub-accent)]"
                >
                  {label}
                </span>
              ))}
              {totalUsage > 4 && <span className="text-[11px] text-muted-foreground">+{totalUsage - 4}</span>}
            </div>
          )}
        </div>

        <Button type="button" variant="ghost" size="sm" onClick={onConfig} className="shrink-0">
          <Settings2 className="size-4" />
          配置
        </Button>
      </div>
    </div>
  )
}

// ─── 工具函数 ────────────────────────────────────────────────────

function buildUsageMap(assignments: LlmModelAssignmentRow[]): Map<string, ProviderUsage> {
  const map = new Map<string, ProviderUsage>()
  for (const a of assignments) {
    if (!a.providerId) continue
    if (!map.has(a.providerId)) {
      map.set(a.providerId, { systemCapabilities: [], agentCapabilities: [], globalKeys: [] })
    }
    const usage = map.get(a.providerId)!
    if (a.scope === 'system') usage.systemCapabilities.push(a.capabilityKey)
    else if (a.scope === 'agent') usage.agentCapabilities.push(a.capabilityKey)
    else usage.globalKeys.push(a.capabilityKey)
  }
  return map
}

function capabilityLabel(key: string, scope: 'system' | 'agent'): string {
  if (scope === 'system') {
    const found = SYSTEM_CAPABILITIES.find((c) => c.key === key)
    return found?.label ?? key
  }
  const found = AGENT_CAPABILITIES.find((c) => c.key === key)
  return found?.label ?? key.replace('agent:', '')
}
