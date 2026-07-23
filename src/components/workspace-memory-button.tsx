'use client'

import { BookOpenText, Loader2, Pencil, Pin, PinOff, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import type { WorkspaceMemoryRow } from '@/db/schema'
import {
  createWorkspaceMemory,
  deleteWorkspaceMemory,
  fetchWorkspaceMemories,
  updateWorkspaceMemory,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAppStore, useWorkspaceMemories } from '@/stores/app-store'

const EMPTY_FORM = { title: '', content: '' }

export function WorkspaceMemoryButton({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const memories = useWorkspaceMemories(conversationId)
  const setWorkspaceMemoriesForConversation = useAppStore((s) => s.setWorkspaceMemoriesForConversation)
  const upsertWorkspaceMemory = useAppStore((s) => s.upsertWorkspaceMemory)
  const removeWorkspaceMemory = useAppStore((s) => s.removeWorkspaceMemory)

  const editingMemory = useMemo(
    () => memories.find((memory) => memory.id === editingId) ?? null,
    [editingId, memories],
  )

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchWorkspaceMemories(conversationId)
      .then((list) => {
        if (!cancelled) setWorkspaceMemoriesForConversation(conversationId, list)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [conversationId, open, setWorkspaceMemoriesForConversation])

  const resetForm = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const startEdit = (memory: WorkspaceMemoryRow) => {
    setEditingId(memory.id)
    setForm({ title: memory.title, content: memory.content })
    setError(null)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const memory = editingMemory
        ? await updateWorkspaceMemory(conversationId, editingMemory.id, form)
        : await createWorkspaceMemory(conversationId, { ...form, pinned: false })
      upsertWorkspaceMemory(conversationId, memory)
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const togglePinned = async (memory: WorkspaceMemoryRow) => {
    setError(null)
    try {
      upsertWorkspaceMemory(conversationId, await updateWorkspaceMemory(conversationId, memory.id, { pinned: !memory.pinned }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const remove = async (memory: WorkspaceMemoryRow) => {
    setError(null)
    try {
      await deleteWorkspaceMemory(conversationId, memory.id)
      removeWorkspaceMemory(conversationId, memory.id)
      if (editingId === memory.id) resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const canSave = form.title.trim() && form.content.trim() && !saving

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button size="icon-sm" variant="ghost" title="Workspace Memory" className="rounded-lg text-slate-500 transition hover:bg-slate-100" />}>
        <BookOpenText className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] gap-3 p-0">
        <PopoverHeader className="border-b px-4 py-3">
          <PopoverTitle className="flex items-center gap-2 text-sm">
            <BookOpenText className="size-4 text-muted-foreground" />
            Workspace Memory
          </PopoverTitle>
          <PopoverDescription className="text-xs leading-5">
            仅作用于当前会话工作区，会注入后续 Agent 运行上下文，不是全局记忆。
          </PopoverDescription>
        </PopoverHeader>

        <div className="space-y-3 px-4 pb-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-slate-700">
                {editingMemory ? '编辑备注' : '新增备注'}
              </div>
              {editingMemory && (
                <Button size="xs" variant="ghost" onClick={resetForm}>
                  取消
                </Button>
              )}
            </div>
            <Input
              value={form.title}
              maxLength={80}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="标题，例如：构建命令"
            />
            <Textarea
              value={form.content}
              maxLength={4000}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="写下后续 Agent 需要长期记住的项目约束、命令或注意事项"
              className="max-h-36 min-h-24 resize-none text-sm"
            />
            <Button size="sm" onClick={save} disabled={!canSave} className="w-full gap-1.5">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              {editingMemory ? '保存修改' : '添加 Memory'}
            </Button>
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500">
                <Loader2 className="size-3.5 animate-spin" />
                加载中
              </div>
            ) : memories.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-500">
                当前会话还没有 Memory
              </div>
            ) : (
              memories.map((memory) => (
                <MemoryCard
                  key={memory.id}
                  memory={memory}
                  active={memory.id === editingId}
                  onEdit={() => startEdit(memory)}
                  onTogglePinned={() => togglePinned(memory)}
                  onDelete={() => remove(memory)}
                />
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function MemoryCard({
  memory,
  active,
  onEdit,
  onTogglePinned,
  onDelete,
}: {
  memory: WorkspaceMemoryRow
  active: boolean
  onEdit: () => void
  onTogglePinned: () => void
  onDelete: () => void
}) {
  return (
    <div className={cn('rounded-xl border p-3 text-sm', active ? 'border-blue-200 bg-blue-50/50' : 'border-slate-100 bg-white')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {memory.pinned && <Pin className="size-3 text-blue-500" />}
            <div className="truncate text-xs font-semibold text-slate-900">{memory.title}</div>
          </div>
          <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">
            {memory.content}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="icon-xs" variant="ghost" title={memory.pinned ? '取消 pin' : 'Pin'} onClick={onTogglePinned}>
            {memory.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
          </Button>
          <Button size="icon-xs" variant="ghost" title="编辑" onClick={onEdit}>
            <Pencil className="size-3" />
          </Button>
          <Button size="icon-xs" variant="ghost" title="删除" onClick={onDelete}>
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}
