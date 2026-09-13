'use client'

import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Pencil, Bot, Zap, Calendar, User, Link2, History, Paperclip, X } from 'lucide-react'
import type { ExperienceRow } from '@/db/schema'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  deleteExperienceFile,
  experienceFileDownloadUrl,
  fetchExperienceFiles,
  fetchExperienceUsage,
  type ExperienceAttachment,
  type ExperienceUsageItem,
} from '@/lib/api'
import { sanitizeExperienceHtml } from '@/lib/sanitize-html'

const KIND_LABEL: Record<string, string> = {
  experience: '经验',
  reflection: '反思',
  profile_fact: '画像',
}

const KIND_COLOR: Record<string, string> = {
  experience: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  reflection: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  profile_fact: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
}

interface ExperienceDetailProps {
  item: ExperienceRow
  agentName?: string
  onBack: () => void
  onEdit: (item: ExperienceRow) => void
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function ExperienceDetail({ item, agentName, onBack, onEdit }: ExperienceDetailProps) {
  const [usageRecords, setUsageRecords] = useState<ExperienceUsageItem[]>([])
  const [showAllUsage, setShowAllUsage] = useState(false)
  const [files, setFiles] = useState<ExperienceAttachment[]>([])
  const [filesLoading, setFilesLoading] = useState(true)
  // 渲染前白名单清洗（内容可能来自 LLM 提取，属不可信输入）
  const safeContent = useMemo(() => sanitizeExperienceHtml(item.content), [item.content])

  useEffect(() => {
    let cancelled = false
    fetchExperienceFiles(item.id)
      .then((rows) => { if (!cancelled) setFiles(rows) })
      .catch((err) => console.warn('[experience-detail] fetch files failed', err))
      .finally(() => { if (!cancelled) setFilesLoading(false) })
    return () => { cancelled = true }
  }, [item.id])

  const handleRemoveFile = async (fileId: string) => {
    try {
      await deleteExperienceFile(item.id, fileId)
      setFiles((prev) => prev.filter((f) => f.id !== fileId))
    } catch (err) {
      console.error('[experience-detail] delete file failed', err)
    }
  }

  useEffect(() => {
    let cancelled = false
    fetchExperienceUsage(item.id)
      .then((rows) => { if (!cancelled) setUsageRecords(rows) })
      .catch((err) => console.warn('[experience-detail] fetch usage failed', err))
    return () => { cancelled = true }
  }, [item.id])

  const visibleUsage = showAllUsage ? usageRecords : usageRecords.slice(0, 5)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      {/* 顶部操作栏 */}
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button onClick={onBack} className="flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" />
            资产
          </button>
          <span>/</span>
          <span>经验资产</span>
          <span>/</span>
          <span className="text-foreground">详情</span>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => onEdit(item)}>
          <Pencil className="size-3.5" />
          编辑
        </Button>
      </div>

      <div className="flex-1 space-y-6 px-6 py-6">
        {/* 标题区 */}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{item.title}</h1>
            <Badge className={cn('border text-[10px] font-normal', KIND_COLOR[item.kind])}>
              {KIND_LABEL[item.kind]}
            </Badge>
            <Badge className={cn(
              'border text-[10px] font-normal',
              item.active
                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-600 border-amber-500/20',
            )}>
              {item.active ? '已启用' : '草稿'}
            </Badge>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {item.content.replace(/<[^>]*>/g, '').slice(0, 100)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {agentName && (
              <span className="inline-flex items-center gap-1">
                <Bot className="size-3.5" />
                {agentName}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Zap className="size-3.5" />
              触发条件：{item.trigger}
            </span>
            {item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.tags.map((tag) => (
                  <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* 统计卡片 */}
        <div className="grid grid-cols-5 gap-3">
          <StatBox icon={Zap} label="使用次数" value={`${item.usageCount} 次`} />
          <StatBox icon={Calendar} label="最近使用" value={item.lastUsedAt ? formatDate(item.lastUsedAt) : '未使用'} />
          <StatBox icon={Calendar} label="创建时间" value={formatDate(item.createdAt)} />
          <StatBox icon={User} label="来源" value={item.source === 'auto' ? 'Agent 生成' : '手动创建'} />
          <StatBox icon={Link2} label="关联 Agent" value={agentName ?? '全局'} />
        </div>

        {/* 经验内容 */}
        <div>
          <h2 className="mb-2 text-sm font-medium">经验内容</h2>
          <div
            className="prose prose-sm max-w-none rounded-xl border bg-card p-4 text-sm leading-relaxed [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: safeContent || '<p class="text-muted-foreground">暂无内容</p>' }}
          />
        </div>

        {/* 使用记录 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">使用记录</h2>
            <button className="text-xs text-blue-500 hover:underline" onClick={() => setShowAllUsage(!showAllUsage)}>{showAllUsage ? "收起" : `查看全部 (${usageRecords.length})`}</button>
          </div>
          <div className="rounded-xl border bg-card">
            {visibleUsage.length > 0 ? (
              <div className="divide-y">
                {visibleUsage.map((rec) => (
                  <div key={rec.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                      <History className="size-4 text-blue-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium">经验注入</div>
                      <div className="text-[11px] text-muted-foreground">{formatDate(rec.createdAt)}</div>
                    </div>
                    <Badge className="border-0 bg-blue-500/10 text-[10px] text-blue-600">Run {rec.runId.slice(0, 8)}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                暂无使用记录
              </div>
            )}
          </div>
        </div>

        {/* 参考附件 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">参考附件</h2>
            {!filesLoading && files.length > 0 && (
              <span className="text-[11px] text-muted-foreground">{files.length} 个文件</span>
            )}
          </div>
          <div className="rounded-xl border bg-card">
            {filesLoading ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">加载中…</div>
            ) : files.length > 0 ? (
              <div className="divide-y">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-500/10">
                      <Paperclip className="size-4 text-slate-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <a
                        href={experienceFileDownloadUrl(item.id, f.id)}
                        download
                        className="block truncate text-xs font-medium hover:underline"
                        title={f.fileName}
                      >
                        {f.fileName}
                      </a>
                      <div className="text-[11px] text-muted-foreground">
                        {formatFileSize(f.size)} · {formatDate(f.createdAt)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground"
                      title="删除附件"
                      onClick={() => void handleRemoveFile(f.id)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                暂无参考附件
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function StatBox({ icon: Icon, label, value }: { icon: typeof Zap; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium" title={value}>{value}</div>
    </div>
  )
}
