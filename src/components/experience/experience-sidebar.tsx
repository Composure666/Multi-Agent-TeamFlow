'use client'

import { useState } from 'react'
import { Lightbulb, TrendingUp, Clock, ArrowRight, Sparkles, Zap, CircleCheck, ShieldCheck } from 'lucide-react'
import type { ExperienceRow } from '@/db/schema'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { DIALOG_SIZE_CLASS } from '@/components/dialog-sizes'

interface ExperienceSidebarProps {
  items: ExperienceRow[]
  onOpen: (id: string) => void
  /**
   * D2：Dialog 内渲染时调用方经 className 透传覆盖（`w-full border-l-0 …`），
   * tailwind-merge 会让后传入的 width / border 覆盖这里的 `w-64` / `border-l`。
   * 内联侧栏调用方不传，保持默认形态不变。
   */
  className?: string
}

const KIND_LABEL: Record<string, string> = {
  experience: '经验',
  reflection: '反思',
  profile_fact: '画像',
}

const KIND_COLOR: Record<string, string> = {
  experience: 'bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]',
  reflection: 'bg-purple-500/10 text-purple-600',
  profile_fact: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

export function ExperienceSidebar({ items, onOpen, className }: ExperienceSidebarProps) {
  const [showAllHot, setShowAllHot] = useState(false)
  const [showAllRecent, setShowAllRecent] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)

  const hotSorted = [...items].sort((a, b) => b.usageCount - a.usageCount)
  const hot = hotSorted.slice(0, showAllHot ? hotSorted.length : 5)
  const recentSorted = [...items]
    .filter((i) => i.lastUsedAt)
    .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
  const recent = recentSorted.slice(0, showAllRecent ? recentSorted.length : 4)

  return (
    <aside className={cn('flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-l border-[var(--agenthub-border)] bg-muted/20 px-4 py-4', className)}>
      {/* 快速使用指南 */}
      <div className="agenthub-card p-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--agenthub-accent-soft)]">
            <Lightbulb className="size-4 text-[var(--agenthub-accent)]" />
          </div>
          <h3 className="text-sm font-medium">快速使用指南</h3>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          了解如何在合适的时机注入经验资产，提升 Agent 表现。
        </p>
        <Button variant="outline" size="sm" className="mt-3 w-full text-xs" onClick={() => setGuideOpen(true)}>
          查看文档 <ArrowRight className="ml-1 size-3" />
        </Button>
      </div>

      {/* 热门经验 */}
      {hot.length > 0 && (
        <div className="agenthub-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-amber-500" />
              <h3 className="text-sm font-medium">热门经验</h3>
            </div>
            <button
              className="text-xs text-[var(--agenthub-accent)] hover:underline"
              onClick={() => setShowAllHot((v) => !v)}
            >
              {showAllHot ? '收起' : `查看更多 (${hotSorted.length})`}
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {hot.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => onOpen(item.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/50"
              >
                <span className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded text-xs font-semibold',
                  idx === 0 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : idx === 1 ? 'bg-slate-400/15 text-slate-500'
                  : idx === 2 ? 'bg-orange-500/15 text-orange-600'
                  : 'bg-muted text-muted-foreground',
                )}>
                  {idx + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs">{item.title}</span>
                <Badge className={cn('shrink-0 border-0 text-xs', KIND_COLOR[item.kind])}>
                  {KIND_LABEL[item.kind]}
                </Badge>
                <span className="shrink-0 text-xs text-muted-foreground">{item.usageCount} 次</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 最近使用 */}
      {recent.length > 0 && (
        <div className="agenthub-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-[var(--agenthub-accent)]" />
              <h3 className="text-sm font-medium">最近使用</h3>
            </div>
            <button
              className="text-xs text-[var(--agenthub-accent)] hover:underline"
              onClick={() => setShowAllRecent((v) => !v)}
            >
              {showAllRecent ? '收起' : `查看更多 (${recentSorted.length})`}
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {recent.map((item) => (
              <button
                key={item.id}
                onClick={() => onOpen(item.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/50"
              >
                <Badge className={cn('shrink-0 border-0 text-xs', KIND_COLOR[item.kind])}>
                  {KIND_LABEL[item.kind]}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-xs">{item.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item.lastUsedAt ? formatRelative(item.lastUsedAt) : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 底部推广 */}
      <div className="mt-auto rounded-xl bg-[var(--agenthub-accent-soft)] p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[var(--agenthub-accent)]" />
          <h3 className="text-sm font-medium">让经验沉淀，发挥更大价值</h3>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">经验资产，让 AI 不断成长</p>
        <div className="mt-3 flex justify-end">
          <div className="flex size-8 items-center justify-center rounded-full bg-[var(--agenthub-accent)] text-[var(--primary-foreground)]">
            <ArrowRight className="size-4" />
          </div>
        </div>
      </div>

      {/* 使用指南 */}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className={cn(DIALOG_SIZE_CLASS.sm)}>
          <DialogHeader>
            <DialogTitle>经验资产使用指南</DialogTitle>
            <DialogDescription>经验是 Agent 运行后沉淀的可复用知识，按触发条件注入后续任务。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <div className="flex gap-2.5">
              <Zap className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <div>
                <div className="font-medium text-foreground">自动沉淀</div>
                <div>Run 完成后自动反思：调用过 3+ 个工具、产出过产物，或是有子任务的聚合 Run 才会沉淀；可在设置 → 通知 → 经验资产中关闭。</div>
              </div>
            </div>
            <div className="flex gap-2.5">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-[var(--agenthub-accent)]" />
              <div>
                <div className="font-medium text-foreground">按需注入</div>
                <div>后续任务根据关键词命中「触发条件」注入系统提示（最多 6 条、预算 1500 token）；未命中时不注入。</div>
              </div>
            </div>
            <div className="flex gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              <div>
                <div className="font-medium text-foreground">随时管理</div>
                <div>经验可编辑、停用（不再注入）或删除；附件的参考文件随经验保留。停用的经验会进入「草稿」状态。</div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
