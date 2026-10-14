'use client'

import { MessageSquare, Plus, Users } from 'lucide-react'
import { useEffect, useState } from 'react'

import { TeamDetailDialog } from '@/components/team-detail-dialog'
import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import type { ConversationWithMeta } from '@/db/schema'
import { createConversation } from '@/lib/api'
import type { TeamWithMembers } from '@/server/team-service'

interface TeamLibraryProps {
  refreshKey?: number
  onStartChat?: (conversation: ConversationWithMeta) => void | Promise<void>
  onCreateTeam?: () => void
}

/**
 * TeamLibrary — 团队列表。展示所有 Agent 团队，支持新建、查看详情和直接开始对话。
 */
export function TeamLibrary({ refreshKey, onStartChat, onCreateTeam }: TeamLibraryProps) {
  const [teams, setTeams] = useState<Array<TeamWithMembers & { memberCount: number }>>([])
  const [loading, setLoading] = useState(true)
  const [detailTeamId, setDetailTeamId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [startingChat, setStartingChat] = useState<string | null>(null)

  const loadTeams = () => {
    setLoading(true)
    fetch('/api/teams')
      .then((r) => r.json())
      .then((d) => setTeams(d.teams ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadTeams()
  }, [refreshKey])

  const openDetail = (teamId: string) => {
    setDetailTeamId(teamId)
    setDetailOpen(true)
  }

  const handleStartChat = async (team: (typeof teams)[number]) => {
    if (startingChat || team.members.length === 0) return
    setStartingChat(team.id)
    try {
      const conversation = await createConversation({
        title: team.name,
        mode: 'group',
        agentIds: team.members.map((m) => m.agentId),
      })
      await onStartChat?.(conversation)
    } catch (err) {
      console.error('[TeamLibrary] start chat failed', err)
    } finally {
      setStartingChat(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 px-3 pt-3">
        <Button className="w-full justify-start gap-2" variant="outline" onClick={() => onCreateTeam?.()}>
          <Plus className="size-4" />
          创建团队
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {loading ? (
          <LoadingIndicator variant="both" size="sm" label="加载团队…" className="py-8" />
        ) : teams.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
            <Users className="size-8 text-muted-foreground/40" />
            <div className="text-xs text-muted-foreground">还没有团队</div>
            <div className="text-xs text-muted-foreground/70">创建团队，让多个 Agent 协作完成复杂任务</div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {teams.map((t) => (
              <div
                key={t.id}
                className="group flex w-full items-center gap-3 rounded-md border bg-card px-3 py-3 transition hover:border-foreground/20"
              >
                <button className="min-w-0 flex-1 text-left" onClick={() => openDetail(t.id)}>
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{t.name}</span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-3xs text-muted-foreground">
                      {t.memberCount} 人
                    </span>
                  </div>
                  {t.description && (
                    <div className="truncate text-xs text-muted-foreground">{t.description}</div>
                  )}
                  {t.members.length > 0 && (
                    <div className="mt-1.5 flex -space-x-1">
                      {t.members.slice(0, 4).map((m) => (
                        <div
                          key={m.id}
                          className="flex size-5 items-center justify-center rounded-full border border-background bg-muted text-3xs"
                          title={m.agentName}
                        >
                          {m.agentName[0]}
                        </div>
                      ))}
                      {t.members.length > 4 && (
                        <div className="flex size-5 items-center justify-center rounded-full border border-background bg-muted text-3xs text-muted-foreground">
                          +{t.members.length - 4}
                        </div>
                      )}
                    </div>
                  )}
                </button>
                <button
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleStartChat(t)
                  }}
                  title="开始对话"
                  disabled={startingChat === t.id || t.members.length === 0}
                >
                  {startingChat === t.id ? (
                    <LoadingIndicator variant="spinner" size="sm" inheritColor />
                  ) : (
                    <MessageSquare className="size-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <TeamDetailDialog
        teamId={detailTeamId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onDeleted={() => loadTeams()}
        onUpdated={() => loadTeams()}
        onStartChat={onStartChat}
      />
    </div>
  )
}
