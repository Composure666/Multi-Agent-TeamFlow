'use client'

import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DIALOG_SIZE_CLASS } from '@/components/dialog-sizes'
import { InlineError } from '@/components/workbench-primitives'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Markdown } from '@/components/markdown'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'

export function PromptEnhanceModal({
  title = 'AI 优化提示词',
  description = '对比原始输入与优化后的提示词，选择是否替换当前输入。',
  originalLabel = '原始提示词',
  enhancedLabel = '优化后的提示词',
  loadingText = '正在优化提示词…',
  keepOriginalText = '使用原始版本',
  useEnhancedText = '使用优化版本',
  visible,
  originalText,
  enhancedText,
  loading = false,
  error,
  onOpenChange,
  onKeepOriginal,
  onUseEnhanced,
}: {
  title?: string
  description?: string
  originalLabel?: string
  enhancedLabel?: string
  loadingText?: string
  keepOriginalText?: string
  useEnhancedText?: string
  visible: boolean
  originalText: string
  enhancedText: string
  loading?: boolean
  error?: string | null
  onOpenChange: (open: boolean) => void
  onKeepOriginal: () => void
  onUseEnhanced: () => void
}) {
  return (
    <Dialog open={visible} onOpenChange={onOpenChange}>
      <DialogContent className={cn("grid max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden", DIALOG_SIZE_CLASS.lg)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 overflow-y-auto md:grid-cols-2">
          <div className="min-h-0 space-y-2">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">{originalLabel}</div>
            <Textarea value={originalText} readOnly className="min-h-[260px] resize-none bg-[var(--agenthub-surface-muted)] text-sm" />
          </div>
          <div className="min-h-0 space-y-2">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">{enhancedLabel}</div>
            <div className="min-h-[260px] overflow-y-auto rounded-md border border-input bg-[var(--agenthub-surface-muted)] px-3 py-2 text-sm">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner size="sm" className="size-4" />
                  {loadingText}
                </div>
              ) : enhancedText.trim() ? (
                <Markdown className="text-sm leading-6">{enhancedText}</Markdown>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Sparkles className="size-4 shrink-0" />
                  等待优化结果
                </div>
              )}
            </div>
          </div>
          {error && <div className="md:col-span-2"><InlineError message={error} /></div>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onKeepOriginal} disabled={loading}>
            {keepOriginalText}
          </Button>
          <Button type="button" onClick={onUseEnhanced} disabled={loading || !enhancedText.trim()}>
            {useEnhancedText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
