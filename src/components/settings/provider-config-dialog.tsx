'use client'

import { useEffect, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { BUILTIN_PROVIDER_IDS } from '@/lib/llm-shared'

interface ProviderConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  providerId: string | null // null = 新建自定义供应商
}

interface ProviderForm {
  displayName: string
  apiKey: string
  baseUrl: string
  models: string // 逗号分隔
}

const EMPTY_FORM: ProviderForm = { displayName: '', apiKey: '', baseUrl: '', models: '' }

export function ProviderConfigDialog({ open, onOpenChange, providerId }: ProviderConfigDialogProps) {
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ connected: boolean; error?: string } | null>(null)
  const [revealKey, setRevealKey] = useState(false)

  const isBuiltin = providerId ? BUILTIN_PROVIDER_IDS.includes(providerId) : false
  const isNew = providerId === null

  // 加载供应商详情
  useEffect(() => {
    if (!open || !providerId) return
    let cancelled = false
    setLoading(true)
    setTestResult(null)
    fetch(`/api/providers/${encodeURIComponent(providerId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (cancelled || !data.provider) return
        setForm({
          displayName: data.provider.displayName ?? '',
          apiKey: data.provider.apiKey ?? '',
          baseUrl: data.provider.baseUrl ?? '',
          models: (data.provider.models ?? []).join(', '),
        })
      })
      .catch((err) => console.error('[ProviderConfigDialog] load failed', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, providerId])

  // 新建时重置表单
  useEffect(() => {
    if (open && isNew) {
      setForm(EMPTY_FORM)
      setTestResult(null)
    }
  }, [open, isNew])

  const handleTest = async () => {
    if (!providerId) return
    setTesting(true)
    setTestResult(null)
    try {
      // 先保存当前表单（key 可能刚改了），再测试
      await saveProvider(true)
      const res = await fetch(`/api/providers/${encodeURIComponent(providerId)}/test`, { method: 'POST' })
      const data = await res.json()
      setTestResult(data)
    } catch (err) {
      setTestResult({ connected: false, error: err instanceof Error ? err.message : String(err) })
    } finally {
      setTesting(false)
    }
  }

  const saveProvider = async (silent = false): Promise<boolean> => {
    const payload = {
      displayName: form.displayName.trim() || undefined,
      apiKey: form.apiKey.trim() || null,
      baseUrl: form.baseUrl.trim() || null,
      models: form.models
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
    }
    try {
      const url = providerId ? `/api/providers/${encodeURIComponent(providerId)}` : '/api/providers'
      const method = providerId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return true
    } catch (err) {
      if (!silent) console.error('[ProviderConfigDialog] save failed', err)
      return false
    }
  }

  const handleSave = async () => {
    setSaving(true)
    const ok = await saveProvider()
    setSaving(false)
    if (ok) onOpenChange(false)
  }

  const handleDelete = async () => {
    if (!providerId || isBuiltin) return
    if (!confirm(`确定删除供应商「${form.displayName || providerId}」？`)) return
    try {
      await fetch(`/api/providers/${encodeURIComponent(providerId)}`, { method: 'DELETE' })
      onOpenChange(false)
    } catch (err) {
      console.error('[ProviderConfigDialog] delete failed', err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? '添加供应商' : `配置 · ${form.displayName || providerId}`}</DialogTitle>
          <DialogDescription>
            {isBuiltin ? '内置供应商，不可删除，可清空 API Key。' : '配置供应商的 API Key、Base URL 和可用模型。'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {!isBuiltin && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="provider-name">名称</label>
                <Input
                  id="provider-name"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="例如：My OpenAI Proxy"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="provider-api-key">API Key</label>
              <div className="flex gap-2">
                <Input
                  id="provider-api-key"
                  type={revealKey ? 'text' : 'password'}
                  value={form.apiKey}
                  onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                  placeholder="sk-..."
                  autoComplete="off"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setRevealKey((v) => !v)}>
                  {revealKey ? '隐藏' : '显示'}
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="provider-base-url">Base URL（可选）</label>
              <Input
                id="provider-base-url"
                value={form.baseUrl}
                onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                placeholder="https://api.openai.com/v1"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="provider-models">可用模型（逗号分隔）</label>
              <Textarea
                id="provider-models"
                value={form.models}
                onChange={(e) => setForm((f) => ({ ...f, models: e.target.value }))}
                placeholder="gpt-4o, gpt-4o-mini, gpt-5"
                rows={2}
              />
            </div>

            {testResult && (
              <div
                className={`rounded-md px-3 py-2 text-xs ${
                  testResult.connected
                    ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                    : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                }`}
              >
                {testResult.connected ? '✓ 连接成功' : `✗ 连接失败：${testResult.error ?? '未知错误'}`}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {!isNew && !isBuiltin && (
              <Button type="button" variant="ghost" size="sm" onClick={() => void handleDelete()} className="text-red-600 hover:text-red-700">
                <Trash2 className="size-4" />
                删除
              </Button>
            )}
            {!isNew && (
              <Button type="button" variant="outline" size="sm" onClick={() => void handleTest()} disabled={testing || loading}>
                {testing && <Loader2 className="size-4 animate-spin" />}
                测试连接
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving || loading}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
