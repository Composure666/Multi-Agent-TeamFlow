'use client'

import { MessageSquareText, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  AgentConfigForm,
  agentDraftToCreateBody,
  agentFormValueFromDraft,
  agentFormValueFromRow,
  createEmptyAgentFormValue,
  parseCapabilitiesText,
  validateAgentFormValue,
  type AgentFormValue,
  type AgentTab,
} from '@/components/agent-config-form'
import { AgentCreateWizard } from '@/components/agent-create-wizard'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { AgentRow } from '@/db/schema'
import {
  createAgent,
  updateAgent,
  type CreateAgentBody,
  type UpdateAgentBody,
} from '@/lib/api'
import type { AgentConfigDraft } from '@/shared/agent-builder-config'
import { useAppStore } from '@/stores/app-store'

type CreateStep = 'choose' | 'wizard' | 'detail'

/**
 * 创建 / 编辑 Agent 的对话框。
 *
 * 传入 `agent` 进入编辑模式，未传则为创建模式。两种模式公用同一套字段、
 * 同一套校验，只是 submit 路径与文案不同。
 *
 * 详细配置界面由 `AgentConfigForm` 提供 —— 团队成员的详情配置复用的也是它。
 */
export function CreateAgentDialog({
  open,
  onOpenChange,
  agent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent?: AgentRow
}) {
  const upsertAgent = useAppStore((s) => s.upsertAgent)
  const isEdit = !!agent

  const [form, setForm] = useState<AgentFormValue>(() => createEmptyAgentFormValue())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<AgentTab>('basic')
  const [createStep, setCreateStep] = useState<CreateStep>('choose')

  // 每次打开 / 切换 agent 时，重置表单到该 agent 的当前值（或创建态的默认）。
  useEffect(() => {
    if (!open) return
    if (agent) {
      setForm(agentFormValueFromRow(agent))
      setCreateStep('detail')
    } else {
      setForm(createEmptyAgentFormValue())
      setCreateStep('choose')
    }
    setError(null)
    setActiveTab('basic')
  }, [open, agent])

  const updateForm = (patch: Partial<AgentFormValue>) => {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  const editDraftDetails = (draft: AgentConfigDraft) => {
    setForm(agentFormValueFromDraft(draft))
    setError(null)
    setActiveTab('basic')
    setCreateStep('detail')
  }

  const createFromDraft = async (draft: AgentConfigDraft) => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await createAgent(agentDraftToCreateBody(draft))
      upsertAgent(created)
      onOpenChange(false)
    } catch (err) {
      const nextError = err instanceof Error ? err : new Error(String(err))
      setError(nextError.message)
      throw nextError
    } finally {
      setSubmitting(false)
    }
  }

  const submit = async () => {
    if (submitting) return
    setError(null)

    const issue = validateAgentFormValue(form)
    if (issue) {
      setActiveTab(issue.tab)
      setError(issue.message)
      return
    }

    const capabilities = parseCapabilitiesText(form.capabilitiesText)
    const trimmedApiBaseUrl = form.apiBaseUrl.trim()
    const trimmedApiKey = form.apiKey.trim()
    const isSdkAgent = form.adapterName === 'claude-code' || form.adapterName === 'codex'
    // Custom adapter 不支持外部 MCP，切换过来时残留的勾选要丢掉
    const selectedMcpServerIds = isSdkAgent ? [...form.mcpServerIds] : []
    const selectedSkillIds = [...form.skillIds]

    setSubmitting(true)
    try {
      if (isEdit && agent) {
        const patch: UpdateAgentBody = {
          name: form.name.trim(),
          description: form.description.trim(),
          capabilities,
          systemPrompt: form.systemPrompt.trim(),
          adapterName: form.adapterName,
          modelProvider: isSdkAgent ? undefined : form.modelProvider,
          modelId: isSdkAgent ? form.modelId.trim() || null : form.modelId.trim(),
          toolNames: isSdkAgent ? [] : [...form.toolNames],
          mcpServerIds: selectedMcpServerIds,
          skillIds: selectedSkillIds,
          supportsVision: form.supportsVision,
          modality: form.modality,
          apiKey: trimmedApiKey || null,
          apiBaseUrl: trimmedApiBaseUrl || null,
        }
        const updated = await updateAgent(agent.id, patch)
        upsertAgent(updated)
      } else {
        const body: CreateAgentBody = {
          name: form.name.trim(),
          avatar: '',
          description: form.description.trim(),
          capabilities,
          systemPrompt: form.systemPrompt.trim(),
          adapterName: form.adapterName,
          modelProvider: isSdkAgent ? undefined : form.modelProvider,
          modelId: form.modelId.trim() || undefined,
          toolNames: isSdkAgent ? [] : [...form.toolNames],
          mcpServerIds: selectedMcpServerIds,
          skillIds: selectedSkillIds,
          supportsVision: form.supportsVision,
          modality: form.modality,
          apiKey: trimmedApiKey || undefined,
          apiBaseUrl: trimmedApiBaseUrl || undefined,
        }
        const created = await createAgent(body)
        upsertAgent(created)
      }
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const showDetailForm = isEdit || createStep === 'detail'
  const descriptionText = isEdit
    ? '修改这个 Agent 的配置。保存后立即生效，已存在的会话也会用新配置回复。'
    : createStep === 'choose'
      ? '选择创建方式。可以先用描述生成草稿，也可以直接进入完整配置。'
      : createStep === 'wizard'
        ? '通过描述生成一份可确认的 Agent 配置草稿。'
        : '为这个 Agent 设定身份与能力。它会出现在新建对话的选择列表里。'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑 Agent' : '创建 Agent'}</DialogTitle>
          <DialogDescription>{descriptionText}</DialogDescription>
        </DialogHeader>

        {!showDetailForm ? (
          createStep === 'choose' ? (
            <CreateModeChoice
              onConversational={() => setCreateStep('wizard')}
              onDetailed={() => setCreateStep('detail')}
              onCancel={() => onOpenChange(false)}
            />
          ) : (
            <AgentCreateWizard
              onBack={() => {
                setError(null)
                setCreateStep('choose')
              }}
              onCancel={() => onOpenChange(false)}
              onEditDetails={editDraftDetails}
              onCreate={createFromDraft}
              creating={submitting}
            />
          )
        ) : (
          <AgentConfigForm
            value={form}
            onChange={updateForm}
            activeTab={activeTab}
            onActiveTabChange={setActiveTab}
            error={error}
          />
        )}

        {showDetailForm && (
          <DialogFooter>
            {!isEdit && (
              <Button
                variant="outline"
                onClick={() => {
                  setError(null)
                  setCreateStep('choose')
                }}
              >
                返回
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting ? (isEdit ? '保存中...' : '创建中...') : isEdit ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CreateModeChoice({
  onConversational,
  onDetailed,
  onCancel,
}: {
  onConversational: () => void
  onDetailed: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="grid gap-2">
        <button
          type="button"
          onClick={onConversational}
          className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 text-left transition hover:border-primary hover:bg-primary/5"
        >
          <div className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <MessageSquareText className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              对话创建
              <Sparkles className="size-3.5 text-primary" />
            </div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              描述想要的角色、任务和交付物，先生成可审阅的配置草稿。
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={onDetailed}
          className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 text-left transition hover:border-foreground/30"
        >
          <div className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <SlidersHorizontal className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium">详细配置</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              直接编辑名称、模型、API Key、工具权限和 System Prompt。
            </div>
          </div>
        </button>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  )
}
