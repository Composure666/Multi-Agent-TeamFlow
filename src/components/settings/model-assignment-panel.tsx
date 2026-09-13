'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, RotateCcw, Save } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { LlmModelAssignmentRow, LlmProviderRow } from '@/db/schema'
import { MODALITY_CAPABILITIES } from '@/lib/llm-shared'

interface ModelAssignmentPanelProps {
  refreshKey?: number
}

interface ModalityState {
  providerId: string // '' = 自动
  modelName: string
}

/**
 * 模型分配面板 —— 按 Agent 模态（文本/视觉/生图/音频/代码/多模态）分配 provider + model。
 * 创建 Agent 时会按模态自动匹配这里配置的模型。
 */
export function ModelAssignmentPanel({ refreshKey }: ModelAssignmentPanelProps) {
  const [providers, setProviders] = useState<LlmProviderRow[]>([])
  const [assignments, setAssignments] = useState<LlmModelAssignmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [states, setStates] = useState<Record<string, ModalityState>>({})

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetch('/api/providers').then((r) => r.json()),
      fetch('/api/model-assignments').then((r) => r.json()),
    ])
      .then(([pData, aData]) => {
        if (cancelled) return
        const provs: LlmProviderRow[] = pData.providers ?? []
        const assigns: LlmModelAssignmentRow[] = aData.assignments ?? []
        setProviders(provs)
        setAssignments(assigns)

        // 从 assignments 初始化每个模态的状态
        const next: Record<string, ModalityState> = {}
        for (const cap of MODALITY_CAPABILITIES) {
          const match = assigns.find(
            (a) => a.scope === 'agent' && a.capabilityKey === cap.key && a.priority === 0,
          )
          next[cap.key] = {
            providerId: match?.providerId ?? '',
            modelName: match?.modelName ?? '',
          }
        }
        setStates(next)
      })
      .catch((err) => console.error('[ModelAssignmentPanel] load failed', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const handleChange = (capKey: string, field: keyof ModalityState, value: string) => {
    setStates((prev) => ({
      ...prev,
      [capKey]: { ...prev[capKey], [field]: value },
    }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const toUpsert: Array<{
        scope: 'agent'
        capabilityKey: string
        providerId: string | null
        modelName: string | null
        priority: number
      }> = []
      const clearKeys: string[] = []

      for (const cap of MODALITY_CAPABILITIES) {
        const st = states[cap.key]
        if (st?.providerId && st.modelName) {
          toUpsert.push({
            scope: 'agent',
            capabilityKey: cap.key,
            providerId: st.providerId,
            modelName: st.modelName,
            priority: 0,
          })
        } else {
          clearKeys.push(cap.key)
        }
      }

      await fetch('/api/model-assignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: toUpsert, clearKeys }),
      })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('[ModelAssignmentPanel] save failed', err)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    const next: Record<string, ModalityState> = {}
    for (const cap of MODALITY_CAPABILITIES) {
      next[cap.key] = { providerId: '', modelName: '' }
    }
    setStates(next)
    setSaved(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
        创建 Agent 时会按提示词自动推断模态，并匹配这里配置的模型。未配置的模态走全局默认策略。
      </div>

      <div className="flex flex-col gap-3">
        {MODALITY_CAPABILITIES.map((cap) => {
          const st = states[cap.key] ?? { providerId: '', modelName: '' }
          const selectedProvider = providers.find((p) => p.id === st.providerId)
          const models: string[] = Array.isArray(selectedProvider?.models) ? selectedProvider.models : []

          return (
            <div key={cap.key} className="rounded-xl border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{cap.label}</div>
                  <div className="text-[11px] text-muted-foreground">{cap.description}</div>
                </div>
                {selectedProvider && !selectedProvider.isConnected && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                    未连接
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <label className="text-[11px] text-muted-foreground">供应商</label>
                  <select
                    value={st.providerId}
                    onChange={(e) => handleChange(cap.key, 'providerId', e.target.value)}
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                  >
                    <option value="">自动（全局策略）</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                        {p.isConnected ? '' : ' (未连接)'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1">
                  <label className="text-[11px] text-muted-foreground">模型</label>
                  {models.length > 0 ? (
                    <select
                      value={st.modelName}
                      onChange={(e) => handleChange(cap.key, 'modelName', e.target.value)}
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                      disabled={!st.providerId}
                    >
                      <option value="">选择模型…</option>
                      {models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={st.modelName}
                      onChange={(e) => handleChange(cap.key, 'modelName', e.target.value)}
                      placeholder={st.providerId ? '输入模型名…' : '先选供应商'}
                      disabled={!st.providerId}
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                    />
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : saved ? (
            <Check className="size-3.5" />
          ) : (
            <Save className="size-3.5" />
          )}
          {saved ? '已保存' : '保存分配'}
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset} disabled={saving}>
          <RotateCcw className="size-3.5" />
          全部重置为自动
        </Button>
      </div>
    </div>
  )
}
