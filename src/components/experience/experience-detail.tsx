'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft,
  Pencil,
  Bot,
  Zap,
  Calendar,
  User,
  Link2,
  History,
  Paperclip,
  X,
  RotateCcw,
  Repeat2,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import type { ExperienceRow } from '@/db/schema'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  deleteExperienceFile,
  experienceFileDownloadUrl,
  fetchExperienceFiles,
  fetchExperienceRevisions,
  fetchExperienceUsage,
  rollbackExperienceRevision,
  type ExperienceAttachment,
  type ExperienceRevisionItem,
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

/** 迭代快照的四种来源：内容修订 / 验证有效 / 停用 / 回滚 */
const REVISION_META: Record<string, { label: string; icon: typeof History; badge: string; iconBg: string }> = {
  refine: {
    label: '内容修订',
    icon: Repeat2,
    badge: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    iconBg: 'bg-amber-500/10 text-amber-500',
  },
  confirm: {
    label: '验证有效',
    icon: CheckCircle2,
    badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    iconBg: 'bg-emerald-500/10 text-emerald-500',
  },
  retire: {
    label: '自动停用',
    icon: XCircle,
    badge: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
    iconBg: 'bg-rose-500/10 text-rose-500',
  },
  restore: {
    label: '回滚到此处',
    icon: RotateCcw,
    badge: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    iconBg: 'bg-blue-500/10 text-blue-500',
  },
}

interface ExperienceDetailProps {
  item: ExperienceRow
  agentName?: string
  onBack: () => void
  onEdit: (item: ExperienceRow) => void
  /** 回滚后把新内容交回列表刷新 */
  onUpdated?: (item: ExperienceRow) => void
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function ExperienceDetail({ item, agentName, onBack, onEdit, onUpdated }: ExperienceDetailProps) {
  const [usageRecords, setUsageRecords] = useState<ExperienceUsageItem[]>([])
  const [showAllUsage, setShowAllUsage] = useState(false)
  const [files, setFiles] = useState<ExperienceAttachment[]>([])
  const [filesLoading, setFilesLoading] = useState(true)
  const [revisions, setRevisions] = useState<ExperienceRevisionItem[]>([])
  const [showAllRevisions, setShowAllRevisions] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
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

  useEffect(() => {
    let cancelled = false
    fetchExperienceRevisions(item.id)
      .then((rows) => { if (!cancelled) setRevisions(rows) })
      .catch((err) => console.warn('[experience-detail] fetch revisions failed', err))
    return () => { cancelled = true }
  }, [item.id])

  const handleRollback = async (revisionId: string) => {
    setRestoringId(revisionId)
    try {
      const updated = await rollbackExperienceRevision(item.id, revisionId)
      onUpdated?.(updated)
      setRevisions(await fetchExperienceRevisions(item.id))
    } catch (err) {
      console.error('[experience-detail] rollback failed', err)
    } finally {
      setRestoringId(null)
    }
  }

  const visibleUsage = showAllUsage ? usageRecords : usageRecords.slice(0, 5)
  const visibleRevisions = showAllRevisions ? revisions : revisions.slice(0, 5)

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
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 break-words text-xl font-semibold">{item.title}</h1>
            <Badge className={cn('border text-3xs font-normal', KIND_COLOR[item.kind])}>
              {KIND_LABEL[item.kind]}
            </Badge>
            <Badge className={cn(
              'border text-3xs font-normal',
              item.active
                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-600 border-amber-500/20',
            )}>
              {item.active ? '已启用' : '草稿'}
            </Badge>
          </div>
          <p className="mt-1.5 line-clamp-2 break-words text-sm text-muted-foreground">
            {item.content.replace(/<[^>]*>/g, '').slice(0, 200)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {agentName && (
              <span className="inline-flex items-center gap-1">
                <Bot className="size-3.5" />
                {agentName}
              </span>
            )}
            <span className="inline-flex max-w-full items-center gap-1 break-words">
              <Zap className="size-3.5 shrink-0" />
              触发条件：{item.trigger}
            </span>
            {item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.tags.map((tag) => (
                  <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-3xs text-muted-foreground">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
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
            className="prose prose-sm max-w-none overflow-hidden rounded-xl border bg-card p-4 text-sm leading-relaxed break-words [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: safeContent || '<p class="text-muted-foreground">暂无内容</p>' }}
          />
        </div>

        {/* 迭代历史：每次被改写前都会留一份快照，随时可回滚 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">迭代历史</h2>
            <span className="text-xs text-muted-foreground">
              {revisions.length > 0 ? `${revisions.length} 个快照` : ''}
            </span>
          </div>
          <div className="rounded-xl border bg-card">
            {revisions.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                暂无迭代记录。经验被运行复盘修订或人工编辑后，会在这里留下可回滚的快照。
              </div>
            ) : (
              <div className="divide-y">
                {visibleRevisions.map((rev) => {
                  const meta = REVISION_META[rev.kind] ?? REVISION_META.refine
                  const RevIcon = meta.icon
                  return (
                    <div key={rev.id} className="flex min-w-0 items-start gap-3 px-4 py-3">
                      <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', meta.iconBg)}>
                        <RevIcon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium">{meta.label}</span>
                          <Badge className={cn('border text-3xs font-normal', meta.badge)}>
                            {rev.source === 'auto' ? 'Agent 自动' : '人工'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{formatDate(rev.createdAt)}</span>
                          {rev.runId && (
                            <span className="font-mono text-3xs text-muted-foreground">
                              Run {rev.runId.slice(0, 8)}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 min-w-0 truncate text-xs text-muted-foreground" title={rev.title}>
                          {rev.title}
                        </div>
                        {rev.note && (
                          <div className="mt-0.5 break-words text-xs text-muted-foreground/80">{rev.note}</div>
                        )}
                      </div>
                      {rev.kind !== 'confirm' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 gap-1 text-xs"
                          disabled={restoringId === rev.id}
                          onClick={() => void handleRollback(rev.id)}
                        >
                          <RotateCcw className="size-3" />
                          {restoringId === rev.id ? '回滚中…' : '回滚'}
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {revisions.length > 5 && (
              <div className="border-t px-4 py-2 text-center">
                <button
                  className="text-xs text-blue-500 hover:underline"
                  onClick={() => setShowAllRevisions(!showAllRevisions)}
                >
                  {showAllRevisions ? '收起' : `查看全部 (${revisions.length})`}
                </button>
              </div>
            )}
          </div>
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
                      <div className="text-xs text-muted-foreground">{formatDate(rec.createdAt)}</div>
                    </div>
                    <Badge className="border-0 bg-blue-500/10 text-3xs text-blue-600">Run {rec.runId.slice(0, 8)}</Badge>
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
              <span className="text-xs text-muted-foreground">{files.length} 个文件</span>
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
                      <div className="text-xs text-muted-foreground">
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
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium" title={value}>{value}</div>
    </div>
  )
}
