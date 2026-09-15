'use client'

import {
  ArrowLeft,
  Check,
  Loader2,
  MessageSquareText,
  Pencil,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'

import { AgentDraftPreview } from '@/components/agent-draft-preview'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createAgentDraft } from '@/lib/api'
import type { AgentConfigDraft } from '@/shared/agent-builder-config'

interface AgentCreateWizardProps {
  onBack: () => void
  onCancel: () => void
  onEditDetails: (draft: AgentConfigDraft) => void
  onCreate: (draft: AgentConfigDraft) => Promise<void>
  creating: boolean
}

export function AgentCreateWizard({
  onBack,
  onCancel,
  onEditDetails,
  onCreate,
  creating,
}: AgentCreateWizardProps) {
  const [intent, setIntent] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [draft, setDraft] = useState<AgentConfigDraft | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateDraft = async () => {
    const trimmedIntent = intent.trim()
    if (trimmedIntent.length < 6) {
      setError('请稍微多描述一点你想创建的 Agent。')
      return
    }

    setGenerating(true)
    setError(null)
    try {
      const next = await createAgentDraft({
        intent: trimmedIntent,
        followUp: followUp.trim() || undefined,
      })
      setDraft(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
    }
  }

  const createFromDraft = async () => {
    if (!draft) return
    setError(null)
    try {
      await onCreate(draft)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (draft) {
    return (
      <div className="flex min-h-0 flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <AgentDraftPreview draft={draft} />
      </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="size-4" />
            返回
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => void generateDraft()} disabled={generating || creating}>
              {generating ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              重新生成
            </Button>
            <Button variant="outline" onClick={() => onEditDetails(draft)} disabled={creating}>
              <Pencil className="size-4" />
              编辑详细配置
            </Button>
            <Button onClick={() => void createFromDraft()} disabled={creating || generating}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              创建
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        <div className="rounded-md border bg-muted/20 px-3 py-3">
          <div className="flex items-start gap-2">
            <MessageSquareText className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="text-sm font-medium">描述你想要的 Agent</div>
              <div className="mt-1 text-xs text-muted-foreground">
                说明它负责什么、常见输入是什么、希望它交付什么结果。系统会生成一份可确认的配置草稿。
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Textarea
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="例：我想要一个能帮我审查本地代码、运行测试并指出风险的 Agent"
            className="min-h-[140px] text-sm"
          />
          <Textarea
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            placeholder="可选：补充模型偏好、权限边界、输出风格或不希望它做的事"
            className="min-h-[80px] text-sm"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" />
          返回
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={() => void generateDraft()} disabled={generating}>
            {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            生成草稿
          </Button>
        </div>
      </div>
    </div>
  )
}
