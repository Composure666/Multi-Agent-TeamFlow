'use client'

import { useMemo, useState } from 'react'

import { AgentAvatar } from '@/components/agent-avatar'
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
import { addAgentsToConversation } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAgentList, useAppStore } from '@/stores/app-store'

export function AddAgentDialog({
  open,
  onOpenChange,
  conversationId,
  existingAgentIds,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversationId: string
  existingAgentIds: string[]
}) {
  const allAgents = useAgentList()
  const upsertConversation = useAppStore((s) => s.upsertConversation)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allAgents.filter((a) => {
      if (existingAgentIds.includes(a.id)) return false
      if (!q) return true
      return `${a.name} ${a.description} ${a.adapterName} ${a.modelId ?? ''}`.toLowerCase().includes(q)
    })
  }, [allAgents, existingAgentIds, query])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const submit = async () => {
    if (selected.size === 0 || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const updated = await addAgentsToConversation(conversationId, Array.from(selected))
      upsertConversation(updated)
      setSelected(new Set())
      onOpenChange(false)
    } catch (err) {
      console.error('[AddAgentDialog] failed', err)
      setError('添加 Agent 失败，请稍后重试。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>添加 Agent 到会话</DialogTitle>
          <DialogDescription>
            为这个对话拉入更多 Agent。加入后会话会从单聊自动升级为群聊（如适用）。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 Agent 名称、模型或说明"
            className="h-9"
          />
          {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
          {candidates.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {query.trim() ? '没有匹配的可添加 Agent' : '当前会话已包含所有可用 Agent'}
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {candidates.map((a) => {
                  const isSelected = selected.has(a.id)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggle(a.id)}
                      className={cn(
                        'flex min-w-0 items-start gap-3 rounded-md border p-3 text-left transition hover:border-foreground/30',
                        isSelected && 'border-primary bg-primary/5',
                      )}
                    >
                      <AgentAvatar agent={a} size="lg" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium">{a.name}</span>
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-3xs text-muted-foreground">
                            {a.adapterName}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {a.description}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="mr-auto text-xs text-muted-foreground">已选 {selected.size} 位</div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={selected.size === 0 || submitting}>
            {submitting ? '添加中...' : '添加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
