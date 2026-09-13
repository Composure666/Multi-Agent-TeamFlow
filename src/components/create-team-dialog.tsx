'use client'

import { Loader2, MessageSquare, Plus, Sparkles, Users, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { AgentAvatar } from '@/components/agent-avatar'
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
import { Textarea } from '@/components/ui/textarea'
import type { AgentRow } from '@/db/schema'
import type { TeamDraft, TeamMemberDraft } from '@/server/team-draft-service'

interface CreateTeamDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (teamId: string) => void
  onStartChat?: (teamId: string) => void
}

type Mode = 'auto' | 'manual'
type Step = 'input' | 'preview' | 'creating'

/**
 * 创建团队对话框。
 * - 自动模式：输入团队目标，启发式生成团队结构，确认后逐个创建 Agent 并组建团队
 * - 手动模式：填写团队信息，从现有 Agent 中选择成员
 */
export function CreateTeamDialog({ open, onOpenChange, onCreated, onStartChat }: CreateTeamDialogProps) {
  const [mode, setMode] = useState<Mode>('auto')
  const [step, setStep] = useState<Step>('input')
  const [goal, setGoal] = useState('')
  const [draft, setDraft] = useState<TeamDraft | null>(null)
  const [generating, setGenerating] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createProgress, setCreateProgress] = useState({ current: 0, total: 0, label: '' })
  const [error, setError] = useState<string | null>(null)
  const [createdTeamId, setCreatedTeamId] = useState<string | null>(null)
  const [viewingMember, setViewingMember] = useState<number | null>(null)

  // 手动模式
  const [manualName, setManualName] = useState('')
  const [manualDescription, setManualDescription] = useState('')
  const [manualGoal, setManualGoal] = useState('')
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [allAgents, setAllAgents] = useState<AgentRow[]>([])

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
    setDraft(null)
    setError(null)
    setManualName('')
    setManualDescription('')
    setManualGoal('')
    setSelectedAgents([])
    setCreatedTeamId(null)
    setViewingMember(null)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) reset()
    onOpenChange(open)
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
        setDraft(data.draft)
        setStep('preview')
      } else {
        setError(data.error ?? '生成失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
    }
  }

  const handleCreateAuto = async () => {
    if (!draft) return
    setCreating(true)
    setStep('creating')
    setCreateProgress({ current: 0, total: draft.members.length, label: '准备创建…' })

    try {
      const memberAgentIds: string[] = []
      for (let i = 0; i < draft.members.length; i++) {
        const m = draft.members[i]
        setCreateProgress({ current: i + 1, total: draft.members.length, label: `创建 ${m.name}…` })

        // 生成 Agent draft（含模型自动匹配）
        const draftRes = await fetch('/api/agents/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intent: `${draft.name} - ${m.role}`, followUp: m.systemPrompt }),
        })
        const draftData = await draftRes.json()
        const agentDraft = draftData.draft

        // 覆盖名称、描述、systemPrompt、modality
        agentDraft.name = m.name
        agentDraft.description = m.role
        agentDraft.systemPrompt = m.systemPrompt
        agentDraft.modality = m.modality

        // 创建 Agent
        const agentRes = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(agentDraft),
        })
        const agentData = await agentRes.json()
        if (agentData.agent) {
          memberAgentIds.push(agentData.agent.id)
        }
      }

      // 创建团队
      setCreateProgress({ current: draft.members.length, total: draft.members.length, label: '组建团队…' })
      const teamRes = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          description: draft.description,
          goal: draft.goal,
          members: draft.members.map((m, i) => ({
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl overflow-hidden">
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
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}

          {/* 自动模式 - 输入 */}
          {mode === 'auto' && step === 'input' && !generating && !createdTeamId && (
            <div className="flex flex-col gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-medium">团队目标</label>
                <Textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="描述你想要这个团队完成什么，例如：做一个产品落地页、写一篇深度调研报告、制作一个产品宣传视频…"
                  rows={4}
                  className="resize-none"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['做一个产品落地页', '写一篇行业调研报告', '制作产品宣传视频', '策划一场营销活动'].map((s) => (
                  <button
                    key={s}
                    className="rounded-full border px-2 py-1 text-[11px] text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
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
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <div className="text-sm font-medium">AI 正在设计团队结构…</div>
              <div className="text-xs text-muted-foreground">分析目标、匹配角色、生成提示词</div>
            </div>
          )}

          {/* 自动模式 - 预览 */}
          {mode === 'auto' && step === 'preview' && draft && (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-sm font-medium">{draft.name}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{draft.description}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">目标：{draft.goal}</div>
              </div>
              <div className="text-xs font-medium">团队成员（{draft.members.length} 人）</div>
              <div className="flex flex-col gap-2">
                {draft.members.map((m, i) => (
                  <div key={i} className="rounded-md border bg-card">
                    <button
                      className="flex w-full items-center gap-2 px-2 py-2 text-left"
                      onClick={() => setViewingMember(viewingMember === i ? null : i)}
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm">
                        {m.name[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-medium">{m.name}</span>
                          {m.isLead && (
                            <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[9px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                              负责人
                            </span>
                          )}
                          <span className="shrink-0 rounded bg-blue-100 px-1 py-0.5 text-[9px] text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                            {m.modality}
                          </span>
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">{m.role}</div>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{viewingMember === i ? '收起' : '配置'}</span>
                    </button>
                    {viewingMember === i && (
                      <div className="border-t bg-muted/30 px-3 py-2">
                        <div className="mb-1 text-[10px] font-medium text-muted-foreground">系统提示词</div>
                        <div className="text-[11px] leading-relaxed text-foreground/80">{m.systemPrompt}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="rounded-md bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground">
                {draft.rationale.map((r, i) => (
                  <div key={i}>· {r}</div>
                ))}
              </div>
            </div>
          )}

          {/* 自动模式 - 创建中 */}
          {mode === 'auto' && step === 'creating' && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <div className="text-sm font-medium">{createProgress.label}</div>
              <div className="text-xs text-muted-foreground">
                {createProgress.current} / {createProgress.total}
              </div>
              <div className="h-1.5 w-48 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${createProgress.total ? (createProgress.current / createProgress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* 手动模式 */}
          {mode === 'manual' && (
            <div className="flex flex-col gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-medium">团队名称 *</label>
                <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="例如：产品增长团队" />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium">团队描述</label>
                <Input value={manualDescription} onChange={(e) => setManualDescription(e.target.value)} placeholder="一句话描述团队职责" />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium">团队目标</label>
                <Textarea value={manualGoal} onChange={(e) => setManualGoal(e.target.value)} rows={2} className="resize-none" placeholder="团队的核心目标和使命" />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium">选择成员（{selectedAgents.length} 人）*</label>
                <div className="max-h-48 overflow-y-auto rounded-md border">
                  {allAgents.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground">暂无 Agent，请先创建 Agent</div>
                  ) : (
                    allAgents.map((a) => (
                      <button
                        key={a.id}
                        className={`flex w-full items-center gap-2 border-b px-2 py-1.5 text-left transition last:border-b-0 hover:bg-muted/50 ${selectedAgents.includes(a.id) ? 'bg-primary/5' : ''}`}
                        onClick={() => toggleAgent(a.id)}
                      >
                        <input type="checkbox" checked={selectedAgents.includes(a.id)} readOnly className="size-3.5" />
                        <AgentAvatar agent={a} size="sm" />
                        <span className="truncate text-xs">{a.name}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{a.modality}</span>
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
              {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
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
              {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              创建团队
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
