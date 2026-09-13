'use client'

import { useState } from 'react'
import { Upload, X, Paperclip } from 'lucide-react'
import type { ExperienceKind, ExperienceRow } from '@/db/schema'
import { Badge } from '@/components/ui/badge'
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
import { RichTextEditor } from '@/components/experience/rich-text-editor'
import { uploadExperienceFiles } from '@/lib/api'
import { cn } from '@/lib/utils'

const KIND_OPTIONS: { value: ExperienceKind; label: string }[] = [
  { value: 'experience', label: '经验' },
  { value: 'reflection', label: '反思' },
  { value: 'profile_fact', label: '画像' },
]

interface ExperienceCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agents: { id: string; name: string }[]
  onCreate: (data: {
    kind: ExperienceKind
    title: string
    trigger: string
    content: string
    tags: string[]
    agentId: string | null
    active: boolean
  }) => Promise<ExperienceRow>
}

export function ExperienceCreateDialog({ open, onOpenChange, agents, onCreate }: ExperienceCreateDialogProps) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<ExperienceKind>('experience')
  const [trigger, setTrigger] = useState('')
  const [content, setContent] = useState('')
  const [agentId, setAgentId] = useState<string | null>(null)
  const [active, setActive] = useState(true)
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [creating, setCreating] = useState(false)

  const reset = () => {
    setTitle(''); setKind('experience'); setTrigger(''); setContent('')
    setAgentId(null); setActive(true); setTagInput(''); setTags([]); setPendingFiles([])
  }

  const addTags = (raw: string) => {
    const parts = raw.split(/[,，]/).map((x) => x.trim()).filter(Boolean)
    if (parts.length === 0) return
    setTags((prev) => {
      const next = [...prev]
      for (const p of parts) {
        if (p && !next.includes(p) && next.length < 10) next.push(p)
      }
      return next
    })
    setTagInput('')
  }

  const handlePickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (list.length === 0) return
    setPendingFiles((prev) => [...prev, ...list].slice(0, 10))
  }

  const handleCreate = async () => {
    if (!title.trim() || !trigger.trim() || !content.trim()) return
    setCreating(true)
    try {
      const row = await onCreate({ kind, title: title.trim(), trigger: trigger.trim(), content, tags, agentId, active })
      if (pendingFiles.length > 0) {
        try {
          await uploadExperienceFiles(row.id, pendingFiles)
        } catch (err) {
          console.error('[experience-create-dialog] upload pending files failed', err)
        }
      }
      reset()
      onOpenChange(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="sm:max-w-3xl [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>新建经验资产</DialogTitle>
          <DialogDescription>手动录入一条可复用的经验，将按触发条件注入后续 Agent 任务的系统提示。</DialogDescription>
        </DialogHeader>

        <div className="flex gap-5">
          {/* 左侧表单 */}
          <div className="flex w-64 shrink-0 flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">标题 *</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="请输入经验标题" maxLength={80} className="text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">分类</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as ExperienceKind)}
                className="w-full appearance-none rounded-md border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">触发条件 *</label>
              <Input value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="如：用户画像识别 / 会话结束" maxLength={200} className="text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">关联 Agent *</label>
              <select value={agentId ?? ''} onChange={(e) => setAgentId(e.target.value || null)}
                className="w-full appearance-none rounded-md border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                <option value="">全局（所有 Agent 可用）</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">标签</label>
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1 text-[10px]">
                    {t}
                    <button onClick={() => setTags(tags.filter((x) => x !== t))}><X className="size-2.5" /></button>
                  </Badge>
                ))}
              </div>
              <div className="mt-1 flex gap-1">
                <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTags(tagInput) } }}
                  placeholder="输入标签，回车或逗号添加" className="text-xs" />
                <Button size="sm" variant="outline" onClick={() => addTags(tagInput)} className="shrink-0 text-xs">添加</Button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">最多 10 个标签，多个标签用逗号分隔</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-xs font-medium">启用</span>
              <button type="button" onClick={() => setActive(!active)}
                className={cn('relative h-5 w-9 rounded-full transition-colors', active ? 'bg-blue-500' : 'bg-muted')}>
                <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform', active ? 'translate-x-4' : 'translate-x-0.5')} />
              </button>
            </div>
          </div>

          {/* 右侧富文本 */}
          <div className="flex min-w-0 flex-1 flex-col">
            <label className="mb-1 block text-xs font-medium">经验内容 *</label>
            <RichTextEditor value={content} onChange={setContent} placeholder="请输入经验内容…" minHeight={240} />
            {pendingFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {pendingFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1">
                    <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-[11px]">{f.name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{formatFileSize(f.size)}</span>
                    <button
                      onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      title="移除"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2 transition-colors hover:bg-muted/40">
              <Upload className="size-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">{creating ? '创建中…' : '添加参考文件（可选）'}</span>
              <span className="text-[10px] text-muted-foreground/70">创建后自动上传</span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={handlePickFiles}
                disabled={creating}
              />
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => { reset(); onOpenChange(false) }} disabled={creating}>取消</Button>
          <Button size="sm" onClick={handleCreate}
            disabled={creating || !title.trim() || !trigger.trim() || !content.trim()}>
            {creating ? '创建中…' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
