'use client'

import { Loader2, MessageSquare, Pencil, Trash2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'

import { AgentAvatar } from '@/components/agent-avatar'
import { CreateAgentDialog } from '@/components/create-agent-dialog'
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
import type { TeamWithMembers } from '@/server/team-service'

interface TeamDetailDialogProps {
  teamId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
  onUpdated?: () => void
  onStartChat?: (conversation: { id: string; [key: string]: unknown }) => void | Promise<void>
}

/**
 * 团队详情对话框。展示团队信息和成员列表，支持编辑基本信息和删除成员。
 */
export function TeamDetailDialog({ teamId, open, onOpenChange, onDeleted, onUpdated, onStartChat }: TeamDetailDialogProps) {
  const [team, setTeam] = useState<TeamWithMembers | null>(null)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [startingChat, setStartingChat] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 编辑态
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editGoal, setEditGoal] = useState('')
  const [allAgents, setAllAgents] = useState<AgentRow[]>([])
  const [showAddMember, setShowAddMember] = useState(false)
  const [editingMember, setEditingMember] = useState<AgentRow | null>(null)
  const [editSystemPrompt, setEditSystemPrompt] = useState('')

  useEffect(() => {
    if (open && teamId) {
      setLoading(true)
      setError(null)
      fetch(`/api/teams/${teamId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.team) {
            setTeam(d.team)
            setEditName(d.team.name)
            setEditDescription(d.team.description)
            setEditGoal(d.team.goal)
            setEditSystemPrompt(d.team.systemPrompt ?? '')
          } else {
            setError(d.error ?? '加载失败')
          }
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setLoading(false))

      fetch('/api/agents')
        .then((r) => r.json())
        .then((d) => setAllAgents(d.agents ?? []))
        .catch(() => {})
    }
  }, [open, teamId])

  const handleSave = async () => {
    if (!teamId || !editName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          description: editDescription,
          goal: editGoal,
          systemPrompt: editSystemPrompt,
        }),
      })
      const data = await res.json()
      if (data.team) {
        setTeam(data.team)
        setEditing(false)
        onUpdated?.()
      } else {
        setError(data.error ?? '保存失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!teamId) return
    if (!confirm(`确定删除团队「${team?.name ?? ''}」？成员 Agent 不会被删除。`)) return
    setDeleting(true)
    try {
      await fetch(`/api/teams/${teamId}`, { method: 'DELETE' })
      onDeleted?.()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleting(false)
    }
  }

  const handleStartChat = async () => {
    if (!team || team.members.length === 0) return
    setStartingChat(true)
    setError(null)
    try {
      const agentIds = team.members.map((m) => m.agentId)
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: team.name, mode: 'group', agentIds }),
      })
      const data = await res.json()
      if (data.conversation) {
        await onStartChat?.(data.conversation)
        onOpenChange(false)
      } else {
        setError(data.error ?? '创建对话失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStartingChat(false)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!teamId) return
    try {
      // 重新设置成员列表（排除被删除的）
      const remaining = team?.members.filter((m) => m.id !== memberId) ?? []
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members: remaining.map((m, i) => ({ agentId: m.agentId, role: m.role, isLead: m.isLead, sortOrder: i })),
        }),
      })
      const data = await res.json()
      if (data.team) {
        setTeam(data.team)
        onUpdated?.()
      }
    } catch (err) {
      console.error('[TeamDetailDialog] remove member failed', err)
    }
  }

  const handleAddMember = async (agentId: string) => {
    if (!teamId || !team) return
    const existingIds = new Set(team.members.map((m) => m.agentId))
    if (existingIds.has(agentId)) return
    const newMembers = [
      ...team.members.map((m) => ({ agentId: m.agentId, role: m.role, isLead: m.isLead })),
      { agentId, role: '', isLead: false },
    ]
    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members: newMembers }),
      })
      const data = await res.json()
      if (data.team) {
        setTeam(data.team)
        setShowAddMember(false)
        onUpdated?.()
      }
    } catch (err) {
      console.error('[TeamDetailDialog] add member failed', err)
    }
  }

  const availableAgents = allAgents.filter((a) => !team?.members.some((m) => m.agentId === a.id))

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-4" />
            {editing ? '编辑团队' : '团队详情'}
          </DialogTitle>
          <DialogDescription>
            {team ? `${team.members.length} 名成员` : '加载中…'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : team ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1">
            {/* 基本信息 */}
            {editing ? (
              <div className="flex flex-col gap-2">
                <div className="grid gap-1">
                  <label className="text-[11px] font-medium">团队名称</label>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <label className="text-[11px] font-medium">团队描述</label>
                  <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <label className="text-[11px] font-medium">团队目标</label>
                  <Textarea value={editGoal} onChange={(e) => setEditGoal(e.target.value)} rows={2} className="resize-none" />
                </div>
                <div className="grid gap-1">
                  <label className="text-[11px] font-medium">系统提示词（Orchestrator 用）</label>
                  <Textarea value={editSystemPrompt} onChange={(e) => setEditSystemPrompt(e.target.value)} rows={3} className="resize-none" placeholder="团队负责人作为 Orchestrator 的系统提示词" />
                </div>
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-sm font-medium">{team.name}</div>
                {team.description && <div className="mt-0.5 text-[11px] text-muted-foreground">{team.description}</div>}
                {team.goal && (
                  <div className="mt-1.5 border-t pt-1.5 text-[11px] text-muted-foreground">
                    <span className="font-medium">目标：</span>{team.goal}
                  </div>
                )}
                {team.systemPrompt && (
                  <div className="mt-1.5 border-t pt-1.5 text-[11px] text-muted-foreground">
                    <span className="font-medium">系统提示词：</span>{team.systemPrompt.slice(0, 100)}{team.systemPrompt.length > 100 ? '…' : ''}
                  </div>
                )}
              </div>
            )}

            {/* 成员列表 */}
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium">成员（{team.members.length}）</div>
              {!editing && (
                <Button size="sm" variant="ghost" onClick={() => setShowAddMember(!showAddMember)}>
                  + 添加成员
                </Button>
              )}
            </div>

            {showAddMember && (
              <div className="max-h-32 overflow-y-auto rounded-md border">
                {availableAgents.length === 0 ? (
                  <div className="px-3 py-2 text-center text-[11px] text-muted-foreground">所有 Agent 已在团队中</div>
                ) : (
                  availableAgents.map((a) => (
                    <button
                      key={a.id}
                      className="flex w-full items-center gap-2 border-b px-2 py-1.5 text-left transition last:border-b-0 hover:bg-muted/50"
                      onClick={() => handleAddMember(a.id)}
                    >
                      <AgentAvatar agent={a} size="sm" />
                      <span className="truncate text-xs">{a.name}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{a.modality}</span>
                    </button>
                  ))
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              {team.members.map((m) => (
                <div key={m.id} className="group flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
                  <AgentAvatar agent={{ id: m.agentId, name: m.agentName, avatar: m.agentAvatar } as AgentRow} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium">{m.agentName}</span>
                      {m.isLead && (
                        <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[9px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                          负责人
                        </span>
                      )}
                    </div>
                    {m.role && <div className="truncate text-[10px] text-muted-foreground">{m.role}</div>}
                  </div>
                  {!editing && (
                    <>
                      <button
                        className="opacity-0 transition group-hover:opacity-100"
                        onClick={() => {
                          const agent = allAgents.find(a => a.id === m.agentId)
                          if (agent) setEditingMember(agent)
                        }}
                        title="查看/编辑 Agent 配置"
                      >
                        <Pencil className="size-3.5 text-muted-foreground hover:text-primary" />
                      </button>
                      <button
                        className="opacity-0 transition group-hover:opacity-100"
                        onClick={() => handleRemoveMember(m.id)}
                        title="移除成员"
                      >
                        <Trash2 className="size-3.5 text-muted-foreground hover:text-red-500" />
                      </button>
                    </>
                  )}
                </div>
              ))}
              {team.members.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">团队暂无成员</div>
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || deleting}>
            关闭
          </Button>
          {editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                取消
              </Button>
              <Button onClick={() => void handleSave()} disabled={saving || !editName.trim()}>
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                保存
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => void handleStartChat()} disabled={startingChat || loading || !team || team.members.length === 0}>
                {startingChat ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquare className="size-3.5" />}
                开始对话
              </Button>
              <Button variant="outline" onClick={() => setEditing(true)} disabled={loading || !team}>
                <Pencil className="size-3.5" />
                编辑
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <CreateAgentDialog
      open={!!editingMember}
      onOpenChange={(open) => { if (!open) setEditingMember(null) }}
      agent={editingMember ?? undefined}
    />
    </>
  )
}
