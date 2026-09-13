'use client'

import { useEffect, useState } from 'react'
import { Upload, X, Paperclip } from 'lucide-react'
import type { ExperienceKind, ExperienceRow } from '@/db/schema'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RichTextEditor } from '@/components/experience/rich-text-editor'
import {
  deleteExperienceFile,
  experienceFileDownloadUrl,
  fetchExperienceFiles,
  uploadExperienceFiles,
  type ExperienceAttachment,
} from '@/lib/api'
import { cn } from '@/lib/utils'

const KIND_OPTIONS: { value: ExperienceKind; label: string }[] = [
  { value: 'experience', label: '经验' },
  { value: 'reflection', label: '反思' },
  { value: 'profile_fact', label: '画像' },
]

interface ExperienceEditorProps {
  item?: ExperienceRow // 编辑时传入，新建时不传
  agents: { id: string; name: string }[]
  onCancel: () => void
  onSave: (data: {
    kind: ExperienceKind
    title: string
    trigger: string
    content: string
    tags: string[]
    agentId: string | null
    active: boolean
  }) => Promise<void>
}

export function ExperienceEditor({ item, agents, onCancel, onSave }: ExperienceEditorProps) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [kind, setKind] = useState<ExperienceKind>(item?.kind ?? 'experience')
  const [trigger, setTrigger] = useState(item?.trigger ?? '')
  const [content, setContent] = useState(item?.content ?? '')
  const [agentId, setAgentId] = useState<string | null>(item?.agentId ?? null)
  const [active, setActive] = useState(item?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>(item?.tags ?? [])
  const [files, setFiles] = useState<ExperienceAttachment[]>([])
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!item?.id) return
    let cancelled = false
    fetchExperienceFiles(item.id)
      .then((rows) => { if (!cancelled) setFiles(rows) })
      .catch((err) => console.warn('[experience-editor] fetch files failed', err))
    return () => { cancelled = true }
  }, [item?.id])

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

  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t))

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (list.length === 0 || !item?.id) return
    setUploading(true)
    try {
      const uploaded = await uploadExperienceFiles(item.id, list)
      setFiles((prev) => [...uploaded, ...prev])
    } catch (err) {
      console.error('[experience-editor] upload failed', err)
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveFile = async (fileId: string) => {
    if (!item?.id) return
    try {
      await deleteExperienceFile(item.id, fileId)
      setFiles((prev) => prev.filter((f) => f.id !== fileId))
    } catch (err) {
      console.error('[experience-editor] delete file failed', err)
    }
  }

  const handleSave = async () => {
    if (!title.trim() || !trigger.trim() || !content.trim()) return
    setSaving(true)
    try {
      await onSave({ kind, title: title.trim(), trigger: trigger.trim(), content, tags, agentId, active })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 左右分栏 */}
      <div className="flex min-h-0 flex-1">
        {/* 左侧表单 */}
        <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r bg-muted/20 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              标题 <span className="text-red-500">*</span>
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="用户画像生成规则"
              maxLength={80}
              className="text-sm"
            />
            <div className="mt-1 text-right text-[10px] text-muted-foreground">{title.length}/80</div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium">分类</label>
            <div className="relative">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as ExperienceKind)}
                className="w-full appearance-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              触发条件 <span className="text-red-500">*</span>
            </label>
            <Input
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder="请输入触发条件（如：用户画像识别 / 会话结束）"
              maxLength={200}
              className="text-sm"
            />
            <div className="mt-1 text-right text-[10px] text-muted-foreground">{trigger.length}/200</div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              关联 Agent <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                value={agentId ?? ''}
                onChange={(e) => setAgentId(e.target.value || null)}
                className="w-full appearance-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="">全局（所有 Agent 可用）</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium">标签</label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1 text-[11px]">
                  {t}
                  <button onClick={() => removeTag(t)} className="hover:text-foreground">
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTags(tagInput) } }}
                placeholder="输入标签，回车或逗号添加"
                className="text-xs"
              />
              <Button size="sm" variant="outline" onClick={() => addTags(tagInput)} className="shrink-0 text-xs">添加</Button>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">最多 10 个标签，多个标签用逗号分隔</p>
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2.5">
            <div>
              <div className="text-xs font-medium">启用状态</div>
              <div className="text-[10px] text-muted-foreground">启用后将注入 Agent 上下文</div>
            </div>
            <button
              type="button"
              onClick={() => setActive(!active)}
              className={cn(
                'relative h-5 w-9 rounded-full transition-colors',
                active ? 'bg-blue-500' : 'bg-muted',
              )}
            >
              <span className={cn(
                'absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform',
                active ? 'translate-x-4' : 'translate-x-0.5',
              )} />
            </button>
          </div>
        </div>

        {/* 右侧富文本 */}
        <div className="flex min-h-0 flex-1 flex-col px-6 py-5">
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            经验内容 <span className="text-red-500">*</span>
          </label>
          <RichTextEditor
            value={content}
            onChange={setContent}
            placeholder="请输入经验内容…支持加粗、列表、对齐等富文本格式"
            minHeight={320}
            className="flex-1"
          />
          <div className="mt-3 space-y-2">
            {item && files.length > 0 && (
              <div className="space-y-1">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5">
                    <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                    <a
                      href={experienceFileDownloadUrl(item.id, f.id)}
                      download
                      className="min-w-0 flex-1 truncate text-xs hover:underline"
                      title={f.fileName}
                    >
                      {f.fileName}
                    </a>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{formatSize(f.size)}</span>
                    <button
                      onClick={() => void handleRemoveFile(f.id)}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      title="删除附件"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-4 py-3 transition-colors hover:bg-muted/40">
              <Upload className="size-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {uploading ? '上传中…' : '添加参考文件（可选）'}
              </span>
              <span className="text-[10px] text-muted-foreground/70">支持 PDF、DOC、TXT、MD 等格式，单文件 ≤ 20MB</span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => void handleUpload(e)}
                disabled={uploading || !item?.id}
              />
            </label>
          </div>
        </div>
      </div>

      {/* 底部操作行 */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-muted/40 px-6 py-3">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>取消</Button>
        <Button size="sm" onClick={handleSave} disabled={saving || !title.trim() || !trigger.trim() || !content.trim()}>
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
