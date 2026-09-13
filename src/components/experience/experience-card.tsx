'use client'

import { MoreHorizontal, Flame, FileText, Bot } from 'lucide-react'
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
  onOpen,
  onEdit,
  onToggleActive,
  onDelete,
}: ExperienceCardProps) {
  const meta = KIND_META[item.kind]
  const Icon = meta.icon

  return (
    <div
      className="group flex cursor-pointer items-start gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm transition-all hover:border-blue-400/40 hover:shadow-md"
      onClick={() => onOpen(item.id)}
    >
      <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', meta.iconBg)}>
        <Icon className="size-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-medium">{item.title}</h3>
          <Badge className={cn('shrink-0 border text-[10px] font-normal', meta.badge)}>
            {meta.label}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.content.replace(/<[^>]*>/g, '')}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {agentName && (
            <span className="inline-flex items-center gap-1">
              <Bot className="size-3" />
              {agentName}
            </span>
          )}
          <span>触发条件：{item.trigger}</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">使用 {item.usageCount} 次</span>
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
