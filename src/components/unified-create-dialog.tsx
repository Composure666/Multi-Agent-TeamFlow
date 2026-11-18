'use client'

import { Bot, Users } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DIALOG_SIZE_CLASS } from '@/components/dialog-sizes'

interface UnifiedCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateAgent: () => void
  onCreateTeam: () => void
}

/**
 * 统一创建入口对话框。选择创建单个 Agent 还是团队。
 * 选择后关闭本对话框，打开对应的创建器。
 */
export function UnifiedCreateDialog({ open, onOpenChange, onCreateAgent, onCreateTeam }: UnifiedCreateDialogProps) {
  const [creating, setCreating] = useState<'agent' | 'team' | null>(null)

  useEffect(() => {
    if (!open) setCreating(null)
  }, [open])

  const handleSelect = (type: 'agent' | 'team') => {
    setCreating(type)
    onOpenChange(false)
    // 等对话框关闭后再打开对应创建器
    setTimeout(() => {
      if (type === 'agent') onCreateAgent()
      else onCreateTeam()
    }, 100)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_SIZE_CLASS.sm}>
        <DialogHeader>
          <DialogTitle>创建</DialogTitle>
          <DialogDescription>选择要创建的类型</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <button
            type="button"
            onClick={() => handleSelect('agent')}
            disabled={creating !== null}
            className="agenthub-card-interactive flex flex-col items-center gap-2 p-6 text-center disabled:opacity-50"
          >
            <Bot className="size-8 text-primary" />
            <div className="text-sm font-medium">单个 Agent</div>
            <div className="text-xs text-muted-foreground">创建一个独立的 AI 助手</div>
          </button>

          <button
            type="button"
            onClick={() => handleSelect('team')}
            disabled={creating !== null}
            className="agenthub-card-interactive flex flex-col items-center gap-2 p-6 text-center disabled:opacity-50"
          >
            <Users className="size-8 text-primary" />
            <div className="text-sm font-medium">Agent 团队</div>
            <div className="text-xs text-muted-foreground">创建多 Agent 协作团队</div>
          </button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
