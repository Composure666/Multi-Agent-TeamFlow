'use client'

import { ArrowLeft, MessageSquare, Pencil, Plus, RefreshCw, Save, Sparkles, Users, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  AgentConfigForm,
  DEFAULT_CUSTOM_SYSTEM_PROMPT,
  agentDraftToCreateBody,
  agentFormValueFromDraft,
  agentFormValueToDraft,
  createEmptyAgentFormValue,
  validateAgentFormValue,
  type AgentFormValue,
  type AgentTab,
} from '@/components/agent-config-form'
import { AgentAvatar } from '@/components/agent-avatar'
import { AgentDraftPreview } from '@/components/agent-draft-preview'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Textarea } from '@/components/ui/textarea'
import type { AgentRow } from '@/db/schema'
import { createAgent, createAgentDraft } from '@/lib/api'
import { normalizeModality } from '@/lib/llm-shared'
import type { AgentConfigDraft, AgentDraftSource } from '@/shared/agent-builder-config'
import { useAppStore } from '@/stores/app-store'
import type { TeamDraft, TeamMemberDraft } from '@/server/team-draft-service'

interface CreateTeamDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (teamId: string) => void
  onStartChat?: (teamId: string) => void
}

/** 成员头像候选：团队生成时会先给建议，用户也能在这里改。 */
const AVATAR_CHOICES = [
  '🧭', '📋', '🔍', '🧪', '🎨', '🚀', '🧩', '📊',
  '✍️', '🧑‍💻', '👁️', '🛠️', '📈', '🧠',
]

type Mode = 'auto' | 'manual'
type Step = 'input' | 'preview' | 'creating'

/** 团队成员 + 用户确认/编辑后的完整 Agent 配置。 */
type TeamMemberPlan = TeamMemberDraft & { config?: AgentConfigDraft }
type TeamPlan = Omit<TeamDraft, 'members'> & { members: TeamMemberPlan[] }

/**
 * 创建团队对话框。
 * - 自动模式：输入团队目标，生成团队结构，每个成员的详情配置复用单 Agent 的
 *   详细配置界面（AgentDraftPreview + AgentConfigForm），确认后逐个创建 Agent 并组建团队
 * - 手动模式：填写团队信息，从现有 Agent 中选择成员
 */
export function CreateTeamDialog({ open, onOpenChange, onCreated, onStartChat }: CreateTeamDialogProps) {
  const [mode, setMode] = useState<Mode>('auto')
  const [step, setStep] = useState<Step>('input')
  const [goal, setGoal] = useState('')
  const [plan, setPlan] = useState<TeamPlan | null>(null)
  const [generating, setGenerating] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createProgress, setCreateProgress] = useState({ current: 0, total: 0, label: '' })
  const [error, setError] = useState<string | null>(null)
  const [createdTeamId, setCreatedTeamId] = useState<string | null>(null)
  const [configMemberIndex, setConfigMemberIndex] = useState<number | null>(null)
  const [hydratingConfigs, setHydratingConfigs] = useState(false)

  // 手动模式
  const [manualName, setManualName] = useState('')
  const [manualDescription, setManualDescription] = useState('')
  const [manualGoal, setManualGoal] = useState('')
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [allAgents, setAllAgents] = useState<AgentRow[]>([])
  const [manualCreateOpen, setManualCreateOpen] = useState(false)
  const upsertAgent = useAppStore((s) => s.upsertAgent)

  useEffect(() => {
    if (open) {
      fetch('/api/agents')
        .then((r) => r.json())
        .then((d) => setAllAgents(d.agents ?? []))
        .catch(() => {})
    }
  }, [open])

  const reset = () => {
    setMode('auto')
    setStep('input')
    setGoal('')
    setPlan(null)
    setError(null)
    setManualName('')
    setManualDescription('')
    setManualGoal('')
    setSelectedAgents([])
    setManualCreateOpen(false)
    setCreatedTeamId(null)
    setConfigMemberIndex(null)
    setHydratingConfigs(false)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) reset()
    onOpenChange(open)
  }

  const updateMember = (index: number, patch: Partial<TeamMemberPlan>) => {
    setPlan((prev) => {
      if (!prev) return prev
      return { ...prev, members: prev.members.map((m, i) => (i === index ? { ...m, ...patch } : m)) }
    })
  }

  /** 生成团队结构后，后台并行预取每个成员的 Agent 配置，点开即见（无需等待）。 */
  const hydrateMemberConfigs = async (target: TeamPlan) => {
    setHydratingConfigs(true)
    try {
      const configs = await Promise.all(
        target.members.map(async (m) => {
          try {
            const { draft } = await createAgentDraft({
              intent: memberIntent(target.name, m),
              followUp: m.systemPrompt || undefined,
            })
            return applyMemberIdentity(draft, m)
          } catch (err) {
            console.warn('[CreateTeamDialog] preload member config failed', err)
            return null
          }
        }),
      )
      setPlan((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          // 用户已经确认过的配置不被覆盖
          members: prev.members.map((m, i) => (m.config || !configs[i] ? m : { ...m, config: configs[i] ?? undefined })),
        }
      })
    } finally {
      setHydratingConfigs(false)
    }
  }

  const handleGenerate = async () => {
    if (!goal.trim()) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/teams/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
      })
      const data = await res.json()
      if (data.draft) {
        const next = data.draft as TeamPlan
        setPlan(next)
        setStep('preview')
        void hydrateMemberConfigs(next)
      } else {
        setError(data.error ?? '生成失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
    }
  }

  /**
   * 重新生成某个成员的配置。
   *
   * 必须带 `regenerate` 与上一版草稿：`/api/agents/draft` 的启发式实现是确定性函数，
   * 同样的 intent 必然产出逐字节相同的配置 —— 这正是「点了按钮毫无变化」的根因。
   * 服务端收到 regenerate 后会走模型通道，并回传真实来源，由弹窗如实提示用户。
   * 失败时抛给调用方（弹窗）就地显示，而不是写进被遮挡的外层 error。
   */
  const regenerateMemberConfig = async (index: number): Promise<AgentDraftSource> => {
    if (!plan) throw new Error('团队草稿已失效，请关闭后重新生成团队结构')
    const member = plan.members[index]
    const res = await createAgentDraft({
      intent: memberIntent(plan.name, member),
      followUp: member.systemPrompt || undefined,
      regenerate: true,
      previous: member.config
        ? {
            name: member.config.name,
            description: member.config.description,
            systemPrompt: member.config.systemPrompt,
          }
        : undefined,
    })
    updateMember(index, { config: applyMemberIdentity(res.draft, member) })
    return res.source
  }

  const handleCreateAuto = async () => {
    if (!plan) return
    setCreating(true)
    setStep('creating')
    setError(null)
    setCreateProgress({ current: 0, total: plan.members.length, label: '准备创建…' })

    try {
      const memberAgentIds: string[] = []
      for (let i = 0; i < plan.members.length; i++) {
        const m = plan.members[i]
        setCreateProgress({ current: i + 1, total: plan.members.length, label: `创建 ${m.name}…` })
        const resolved = await resolveMemberConfig(plan.name, m)
        // 头像以团队里确认的为准：config 可能早于用户最后一次改头像生成
        const config = { ...resolved, avatar: m.avatar || resolved.avatar }
        const created = await createAgent(agentDraftToCreateBody(config))
        memberAgentIds.push(created.id)
        upsertAgent(created)
      }

      // 创建团队
      setCreateProgress({ current: plan.members.length, total: plan.members.length, label: '组建团队…' })
      const teamRes = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: plan.name,
          description: plan.description,
          goal: plan.goal,
          members: plan.members.map((m, i) => ({
            agentId: memberAgentIds[i],
            role: m.role,
            isLead: m.isLead,
            sortOrder: i,
          })),
        }),
      })
      const teamData = await teamRes.json()
      if (teamData.team) {
        onCreated?.(teamData.team.id)
        setCreatedTeamId(teamData.team.id)
        setStep('input')
      } else {
        setError(teamData.error ?? '团队创建失败')
        setStep('preview')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStep('preview')
    } finally {
      setCreating(false)
    }
  }

  const handleCreateManual = async () => {
    if (!manualName.trim() || selectedAgents.length === 0) return
    setCreating(true)
    setStep('creating')
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: manualName,
          description: manualDescription,
          goal: manualGoal,
          members: selectedAgents.map((agentId, i) => ({ agentId, sortOrder: i })),
        }),
      })
      const data = await res.json()
      if (data.team) {
        onCreated?.(data.team.id)
        setCreatedTeamId(data.team.id)
      } else {
        setError(data.error ?? '创建失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  const toggleAgent = (id: string) => {
    setSelectedAgents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  /** 手动模式下新建的成员：落到本地列表并自动勾选进团队。 */
  const handleManualMemberCreated = (agent: AgentRow) => {
    setAllAgents((prev) => (prev.some((a) => a.id === agent.id) ? prev : [...prev, agent]))
    setSelectedAgents((prev) => (prev.includes(agent.id) ? prev : [...prev, agent.id]))
    setManualCreateOpen(false)
  }

  const configuredCount = plan ? plan.members.filter((m) => m.config).length : 0

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] sm:max-w-4xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-4" />
              创建 Agent 团队
            </DialogTitle>
            <DialogDescription>
              自动生成团队结构，或手动选择现有 Agent 组建团队
            </DialogDescription>
          </DialogHeader>

          {/* 模式切换 */}
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant={mode === 'auto' ? 'default' : 'outline'}
              onClick={() => { setMode('auto'); setStep('input') }}
            >
              <Wand2 className="size-3.5" />
              提示词自动生成
            </Button>
            <Button
              size="sm"
              variant={mode === 'manual' ? 'default' : 'outline'}
              onClick={() => { setMode('manual'); setStep('input') }}
            >
              <Plus className="size-3.5" />
              手动详细创建
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {error && (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                {error}
              </div>
            )}

            {/* 自动模式 - 输入 */}
            {mode === 'auto' && step === 'input' && !generating && !createdTeamId && (
              <div className="flex flex-col gap-3.5">
                <div className="grid gap-2">
                  <label className="text-xs font-medium">团队目标</label>
                  <Textarea
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="描述你想要这个团队完成什么，例如：做一个产品落地页、写一篇深度调研报告、制作一个产品宣传视频…"
                    rows={4}
                    className="resize-none"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {['做一个产品落地页', '写一篇行业调研报告', '制作产品宣传视频', '策划一场营销活动'].map((s) => (
                    <button
                      key={s}
                      className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
                      onClick={() => setGoal(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 自动模式 - 生成中 */}
            {mode === 'auto' && step === 'input' && generating && (
              <LoadingIndicator
                variant="both"
                size="lg"
                label="AI 正在设计团队结构…"
                hint="分析目标、匹配角色、生成提示词"
                className="py-16"
              />
            )}

            {/* 自动模式 - 预览 */}
            {mode === 'auto' && step === 'preview' && plan && (
              <div className="flex flex-col gap-3.5">
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="text-sm font-medium">{plan.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{plan.description}</div>
                  <div className="mt-1.5 text-xs text-muted-foreground">目标：{plan.goal}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium">团队成员（{plan.members.length} 人）</div>
                  <div className="text-[11px] text-muted-foreground">
                    {hydratingConfigs
                      ? '正在生成成员配置…'
                      : `${configuredCount}/${plan.members.length} 份配置已就绪`}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {plan.members.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-md border bg-card px-3 py-2.5">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-base">
                        {m.avatar || m.name[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-medium">{m.name}</span>
                          {m.isLead && (
                            <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                              负责人
                            </span>
                          )}
                          <span className="shrink-0 rounded bg-blue-100 px-1 py-0.5 text-[10px] text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                            {m.modality}
                          </span>
                          {m.config && (
                            <span className="shrink-0 rounded bg-emerald-100 px-1 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                              已配置
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{m.role}</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setConfigMemberIndex(i)}>
                        <Pencil className="size-3" />
                        详情配置
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  {plan.rationale.map((r, i) => (
                    <div key={i}>· {r}</div>
                  ))}
                </div>
              </div>
            )}

            {/* 自动模式 - 创建中 */}
            {mode === 'auto' && step === 'creating' && (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <LoadingIndicator variant="spinner" size="lg" />
                <div className="text-sm font-medium">{createProgress.label}</div>
                <div className="text-xs text-muted-foreground">
                  {createProgress.current} / {createProgress.total}
                </div>
                <div className="h-1.5 w-48 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-500 ease-out"
                    style={{ width: `${createProgress.total ? (createProgress.current / createProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* 手动模式 */}
            {mode === 'manual' && (
              <div className="flex flex-col gap-3.5">
                <div className="grid gap-2">
                  <label className="text-xs font-medium">团队名称 *</label>
                  <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="例如：产品增长团队" />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs font-medium">团队描述</label>
                  <Input value={manualDescription} onChange={(e) => setManualDescription(e.target.value)} placeholder="一句话描述团队职责" />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs font-medium">团队目标</label>
                  <Textarea value={manualGoal} onChange={(e) => setManualGoal(e.target.value)} rows={2} className="resize-none" placeholder="团队的核心目标和使命" />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium">选择成员（{selectedAgents.length} 人）*</label>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setManualCreateOpen(true)}>
                      <Plus className="size-3" />
                      新建成员
                    </Button>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-md border">
                    {allAgents.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-muted-foreground">暂无 Agent，请先创建 Agent</div>
                    ) : (
                      allAgents.map((a) => (
                        <button
                          key={a.id}
                          className={`flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition last:border-b-0 hover:bg-muted/50 ${selectedAgents.includes(a.id) ? 'bg-primary/5' : ''}`}
                          onClick={() => toggleAgent(a.id)}
                        >
                          <input type="checkbox" checked={selectedAgents.includes(a.id)} readOnly className="size-3.5" />
                          <AgentAvatar agent={a} size="sm" />
                          <span className="truncate text-xs">{a.name}</span>
                          <span className="ml-auto text-[11px] text-muted-foreground">{a.modality}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 创建成功 */}
          {createdTeamId && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100">
                <svg className="size-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-center">
                <div className="text-base font-medium">团队创建成功</div>
                <div className="mt-1 text-xs text-muted-foreground">可以立即开始对话，或稍后在 Agent 库中找到它</div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleOpenChange(false)}>完成</Button>
                <Button onClick={() => { onStartChat?.(createdTeamId); handleOpenChange(false) }}>
                  <MessageSquare className="size-3.5" />
                  开始对话
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            {!createdTeamId && (
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={creating}>
                取消
              </Button>
            )}
            {mode === 'auto' && step === 'input' && !createdTeamId && (
              <Button onClick={() => void handleGenerate()} disabled={!goal.trim() || generating}>
                {generating ? <LoadingIndicator variant="spinner" size="sm" inheritColor /> : <Sparkles className="size-3.5" />}
                生成团队结构
              </Button>
            )}
            {mode === 'auto' && step === 'preview' && !createdTeamId && (
              <>
                <Button variant="outline" onClick={() => setStep('input')} disabled={creating}>
                  返回修改
                </Button>
                <Button onClick={() => void handleCreateAuto()} disabled={creating}>
                  <Plus className="size-3.5" />
                  确认创建团队
                </Button>
              </>
            )}
            {mode === 'manual' && !createdTeamId && (
              <Button
                onClick={() => void handleCreateManual()}
                disabled={!manualName.trim() || selectedAgents.length === 0 || creating}
              >
                {creating ? <LoadingIndicator variant="spinner" size="sm" inheritColor /> : <Plus className="size-3.5" />}
                创建团队
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 手动模式：新建成员同样走单 Agent 的「描述生成 → 草稿确认 → 详细配置」链路 */}
      {manualCreateOpen && (
        <ManualMemberCreateDialog
          onClose={() => setManualCreateOpen(false)}
          onCreated={handleManualMemberCreated}
        />
      )}

      {/* 成员详情配置：完全复用单 Agent 的草稿预览 + 详细配置界面 */}
      {configMemberIndex !== null && plan?.members[configMemberIndex] && (
        <TeamMemberConfigDialog
          key={configMemberIndex}
          member={plan.members[configMemberIndex]}
          hydrating={hydratingConfigs && !plan.members[configMemberIndex].config}
          onClose={() => setConfigMemberIndex(null)}
          onRegenerate={() => regenerateMemberConfig(configMemberIndex)}
          onSave={(patch) => {
            updateMember(configMemberIndex, patch)
            setConfigMemberIndex(null)
          }}
        />
      )}
    </>
  )
}

/**
 * 单个团队成员的配置弹窗。
 *
 * 预览态就是单 Agent 的草稿确认界面（AgentDraftPreview），「编辑详细配置」后进入
 * 单 Agent 的三段式详细配置表单（AgentConfigForm）—— 与创建独立 Agent 完全一致。
 */
function TeamMemberConfigDialog({
  member,
  hydrating,
  onClose,
  onRegenerate,
  onSave,
}: {
  member: TeamMemberPlan
  hydrating: boolean
  onClose: () => void
  /** 让服务端重新生成一版配置（走模型通道），返回本次真实来源。 */
  onRegenerate: () => Promise<AgentDraftSource>
  onSave: (patch: Partial<TeamMemberPlan>) => void
}) {
  const [step, setStep] = useState<'preview' | 'detail'>('preview')
  const [activeTab, setActiveTab] = useState<AgentTab>('basic')
  const [error, setError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [regenerateError, setRegenerateError] = useState<string | null>(null)
  const [regenerateNotice, setRegenerateNotice] = useState<string | null>(null)
  const [form, setForm] = useState<AgentFormValue>(() =>
    member.config
      ? agentFormValueFromDraft(member.config)
      : { ...createEmptyAgentFormValue(), modality: normalizeModality(member.modality) },
  )
  const [avatar, setAvatar] = useState(() => member.avatar || '🤖')

  const openDetails = () => {
    if (member.config) setForm(agentFormValueFromDraft(member.config))
    setError(null)
    setActiveTab('basic')
    setStep('detail')
  }

  /**
   * 重新生成：运行态与结果提示都留在本弹窗内。
   *
   * 结果由外层写回团队草稿（member.config 变化会直接刷新下方预览）；
   * 这里额外把「本次是谁生成的」讲清楚 —— 模型不可用时内容不会变化，
   * 不说明的话用户只会看到「按钮没反应」。
   */
  const handleRegenerate = async () => {
    if (regenerating) return
    setRegenerating(true)
    setRegenerateError(null)
    setRegenerateNotice(null)
    try {
      const source = await onRegenerate()
      setRegenerateNotice(
        source === 'model'
          ? '已由模型重新设计一版配置，下方内容已更新。'
          : '没有可用的模型供应商，本次按本地规则生成 —— 内容与上一版相同。请在「设置 → 模型」中配置供应商后重试。',
      )
    } catch (err) {
      setRegenerateError(err instanceof Error ? err.message : String(err))
    } finally {
      setRegenerating(false)
    }
  }

  const saveDetails = () => {
    const issue = validateAgentFormValue(form)
    if (issue) {
      setActiveTab(issue.tab)
      setError(issue.message)
      return
    }
    const config = agentFormValueToDraft(form, member.config ?? { avatar, modality: member.modality })
    onSave({
      name: config.name,
      avatar,
      role: config.description,
      systemPrompt: config.systemPrompt,
      config: { ...config, avatar },
    })
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="grid max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{step === 'preview' ? `配置「${member.name}」` : '编辑 Agent'}</DialogTitle>
          <DialogDescription>
            {step === 'preview'
              ? '通过描述生成一份可确认的 Agent 配置草稿。'
              : '为这个 Agent 设定身份与能力。它会出现在新建对话的选择列表里。'}
          </DialogDescription>
        </DialogHeader>

        {step === 'preview' ? (
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="mb-3 rounded-md border bg-muted/20 px-3 py-2">
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                成员头像 — 团队里每人一个，便于在群聊与列表中辨认
              </div>
              <div className="flex flex-wrap gap-1">
                {AVATAR_CHOICES.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setAvatar(emoji)}
                    className={`flex size-8 items-center justify-center rounded-md border text-base transition hover:border-foreground/30 ${
                      avatar === emoji ? 'border-primary bg-primary/10' : ''
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            {regenerateError && (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                重新生成失败：{regenerateError}
              </div>
            )}
            {regenerateNotice && !regenerateError && (
              <div className="mb-3 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {regenerateNotice}
              </div>
            )}
            {regenerating ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <LoadingIndicator variant="spinner" size="md" />
                <div className="text-xs text-muted-foreground">正在重新生成配置…</div>
              </div>
            ) : member.config ? (
              <AgentDraftPreview draft={member.config} />
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                {hydrating ? (
                  <>
                    <LoadingIndicator variant="spinner" size="md" />
                    <div className="text-xs text-muted-foreground">正在生成成员配置…</div>
                  </>
                ) : (
                  <>
                    <div className="text-xs text-muted-foreground">尚未生成配置，可以点「重新生成」再试一次。</div>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <AgentConfigForm
            value={form}
            onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            activeTab={activeTab}
            onActiveTabChange={setActiveTab}
            error={error}
          />
        )}

        <DialogFooter>
          {step === 'preview' ? (
            <>
              <Button variant="outline" onClick={onClose}>
                <ArrowLeft className="size-3.5" />
                返回
              </Button>
              <Button variant="outline" onClick={() => void handleRegenerate()} disabled={regenerating}>
                {regenerating ? <LoadingIndicator variant="spinner" size="sm" inheritColor /> : <RefreshCw className="size-3.5" />}
                重新生成
              </Button>
              <Button variant="outline" onClick={openDetails} disabled={!member.config || regenerating}>
                <Pencil className="size-3.5" />
                编辑详细配置
              </Button>
              <Button onClick={() => onSave({ avatar })} disabled={!member.config || regenerating}>
                <Save className="size-3.5" />
                保存
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep('preview')}>
                返回
              </Button>
              <Button variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button onClick={saveDetails}>
                <Save className="size-3.5" />
                保存
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 用团队草稿里的身份字段覆盖 Agent 配置，保证「团队里看到的」与「创建出来的」一致。 */
function applyMemberIdentity(draft: AgentConfigDraft, member: TeamMemberDraft): AgentConfigDraft {
  return {
    ...draft,
    name: member.name,
    // 团队草稿给每个成员分配了专属头像，覆盖单 Agent 草稿的默认 🤖
    avatar: member.avatar || draft.avatar,
    description: member.role || draft.description,
    systemPrompt: member.systemPrompt || draft.systemPrompt,
    modality: member.modality,
  }
}

/** `/api/agents/draft` 要求 intent 至少 6 个字符。 */
function memberIntent(teamName: string, member: TeamMemberDraft): string {
  const intent = `${teamName} - ${member.role || member.name}`.trim()
  return (intent.length >= 6 ? intent : `${intent} 团队成员`).slice(0, 4000)
}

/** 解析成员最终的 Agent 配置：优先用户确认过的，其次现场生成，最后本地兜底。 */
async function resolveMemberConfig(teamName: string, member: TeamMemberPlan): Promise<AgentConfigDraft> {
  if (member.config) return member.config
  try {
    const { draft } = await createAgentDraft({
      intent: memberIntent(teamName, member),
      followUp: member.systemPrompt || undefined,
    })
    return applyMemberIdentity(draft, member)
  } catch (err) {
    console.warn('[CreateTeamDialog] member config generation failed, use local draft', err)
    return applyMemberIdentity(
      agentFormValueToDraft({
        ...createEmptyAgentFormValue(),
        name: member.name,
        description: member.role || `${teamName} 成员`,
        systemPrompt: member.systemPrompt || DEFAULT_CUSTOM_SYSTEM_PROMPT,
        modality: normalizeModality(member.modality),
      }),
      member,
    )
  }
}

/**
 * 手动组建团队时新建成员：走与创建独立 Agent 完全一致的三段式链路
 * （描述生成 → 草稿确认 → 详细配置），不满意可以逐项人工调整后再落库。
 */
function ManualMemberCreateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (agent: AgentRow) => void
}) {
  const upsertAgent = useAppStore((s) => s.upsertAgent)
  const [intent, setIntent] = useState('')
  const [generating, setGenerating] = useState(false)
  const [draft, setDraft] = useState<AgentConfigDraft | null>(null)
  const [step, setStep] = useState<'input' | 'preview' | 'detail'>('input')
  const [form, setForm] = useState<AgentFormValue>(() => createEmptyAgentFormValue())
  const [activeTab, setActiveTab] = useState<AgentTab>('basic')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const generate = async () => {
    if (!intent.trim() || generating) return
    setGenerating(true)
    setError(null)
    try {
      const { draft: next } = await createAgentDraft({ intent })
      setDraft(next)
      setForm(agentFormValueFromDraft(next))
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
    }
  }

  const openDetails = () => {
    if (draft) setForm(agentFormValueFromDraft(draft))
    setError(null)
    setActiveTab('basic')
    setStep('detail')
  }

  const applyForm = () => {
    const issue = validateAgentFormValue(form)
    if (issue) {
      setActiveTab(issue.tab)
      setError(issue.message)
      return
    }
    setDraft(agentFormValueToDraft(form, draft ?? undefined))
    setError(null)
    setStep('preview')
  }

  const create = async () => {
    if (!draft || saving) return
    setSaving(true)
    setError(null)
    try {
      const created = await createAgent(agentDraftToCreateBody(draft))
      upsertAgent(created)
      onCreated(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="grid max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>新建团队成员</DialogTitle>
          <DialogDescription>
            {step === 'input'
              ? '先用一句话描述这个成员要做什么，生成草稿后再人工调整。'
              : step === 'preview'
                ? '确认草稿，或点「编辑详细配置」逐项调整。'
                : '为这个成员设定身份与能力。'}
          </DialogDescription>
        </DialogHeader>

        {error && step !== 'detail' && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}

        {step === 'input' && (
          <div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto pr-1">
            <Textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              rows={4}
              className="resize-none"
              placeholder="例如：负责竞品调研并输出结构化对比报告的成员"
            />
          </div>
        )}

        {step === 'preview' && (
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {draft ? <AgentDraftPreview draft={draft} /> : null}
          </div>
        )}

        {step === 'detail' && (
          <AgentConfigForm
            value={form}
            onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            activeTab={activeTab}
            onActiveTabChange={setActiveTab}
            error={error}
          />
        )}

        <DialogFooter>
          {step === 'input' && (
            <>
              <Button variant="outline" onClick={onClose}>取消</Button>
              <Button onClick={() => void generate()} disabled={!intent.trim() || generating}>
                {generating ? <LoadingIndicator variant="spinner" size="sm" inheritColor /> : <Sparkles className="size-3.5" />}
                生成草稿
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => { setDraft(null); setStep('input') }}>
                <ArrowLeft className="size-3.5" />
                返回
              </Button>
              <Button variant="outline" onClick={openDetails} disabled={!draft}>
                <Pencil className="size-3.5" />
                编辑详细配置
              </Button>
              <Button onClick={() => void create()} disabled={!draft || saving}>
                {saving ? <LoadingIndicator variant="spinner" size="sm" inheritColor /> : <Save className="size-3.5" />}
                创建并加入团队
              </Button>
            </>
          )}
          {step === 'detail' && (
            <>
              <Button variant="outline" onClick={() => setStep('preview')}>返回</Button>
              <Button onClick={applyForm}>
                <Save className="size-3.5" />
                保存
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
