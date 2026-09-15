'use client'

import { MoreHorizontal, Flame, FileText, Bot, Repeat2 } from 'lucide-react'
import type { ExperienceKind, ExperienceRow } from '@/db/schema'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const KIND_META: Record<ExperienceKind, { label: string; icon: typeof FileText; badge: string; iconBg: string }> = {
  experience: {
    label: '经验',
    icon: FileText,
    badge: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    iconBg: 'bg-blue-500/10 text-blue-500',
  },
  reflection: {
    label: '反思',
    icon: Flame,
    badge: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
    iconBg: 'bg-purple-500/10 text-purple-500',
  },
  profile_fact: {
    label: '画像',
    icon: Bot,
    badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    iconBg: 'bg-emerald-500/10 text-emerald-500',
  },
}

interface ExperienceCardProps {
  item: ExperienceRow
  agentName?: string
  /** 累计被迭代修订的次数（Agent 自动复盘 + 人工编辑），0 表示从未被改过 */
  revisionCount?: number
  onOpen: (id: string) => void
  onEdit: (item: ExperienceRow) => void
  onToggleActive: (item: ExperienceRow) => void
  onDelete: (id: string) => void
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function ExperienceCard({
  item,
  agentName,
  revisionCount = 0,
  onOpen,
  onEdit,
  onToggleActive,
  onDelete,
}: ExperienceCardProps) {
  const meta = KIND_META[item.kind]
  const Icon = meta.icon

  return (
    <div
      className="group flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm transition-all hover:border-blue-400/40 hover:shadow-md"
      onClick={() => onOpen(item.id)}
    >
      <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', meta.iconBg)}>
        <Icon className="size-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="min-w-0 truncate text-sm font-medium">{item.title}</h3>
          <Badge className={cn('shrink-0 border text-[10px] font-normal', meta.badge)}>
            {meta.label}
          </Badge>
        </div>
        {/* 描述与触发条件都必须「收口」：超长内容省略，绝不允许把卡片撑宽（页面横向溢出） */}
        <p className="mt-0.5 line-clamp-2 min-w-0 text-xs break-words text-muted-foreground">
          {item.content.replace(/<[^>]*>/g, '')}
        </p>
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {agentName && (
            <span className="inline-flex max-w-full min-w-0 items-center gap-1">
              <Bot className="size-3 shrink-0" />
              <span className="min-w-0 truncate">{agentName}</span>
            </span>
          )}
          <span className="min-w-0 max-w-full truncate">触发条件：{item.trigger}</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-[11px] text-muted-foreground">使用 {item.usageCount} 次</span>
          {revisionCount > 0 && (
            <Badge
              className="hidden shrink-0 whitespace-nowrap border-amber-500/20 bg-amber-500/10 text-[10px] font-normal text-amber-600 sm:inline-flex"
              title={`已被迭代修订 ${revisionCount} 次（Agent 运行后自动复盘或人工编辑）`}
            >
              <Repeat2 className="size-3" />
              迭代 {revisionCount}
            </Badge>
          )}
          <Badge className={cn(
            'border text-[10px] font-normal',
            item.active
              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-600 border-amber-500/20',
          )}>
            {item.active ? '已启用' : '草稿'}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={() => onOpen(item.id)}>查看详情</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(item)}>编辑</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleActive(item)}>
                {item.active ? '停用' : '启用'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-500" onClick={() => onDelete(item.id)}>
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <span className="text-[10px] text-muted-foreground/70">{formatDate(item.updatedAt)}</span>
      </div>
    </div>
  )
}
