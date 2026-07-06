'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

export function PromptEnhanceModal({
  visible,
  originalText,
  enhancedText,
  loading = false,
  error,
  onOpenChange,
  onKeepOriginal,
  onUseEnhanced,
}: {
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
      <DialogContent className="grid max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>增强提示词</DialogTitle>
          <DialogDescription>对比原始输入与增强后的提示词，选择是否替换当前输入。</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 overflow-y-auto md:grid-cols-2">
          <div className="min-h-0 space-y-2">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">原始提示词</div>
            <Textarea value={originalText} readOnly className="min-h-[260px] resize-none bg-slate-50 text-sm dark:bg-neutral-900" />
          </div>
          <div className="min-h-0 space-y-2">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">增强提示词</div>
            <Textarea
              value={loading ? '正在增强提示词…' : enhancedText}
              readOnly
              className="min-h-[260px] resize-none bg-slate-50 text-sm dark:bg-neutral-900"
            />
          </div>
          {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 md:col-span-2">{error}</div>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onKeepOriginal} disabled={loading}>
            保留原始版本
          </Button>
          <Button type="button" onClick={onUseEnhanced} disabled={loading || !enhancedText.trim()}>
            使用增强版本
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
