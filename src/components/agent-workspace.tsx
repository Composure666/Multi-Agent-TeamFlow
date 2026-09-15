'use client'

import { Check, CheckCircle2, ChevronDown, ChevronRight, FileCode2, FileText, History, MessageCircle, Pencil, Plus, Search, SlidersHorizontal, Trash2, Wrench, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { TeamDetailDialog } from '@/components/team-detail-dialog'
import type { TeamWithMembers } from '@/server/team-service'
import { AgentAvatar } from '@/components/agent-avatar'
import {
  RESOURCE_AGENT_PRESETS,
  SUMMON_SCENE_CATEGORIES,
  SUMMON_TEAMS,
  featuredCategories,
  getAgentDisplayName,
  getPresetDisplayName,
  isPresetBackedAgent,
  resolveOrCreatePresetAgent,
  type ResourceAgentPreset,
  type SummonableMember,
  type SummonableTeam,
} from '@/components/agent-catalog'
import { filterAgentPresets, filterMyAgents, getVisibleAgentPresets, projectMyAgents } from '@/components/agent-workspace-model'
import { CreateAgentDialog } from '@/components/create-agent-dialog'
import { CreateTeamDialog } from '@/components/create-team-dialog'
import { UnifiedCreateDialog } from '@/components/unified-create-dialog'
import { HorizontalScrollControls } from '@/components/horizontal-scroll-controls'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DetailSection, HistoryRow, SavedState } from '@/components/workbench-detail-primitives'
import type { AgentRow } from '@/db/schema'
import { createConversation, deleteAgent } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAgentList, useAppStore } from '@/stores/app-store'

const FEATURED_MY_AGENT_IDS_KEY = 'agenthub.featuredMyAgentIds'
const FEATURED_AGENT_PAGE_SIZE = 12
const SCROLL_END_THRESHOLD_PX = 80
function TeamAvatarStack({ members }: { members: SummonableMember[] }) {
  const hiddenCount = Math.max(members.length - 3, 0)

  return (
    <div className="flex -space-x-2">
      {members.slice(0, 3).map((member) => (
        <span key={member.id} className="flex size-7 items-center justify-center rounded-full border border-slate-200 bg-white text-sm shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-[var(--agenthub-surface-raised,#252932)]">
          {member.avatar}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="flex size-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[10px] font-medium text-slate-600 shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-[var(--agenthub-surface-raised,#252932)] dark:text-[#B8C0CC]">
          +{hiddenCount}
        </span>
      )}
    </div>
  )
}

/**
 * 精选场景卡片的双主题色板。
 * - light：浅色 SaaS 风（白底 + 浅色调 chip）
 * - dark：深色 SaaS 风（深底 + 半透明彩色 chip + 微弱 ambient）
 * FeaturedTeamCard 用 useTheme 或文档根 dark class 切换；此处根据 .dark 选择对应字段。
 */
type SceneTone = {
  chip: string
  cover: string
  accent: string
  dot: string
  dotDark: string
}
const SCENE_TONES_LIGHT: Record<string, SceneTone> = {
  daily: { chip: 'bg-blue-50 text-blue-700 border-blue-100', cover: 'from-blue-50 via-white to-white', accent: 'text-blue-600', dot: 'bg-blue-500', dotDark: 'bg-blue-400' },
  code: { chip: 'bg-violet-50 text-violet-700 border-violet-100', cover: 'from-violet-50/80 via-white to-white', accent: 'text-violet-600', dot: 'bg-violet-500', dotDark: 'bg-violet-400' },
  finance: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-100', cover: 'from-emerald-50/80 via-white to-white', accent: 'text-emerald-600', dot: 'bg-emerald-500', dotDark: 'bg-emerald-400' },
  design: { chip: 'bg-amber-50 text-amber-700 border-amber-100', cover: 'from-amber-50/80 via-white to-white', accent: 'text-amber-600', dot: 'bg-amber-500', dotDark: 'bg-amber-400' },
  docs: { chip: 'bg-sky-50 text-sky-700 border-sky-100', cover: 'from-sky-50/80 via-white to-white', accent: 'text-sky-600', dot: 'bg-sky-500', dotDark: 'bg-sky-400' },
}
const SCENE_TONES_DARK: Record<string, SceneTone> = {
  daily: { chip: 'bg-blue-500/10 text-blue-300 border-blue-400/25', cover: 'from-blue-500/15 via-transparent to-transparent', accent: 'text-blue-300', dot: 'bg-blue-500', dotDark: 'bg-blue-400' },
  code: { chip: 'bg-violet-500/10 text-violet-300 border-violet-400/25', cover: 'from-violet-500/15 via-transparent to-transparent', accent: 'text-violet-300', dot: 'bg-violet-500', dotDark: 'bg-violet-400' },
  finance: { chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/25', cover: 'from-emerald-500/15 via-transparent to-transparent', accent: 'text-emerald-300', dot: 'bg-emerald-500', dotDark: 'bg-emerald-400' },
  design: { chip: 'bg-amber-500/10 text-amber-300 border-amber-400/25', cover: 'from-amber-500/15 via-transparent to-transparent', accent: 'text-amber-300', dot: 'bg-amber-500', dotDark: 'bg-amber-400' },
  docs: { chip: 'bg-sky-500/10 text-sky-300 border-sky-400/25', cover: 'from-sky-500/15 via-transparent to-transparent', accent: 'text-sky-300', dot: 'bg-sky-500', dotDark: 'bg-sky-400' },
}
const FALLBACK_SCENE_TONE_LIGHT = SCENE_TONES_LIGHT.daily!
const FALLBACK_SCENE_TONE_DARK = SCENE_TONES_DARK.daily!

function FeaturedTeamCard({ team, onOpen }: { team: SummonableTeam; onOpen: () => void }) {
  const category = SUMMON_SCENE_CATEGORIES.find((item) => item.id === team.category)
  const lightTone = SCENE_TONES_LIGHT[team.category] ?? FALLBACK_SCENE_TONE_LIGHT
  const darkTone = SCENE_TONES_DARK[team.category] ?? FALLBACK_SCENE_TONE_DARK

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        // 亮色：白底 + 浅边框 + 轻阴影
        // 暗色：深底 #1C1F26（与 --agenthub-surface 对齐）+ 半透明白色边框 + 微 ambient
        'group relative flex h-[180px] w-[300px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--agenthub-accent-border)] focus-visible:ring-offset-2 sm:w-[340px] lg:w-[360px]',
        'dark:border-white/10 dark:bg-[var(--agenthub-surface,#1C1F26)] dark:shadow-none dark:hover:border-white/15 dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)]',
      )}
    >
      {/* ambient：light 极淡色调；dark 微弱彩色光晕 */}
      <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-br dark:hidden', lightTone.cover)} aria-hidden="true" />
      <div className={cn('pointer-events-none absolute inset-0 hidden bg-gradient-to-br dark:block', darkTone.cover)} aria-hidden="true" />

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          {/* 左上：分类 chip */}
          <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium', lightTone.chip, 'dark:' + darkTone.chip.split(' ').join(' dark:'))}>
            <span className={cn('size-1.5 rounded-full', lightTone.dot, 'dark:' + darkTone.dotDark)} />
            {category?.label}
          </span>
          {/* 右上：数据 badge（heat） */}
          <span className={cn(
            'shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500',
            'dark:border-white/10 dark:bg-white/[0.04] dark:text-[#B8C0CC]',
          )}>{team.heat}</span>
        </div>
        <div className="mt-auto pt-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-[#7F8998]">{team.type === 'team' ? '推荐团队' : '推荐 Agent'}</div>
          <h3 className="mt-1 truncate text-[16px] font-semibold tracking-tight text-slate-900 dark:text-[#F5F7FA]">{team.name}</h3>
          <p className="mt-1.5 line-clamp-2 text-[12px] leading-5 text-slate-500 dark:text-[#B8C0CC]">{team.description}</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <TeamAvatarStack members={team.members} />
            <span className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium opacity-0 transition group-hover:opacity-100',
              lightTone.accent,
              'dark:' + darkTone.accent.split(' ').join(' dark:'),
            )}>
              查看详情
              <ChevronRight className="size-3.5" />
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}


export function AgentWorkspace({
  onOpenConversations,
  onOpenTeamDetail,
}: {
  onOpenConversations: () => void
  onOpenTeamDetail: (team: SummonableTeam) => void
}) {
  const agents = useAgentList()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('全部')
  const [agentView, setAgentView] = useState<'featured' | 'mine'>('featured')
  const [mineFilter, setMineFilter] = useState<'all' | 'agent' | 'team'>('all')
  const [teams, setTeams] = useState<Array<TeamWithMembers & { memberCount: number }>>([])
  const [detailTeamId, setDetailTeamId] = useState<string | null>(null)
  const [detailTeamOpen, setDetailTeamOpen] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [agentDetailOpen, setAgentDetailOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [teamFormOpen, setTeamFormOpen] = useState(false)
  const [unifiedCreateOpen, setUnifiedCreateOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentRow | undefined>(undefined)
  const [startingPresetId, setStartingPresetId] = useState<string | null>(null)
  const [deleteTargetAgentId, setDeleteTargetAgentId] = useState<string | null>(null)
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null)
  const [agentFeedback, setAgentFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [selectedDeleteAgentIds, setSelectedDeleteAgentIds] = useState<Set<string>>(() => new Set())
  const [selectedDeleteTeamIds, setSelectedDeleteTeamIds] = useState<Set<string>>(() => new Set())
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [featuredMyAgentIds, setFeaturedMyAgentIds] = useState<Set<string>>(() => new Set())
  const [addingPresetId, setAddingPresetId] = useState<string | null>(null)
  const [visiblePresetCount, setVisiblePresetCount] = useState(FEATURED_AGENT_PAGE_SIZE)
  const agentWorkspaceScrollRef = useRef<HTMLDivElement>(null)
  const upsertConversation = useAppStore((s) => s.upsertConversation)
  const upsertAgent = useAppStore((s) => s.upsertAgent)
  const setAgents = useAppStore((s) => s.setAgents)
  const removeAgent = useAppStore((s) => s.removeAgent)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)

  const myAgents = useMemo(
    () => projectMyAgents(agents, featuredMyAgentIds, isPresetBackedAgent),
    [agents, featuredMyAgentIds],
  )

  useEffect(() => {
    setFeaturedMyAgentIds(readFeaturedMyAgentIds())
  }, [])

  // 反馈提示 3 秒后自动关闭
  useEffect(() => {
    if (!agentFeedback) return
    const t = setTimeout(() => setAgentFeedback(null), 3000)
    return () => clearTimeout(t)
  }, [agentFeedback])

  useEffect(() => {
    fetch('/api/teams')
      .then((r) => r.json())
      .then((d) => setTeams(d.teams ?? []))
      .catch(() => {})
  }, [teamFormOpen, detailTeamOpen])

  useEffect(() => {
    setSelectedDeleteAgentIds((current) => {
      const visibleIds = new Set(myAgents.map((agent) => agent.id))
      const next = new Set(Array.from(current).filter((id) => visibleIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [myAgents])

  const filteredPresets = useMemo(
    () => filterAgentPresets(
      RESOURCE_AGENT_PRESETS.map((preset) => ({ ...preset, displayName: getPresetDisplayName(preset) })),
      query,
      tab,
    ),
    [query, tab],
  )
  const visiblePresets = getVisibleAgentPresets(filteredPresets, visiblePresetCount)
  const hasMorePresets = visiblePresetCount < filteredPresets.length

  useEffect(() => {
    setVisiblePresetCount(FEATURED_AGENT_PAGE_SIZE)
  }, [agentView, query, tab])

  useEffect(() => {
    const scrollContainer = agentWorkspaceScrollRef.current
    if (!scrollContainer || agentView !== 'featured' || !hasMorePresets) return

    const handleScroll = () => {
      const distanceToBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight
      if (distanceToBottom > SCROLL_END_THRESHOLD_PX) return

      setVisiblePresetCount((count) => Math.min(count + FEATURED_AGENT_PAGE_SIZE, filteredPresets.length))
    }

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()

    return () => scrollContainer.removeEventListener('scroll', handleScroll)
  }, [agentView, filteredPresets.length, hasMorePresets])

  const filteredAgents = useMemo(
    () => filterMyAgents(myAgents, query, getAgentDisplayName),
    [myAgents, query],
  )

  const selectedAgent = agentView === 'mine' && selectedAgentId
    ? agents.find((agent) => agent.id === selectedAgentId)
    : undefined
  const selectedPreset = agentView === 'featured' && selectedPresetId
    ? RESOURCE_AGENT_PRESETS.find((preset) => preset.id === selectedPresetId)
    : undefined
  const selectedPresetAgent = selectedPreset
    ? agents.find((agent) => agent.name === selectedPreset.name || agent.name === getPresetDisplayName(selectedPreset))
    : undefined
  const selectedPresetAdded = selectedPresetAgent ? featuredMyAgentIds.has(selectedPresetAgent.id) : false

  const addPresetToMine = async (preset: ResourceAgentPreset) => {
    if (addingPresetId) return
    setAddingPresetId(preset.id)
    setAgentFeedback(null)
    try {
      const knownAgents = [...agents]
      const agent = await resolveOrCreatePresetAgent(preset, knownAgents, upsertAgent)
      setFeaturedMyAgentIds((current) => {
        const next = new Set(current)
        next.add(agent.id)
        writeFeaturedMyAgentIds(next)
        return next
      })
      setAgentFeedback({ type: 'success', message: `已添加「${getPresetDisplayName(preset)}」到我的 Agent。` })
    } catch (err) {
      console.error('[AgentWorkspace] add preset to mine failed', err)
      setAgentFeedback({ type: 'error', message: '添加精选 Agent 失败，请稍后重试。' })
    } finally {
      setAddingPresetId(null)
    }
  }

  const startPresetConversation = async (preset: ResourceAgentPreset) => {
    if (startingPresetId) return
    setStartingPresetId(preset.id)
    try {
      const knownAgents = [...agents]
      const agent = await resolveOrCreatePresetAgent(preset, knownAgents, upsertAgent)
      const conv = await createConversation({ mode: 'single', agentIds: [agent.id] })
      upsertConversation(conv)
      setActiveConversation(conv.id)
      onOpenConversations()
    } catch (err) {
      console.error('[AgentWorkspace] start preset conversation failed', err)
    } finally {
      setStartingPresetId(null)
    }
  }

  const startConversation = async (agent: AgentRow) => {
    try {
      const conv = await createConversation({ mode: 'single', agentIds: [agent.id] })
      upsertConversation(conv)
      setActiveConversation(conv.id)
      onOpenConversations()
    } catch (err) {
      console.error('[AgentWorkspace] start conversation failed', err)
    }
  }

  const startTeamConversation = async (team: TeamWithMembers) => {
    if (team.members.length === 0) return
    try {
      const conv = await createConversation({
        title: team.name,
        mode: 'group',
        agentIds: team.members.map((m) => m.agentId),
      })
      upsertConversation(conv)
      setActiveConversation(conv.id)
      onOpenConversations()
    } catch (err) {
      console.error('[AgentWorkspace] start team conversation failed', err)
    }
  }

  /** 只知道 teamId 时的入口（创建团队成功后直接开聊）。 */
  const startTeamConversationById = async (teamId: string) => {
    try {
      const res = await fetch(`/api/teams/${teamId}`)
      const data = (await res.json()) as { team?: TeamWithMembers }
      if (!data.team) return
      await startTeamConversation(data.team)
    } catch (err) {
      console.error('[AgentWorkspace] start team conversation by id failed', err)
    }
  }

  const confirmDeleteAgent = async () => {
    if (!deleteTargetAgentId || deletingAgentId) return

    const target = agents.find((agent) => agent.id === deleteTargetAgentId)
    if (!target || target.isBuiltin) return

    setDeletingAgentId(target.id)
    setAgentFeedback(null)
    try {
      await deleteAgent(target.id)
      removeAgent(target.id)
      setSelectedAgentId((current) => current === target.id ? null : current)
      if (selectedAgentId === target.id) setAgentDetailOpen(false)
      setSelectedDeleteAgentIds((current) => {
        const next = new Set(current)
        next.delete(target.id)
        return next
      })
      setDeleteTargetAgentId(null)
      setAgentFeedback({ type: 'success', message: `已删除 Agent「${getAgentDisplayName(target)}」。` })
    } catch (err) {
      console.error('[AgentWorkspace] delete agent failed', err)
      setAgentFeedback({ type: 'error', message: '删除 Agent 失败，请确认该 Agent 未被会话或产物引用。' })
    } finally {
      setDeletingAgentId(null)
    }
  }

  const deleteSelected = async () => {
    const agentIds = Array.from(selectedDeleteAgentIds)
    const teamIds = Array.from(selectedDeleteTeamIds)
    if ((agentIds.length === 0 && teamIds.length === 0) || batchDeleting) return

    setBatchDeleting(true)
    setAgentFeedback(null)
    try {
      // 删除 Agent
      const agentResults = await Promise.allSettled(agentIds.map(async (id) => {
        const agent = agents.find((item) => item.id === id)
        if (!agent || agent.isBuiltin) throw new Error('Agent cannot be deleted: ' + id)
        await deleteAgent(id)
        return agent
      }))
      const succeededAgents = agentResults.flatMap((r) => r.status === 'fulfilled' ? [r.value] : [])
      const succeededAgentIds = new Set(succeededAgents.map((a) => a.id))
      const agentFailed = agentIds.length - succeededAgentIds.size

      for (const agent of succeededAgents) removeAgent(agent.id)
      setSelectedDeleteAgentIds((current) => {
        const next = new Set(current)
        for (const id of succeededAgentIds) next.delete(id)
        return next
      })
      if (selectedAgentId && succeededAgentIds.has(selectedAgentId)) {
        setSelectedAgentId(null)
        setAgentDetailOpen(false)
      }

      // 删除团队
      const teamResults = await Promise.allSettled(teamIds.map(async (id) => {
        const team = teams.find((t) => t.id === id)
        if (!team) throw new Error('Team not found: ' + id)
        await fetch('/api/teams/' + id, { method: 'DELETE' })
        return team
      }))
      const succeededTeams = teamResults.flatMap((r) => r.status === 'fulfilled' ? [r.value] : [])
      const succeededTeamIds = new Set(succeededTeams.map((t) => t.id))
      const teamFailed = teamIds.length - succeededTeamIds.size

      setSelectedDeleteTeamIds((current) => {
        const next = new Set(current)
        for (const id of succeededTeamIds) next.delete(id)
        return next
      })
      if (detailTeamId && succeededTeamIds.has(detailTeamId)) {
        setDetailTeamId(null)
        setDetailTeamOpen(false)
      }
      if (teamIds.length > 0) {
        fetch('/api/teams').then((r) => r.json()).then((d) => setTeams(d.teams ?? [])).catch(() => {})
      }

      const totalSucceeded = succeededAgentIds.size + succeededTeamIds.size
      const totalFailed = agentFailed + teamFailed
      if (totalFailed > 0) {
        setAgentFeedback({ type: 'error', message: '已删除 ' + totalSucceeded + ' 个，' + totalFailed + ' 个删除失败。' })
      } else {
        setBatchDeleteOpen(false)
        setAgentFeedback({ type: 'success', message: '已删除 ' + totalSucceeded + ' 个。' })
      }
    } catch (err) {
      console.error('[AgentWorkspace] batch delete failed', err)
      setAgentFeedback({ type: 'error', message: '批量删除失败，请稍后重试。' })
    } finally {
      setBatchDeleting(false)
    }
  }

  const toggleDeleteSelection = (agentId: string) => {
    setSelectedDeleteAgentIds((current) => {
      const next = new Set(current)
      if (next.has(agentId)) next.delete(agentId)
      else next.add(agentId)
      return next
    })
  }

  const toggleTeamDeleteSelection = (teamId: string) => {
    setSelectedDeleteTeamIds((current) => {
      const next = new Set(current)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  const deleteTargetAgent = deleteTargetAgentId ? agents.find((agent) => agent.id === deleteTargetAgentId) : null

  return (
    <div ref={agentWorkspaceScrollRef} className="h-full min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-0 items-start gap-3 p-4 xl:p-5">
        <section className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white shadow-[var(--agenthub-shadow-card)] dark:border-white/10 dark:bg-neutral-900">
        <div className="border-b border-slate-200 p-4 dark:border-white/10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight">Agent 库</h1>
              <p className="mt-1 text-[13px] text-slate-500">发现、配置和复用你的协作 Agent</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setUnifiedCreateOpen(true)} className="rounded-md bg-[var(--agenthub-accent,#2F5FD0)] hover:bg-[var(--agenthub-accent-hover,#244FB3)]">
                <Plus className="mr-2 size-4" />
                创建
              </Button>
              {agentView === 'mine' && (
                <Button
                  variant="outline"
                  disabled={selectedDeleteAgentIds.size === 0 && selectedDeleteTeamIds.size === 0 || batchDeleting}
                  onClick={() => setBatchDeleteOpen(true)}
                  className="rounded-md border-slate-200"
                >
                  <Trash2 className="mr-2 size-4" />
                  {(selectedDeleteAgentIds.size + selectedDeleteTeamIds.size) > 0 ? `批量删除 (${selectedDeleteAgentIds.size + selectedDeleteTeamIds.size})` : '批量删除'}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setAgentView('featured')
                  setAgentDetailOpen(false)
                  setSelectedAgentId(null)
                  setSelectedPresetId(null)
                  setSelectedDeleteAgentIds(new Set())
                  setSelectedDeleteTeamIds(new Set())
                }}
                className={cn(
                  'rounded-md border-slate-200',
                  agentView === 'featured' && 'border-slate-300 bg-slate-100 text-slate-900 hover:bg-slate-100',
                )}
              >
                精选 Agent
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setAgentView('mine')
                  setAgentDetailOpen(false)
                  setSelectedAgentId(null)
                  setSelectedPresetId(null)
                  setSelectedDeleteAgentIds(new Set())
                }}
                className={cn(
                  'rounded-md border-slate-200',
                  agentView === 'mine' && 'border-slate-300 bg-slate-100 text-slate-900 hover:bg-slate-100',
                )}
              >
                我的 Agent
              </Button>

            </div>
          </div>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={agentView === 'mine' ? '搜索我的 Agent、团队、模型或能力' : '搜索精选 Agent、预设或能力'}
              className="h-9 rounded-lg border-slate-200 bg-slate-50 pl-10"
            />
          </div>
          {agentView === 'featured' && (
            <HorizontalScrollControls className="mt-3" contentClassName="gap-2 pb-1" scrollAmount={220}>
              {featuredCategories.map((item) => (
                <button key={item} type="button" onClick={() => setTab(item)} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition', tab === item ? 'border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)] dark:border-[var(--agenthub-accent-border)] dark:bg-[var(--agenthub-accent-soft)] dark:text-[var(--agenthub-accent)]' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-400 dark:hover:border-white/15 dark:hover:bg-neutral-800 dark:hover:text-slate-100')}>
                  {item}
                </button>
              ))}
            </HorizontalScrollControls>
          )}
          {agentView === 'featured' && (
            <div className="mt-3 border-t border-slate-100 pt-3 dark:border-white/10">
              <div className="mb-2">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">精选场景</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">从场景卡片进入统一团队详情，召唤后直接创建会话</p>
              </div>
              <HorizontalScrollControls
                className="-mx-1"
                contentClassName="snap-x snap-mandatory gap-4 px-1 pb-3 pt-1"
                scrollAmount={380}
              >
                {SUMMON_TEAMS.filter((team) => team.featured).map((team) => (
                  <FeaturedTeamCard key={team.id} team={team} onOpen={() => onOpenTeamDetail(team)} />
                ))}
              </HorizontalScrollControls>
            </div>
          )}
        </div>

        <div className="space-y-4 p-4">
          {agentView === 'featured' ? (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-[15px] font-semibold tracking-tight text-slate-950 dark:text-slate-100">精选 Agent</h2>
                    <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">选择一个预设 Agent，直接开始对话</p>
                  </div>
                </div>
                <div className="min-h-[280px] pr-1">
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                    {visiblePresets.map((preset) => {
                      return (
                        <ResourcePresetCard
                          key={preset.id}
                          preset={preset}
                          starting={startingPresetId === preset.id}
                          selected={agentDetailOpen && selectedPreset?.id === preset.id}
                          onSelect={() => {
                            setSelectedPresetId(preset.id)
                            setAgentDetailOpen(true)
                          }}
                          onStart={() => void startPresetConversation(preset)}
                        />
                      )
                    })}
                  </div>
                  {filteredPresets.length > 0 && !hasMorePresets && (
                    <div className="py-4 text-center text-xs text-slate-400 dark:text-slate-500">已经到底了</div>
                  )}
                </div>
                {filteredPresets.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center dark:border-white/10 dark:bg-neutral-950/40">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">没有匹配的精选 Agent</div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">试试切换分类或调整搜索关键词。</p>
                  </div>
                )}
              </section>
            ) : (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">我的 Agent 与团队</h2>
                    <p className="mt-1 text-xs text-slate-500">自定义 Agent 和协作团队，可直接开始对话或继续配置</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    {(['all', 'agent', 'team'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setMineFilter(f)}
                        className={cn(
                          'rounded-md px-2.5 py-1 text-xs font-medium transition',
                          mineFilter === f
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        )}
                      >
                        {f === 'all' ? '全部' : f === 'agent' ? 'Agent' : '团队'}
                      </button>
                    ))}
                  </div>
                </div>
                {agentFeedback && (
                  <div className={cn(
                    'mb-3 flex items-center justify-between rounded-lg border px-3 py-2 text-xs',
                    agentFeedback.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-red-200 bg-red-50 text-red-600',
                  )}>
                    <span>{agentFeedback.message}</span>
                    <button onClick={() => setAgentFeedback(null)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
                  </div>
                )}
                {(mineFilter === 'all' || mineFilter === 'team') && teams.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">我的团队</h3>
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-neutral-800 dark:text-slate-400">{teams.length}</span>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                      {teams.map((team) => (
                        <TeamCard
                          key={team.id}
                          team={team}
                          selected={detailTeamOpen && detailTeamId === team.id}
                          selectable={agentView === 'mine'}
                          checked={selectedDeleteTeamIds.has(team.id)}
                          onToggleSelected={() => toggleTeamDeleteSelection(team.id)}
                          onSelect={() => {
                            setDetailTeamId(team.id)
                            setDetailTeamOpen(true)
                          }}
                          onStartChat={() => void startTeamConversation(team)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {(mineFilter === 'all' || mineFilter === 'agent') && (
                  <div className={cn('flex flex-col gap-2', mineFilter === 'all' && teams.length > 0 && 'mt-5')}>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">我的 Agent</h3>
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-neutral-800 dark:text-slate-400">{filteredAgents.length}</span>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                      {filteredAgents.map((agent) => (
                        <AgentCard
                          key={agent.id}
                          agent={agent}
                          selected={agentDetailOpen && selectedAgent?.id === agent.id}
                          selectable={agentView === 'mine'}
                          checked={selectedDeleteAgentIds.has(agent.id)}
                          onToggleSelected={() => toggleDeleteSelection(agent.id)}
                          onSelect={() => {
                            setSelectedAgentId(agent.id)
                            setAgentDetailOpen(true)
                          }}
                          onStart={() => void startConversation(agent)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {filteredAgents.length === 0 && teams.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
                    <div className="text-sm font-medium text-slate-900">还没有 Agent 或团队</div>
                    <p className="mt-2 text-xs text-slate-500">点击右上角「创建」添加自定义 Agent 或团队，或从精选 Agent 直接开始对话。</p>
                  </div>
                )}
              </section>
            )}
        </div>
        </section>

        {agentDetailOpen && selectedPreset && agentView === 'featured' && (
        <FeaturedPresetDetailPanel
          preset={selectedPreset}
          addedToMine={selectedPresetAdded}
          adding={addingPresetId === selectedPreset.id}
          onAddToMine={(preset) => void addPresetToMine(preset)}
          onClose={() => {
            setSelectedPresetId(null)
            setAgentDetailOpen(false)
          }}
        />
      )}
        {agentDetailOpen && selectedAgent && agentView === 'mine' && (
        <AgentDetailPanel
          agent={selectedAgent}
          deleting={deletingAgentId === selectedAgent.id}
          onStart={(agent) => void startConversation(agent)}
          onEdit={(agent) => {
            setEditingAgent(agent)
            setFormOpen(true)
          }}
          onDelete={(agent) => setDeleteTargetAgentId(agent.id)}
          onClose={() => {
            setSelectedAgentId(null)
            setAgentDetailOpen(false)
          }}
        />
      )}
      <UnifiedCreateDialog
        open={unifiedCreateOpen}
        onOpenChange={setUnifiedCreateOpen}
        onCreateAgent={() => setFormOpen(true)}
        onCreateTeam={() => setTeamFormOpen(true)}
      />
      <CreateTeamDialog
        open={teamFormOpen}
        onOpenChange={setTeamFormOpen}
        onCreated={() => {
          // 团队创建会连带新建多个 Agent：补全 store 与团队列表，避免会话头部
          // 因为查不到成员而显示成「0 位 Agent」。
          fetch('/api/agents')
            .then((r) => r.json())
            .then((d) => { if (d.agents) setAgents(d.agents) })
            .catch(() => {})
          fetch('/api/teams')
            .then((r) => r.json())
            .then((d) => setTeams(d.teams ?? []))
            .catch(() => {})
        }}
        onStartChat={(teamId) => void startTeamConversationById(teamId)}
      />
      <TeamDetailDialog
        teamId={detailTeamId}
        open={detailTeamOpen}
        onOpenChange={setDetailTeamOpen}
        onUpdated={() => {
          fetch('/api/teams').then((r) => r.json()).then((d) => setTeams(d.teams ?? [])).catch(() => {})
        }}
        onDeleted={() => {
          fetch('/api/teams').then((r) => r.json()).then((d) => setTeams(d.teams ?? [])).catch(() => {})
        }}
        onStartChat={(conv) => { upsertConversation(conv); setActiveConversation(conv.id); onOpenConversations() }}
      />
      <CreateAgentDialog open={formOpen} onOpenChange={(open) => {
        setFormOpen(open)
        if (!open) setEditingAgent(undefined)
      }} agent={editingAgent} />
      <Dialog open={Boolean(deleteTargetAgentId)} onOpenChange={(open) => {
        if (!open && !deletingAgentId) setDeleteTargetAgentId(null)
      }}>
        <DialogContent className="max-w-md border border-slate-200 bg-white dark:border-white/10 dark:bg-neutral-900">
          <DialogHeader>
            <DialogTitle>确认删除 Agent</DialogTitle>
            <DialogDescription>
              确定删除「{deleteTargetAgent ? getAgentDisplayName(deleteTargetAgent) : '该 Agent'}」吗？已使用该 Agent 的会话可能无法继续调用它。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargetAgentId(null)} disabled={Boolean(deletingAgentId)}>取消</Button>
            <Button onClick={() => void confirmDeleteAgent()} disabled={Boolean(deletingAgentId)} className="bg-red-600 text-white hover:bg-red-700">
              {deletingAgentId ? '删除中…' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={batchDeleteOpen} onOpenChange={(open) => {
        if (!open && !batchDeleting) setBatchDeleteOpen(false)
      }}>
        <DialogContent className="max-w-md border border-slate-200 bg-white dark:border-white/10 dark:bg-neutral-900">
          <DialogHeader>
            <DialogTitle>批量删除</DialogTitle>
            <DialogDescription>
              确定删除已选择的 {selectedDeleteAgentIds.size} 个 Agent 和 {selectedDeleteTeamIds.size} 个团队吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteOpen(false)} disabled={batchDeleting}>取消</Button>
            <Button onClick={() => void deleteSelected()} disabled={batchDeleting || (selectedDeleteAgentIds.size === 0 && selectedDeleteTeamIds.size === 0)} className="bg-red-600 text-white hover:bg-red-700">
              {batchDeleting ? '删除中…' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  )
}


function readFeaturedMyAgentIds() {
  if (typeof window === 'undefined') return new Set<string>()

  try {
    const raw = window.localStorage.getItem(FEATURED_MY_AGENT_IDS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

function writeFeaturedMyAgentIds(ids: Set<string>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(FEATURED_MY_AGENT_IDS_KEY, JSON.stringify(Array.from(ids)))
}

function ResourcePresetCard({
  preset,
  starting,
  selected,
  onSelect,
  onStart,
}: {
  preset: ResourceAgentPreset
  starting: boolean
  selected: boolean
  onSelect: () => void
  onStart: () => void
}) {
  return (
    <article
      className={cn(
        'group relative flex min-h-[200px] flex-col rounded-xl border bg-white p-4 shadow-[var(--agenthub-shadow-card)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:bg-neutral-900 dark:hover:border-white/15 dark:hover:shadow-black/20',
        selected ? 'border-[var(--agenthub-accent,#2F5FD0)] before:absolute before:left-0 before:top-3 before:h-8 before:w-[3px] before:rounded-r-full before:bg-[var(--agenthub-accent,#2F5FD0)] dark:border-[var(--agenthub-accent-border)]' : 'border-slate-200 dark:border-white/10',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-lg transition duration-200 dark:bg-neutral-800">
          <span aria-hidden="true">{preset.avatar}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-2">
            <h3 className={cn('line-clamp-2 flex-1 text-[15px] font-semibold leading-5 text-slate-950 dark:text-slate-50', getPresetDisplayName(preset).length > 22 && 'text-sm leading-5')}>
              {getPresetDisplayName(preset)}
            </h3>
            <span className="shrink-0 rounded-md border border-slate-100 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:border-white/10 dark:bg-neutral-800 dark:text-slate-300">{preset.category}</span>
          </div>
          <p className="mt-2 line-clamp-3 text-[12px] leading-5 text-slate-500 dark:text-slate-400">{preset.description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {preset.capabilities.slice(0, 2).map((capability) => (
          <span key={capability} className="rounded-md bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-neutral-800 dark:text-slate-300">
            {capability}
          </span>
        ))}
        {preset.capabilities.length > 2 && (
          <span className="rounded-md bg-white px-2 py-0.5 text-[11px] text-slate-400 dark:bg-neutral-900 dark:text-slate-500">+{preset.capabilities.length - 2}</span>
        )}
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
        <Button
          size="sm"
          onClick={onSelect}
          variant="outline"
          className="h-8 rounded-md border-slate-200 bg-white text-xs text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:bg-neutral-800"
        >
          详情
        </Button>
        <Button
          size="sm"
          disabled={starting}
          onClick={(e) => {
            e.stopPropagation()
            onStart()
          }}
          className="h-8 rounded-md bg-[var(--agenthub-accent,#2F5FD0)] text-xs text-white hover:bg-[var(--agenthub-accent-hover,#244FB3)] disabled:opacity-60"
        >
          {starting ? '创建中' : '开始对话'}
        </Button>
      </div>
    </article>
  )
}

function FeaturedPresetDetailPanel({
  preset,
  addedToMine,
  adding,
  onAddToMine,
  onClose,
}: {
  preset?: ResourceAgentPreset
  addedToMine: boolean
  adding: boolean
  onAddToMine: (preset: ResourceAgentPreset) => void
  onClose: () => void
}) {
  const [promptOpen, setPromptOpen] = useState(false)

  if (!preset) {
    return (
      <aside className="hidden w-[340px] shrink-0 self-start rounded-xl border border-slate-200 bg-white shadow-[var(--agenthub-shadow-card)] xl:sticky xl:top-[calc(var(--agenthub-titlebar-height,0px)+1rem)] xl:block">
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">选择一个精选 Agent 查看详情</div>
      </aside>
    )
  }

  return (
    <aside className="hidden w-[340px] shrink-0 self-start rounded-xl border border-slate-200 bg-white shadow-[var(--agenthub-shadow-card)] xl:sticky xl:top-[calc(var(--agenthub-titlebar-height,0px)+1rem)] xl:block">
      <div className="flex max-h-[calc(100vh-var(--agenthub-titlebar-height,0px)-2rem)] flex-col">
        <div className="shrink-0 border-b border-slate-200 p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xl">
              {preset.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-semibold tracking-tight text-slate-950">{getPresetDisplayName(preset)}</h2>
                <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">精选</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{preset.description}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-100"
              title="关闭详情"
              aria-label="关闭详情"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {preset.capabilities.slice(0, 2).map((capability) => (
              <span key={capability} className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-600">{capability}</span>
            ))}
            {preset.capabilities.length > 2 && (
              <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-400">+{preset.capabilities.length - 2}</span>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => onAddToMine(preset)}
            disabled={addedToMine || adding}
            className="mt-3 w-full rounded-xl border-slate-200 text-xs"
          >
            <Plus className="mr-2 size-4" />
            {addedToMine ? '已在我的 Agent' : adding ? '添加中…' : '添加到我的 Agent'}
          </Button>
        </div>

        <div className="agenthub-hide-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            <DetailSection icon={<SlidersHorizontal className="size-4" />} title="模型配置" aside={<SavedState />}>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500">
                      <Check className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-[var(--agenthub-accent)]">{preset.modelId}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">自定义模型 · WorkBuddy preset</div>
                    </div>
                  </div>
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                </div>
              </div>
            </DetailSection>

            <DetailSection icon={<FileText className="size-4" />} title="系统提示词" aside="摘要">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className={cn('text-xs leading-5 text-slate-600 transition-all duration-200', !promptOpen && 'line-clamp-4')}>
                  {preset.systemPrompt}
                </div>
                <button type="button" onClick={() => setPromptOpen((open) => !open)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--agenthub-accent)] transition hover:text-[var(--agenthub-accent-hover)]">
                  {promptOpen ? '收起' : '查看更多'}
                  <ChevronDown className={cn('size-3 transition-transform duration-200', promptOpen && 'rotate-180')} />
                </button>
              </div>
            </DetailSection>

            <DetailSection icon={<Wrench className="size-4" />} title="工具权限">
              <div className="space-y-2">
                {preset.toolNames.map((toolName) => (
                  <PermissionRow key={toolName} name={formatToolName(toolName)} code={toolName} />
                ))}
              </div>
            </DetailSection>

            <DetailSection icon={<History className="size-4" />} title="最近会话">
              <HistoryRow icon={<MessageCircle className="size-4" />} title="精选 Agent 可直接开始" description="点击开始对话后会自动进入单 Agent 会话" time="刚刚" />
            </DetailSection>

            <DetailSection icon={<FileCode2 className="size-4" />} title="最近产物">
              <HistoryRow icon={<FileText className="size-4" />} title={`${getPresetDisplayName(preset)} preset`} description="开始对话时会复用或创建对应 Agent 配置" time="预设" />
            </DetailSection>
        </div>
      </div>
    </aside>
  )
}

function AgentCard({
  agent,
  selected,
  selectable,
  checked,
  onToggleSelected,
  onSelect,
  onStart,
}: {
  agent: AgentRow
  selected: boolean
  selectable: boolean
  checked: boolean
  onToggleSelected: () => void
  onSelect: () => void
  onStart: () => void
}) {
  return (
    <article className={cn('relative rounded-lg border bg-white p-3.5 transition hover:border-slate-300 hover:bg-slate-50 dark:bg-neutral-900 dark:hover:border-white/15 dark:hover:bg-neutral-800/70', selected ? 'border-[var(--agenthub-accent,#2F5FD0)] before:absolute before:left-0 before:top-3 before:h-8 before:w-[3px] before:rounded-r-full before:bg-[var(--agenthub-accent,#2F5FD0)] dark:border-[var(--agenthub-accent-border)]' : 'border-slate-200 dark:border-white/10')}>
      {selectable && (
        <button
          type="button"
          aria-pressed={checked}
          title={checked ? '取消选择' : '选择用于批量删除'}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelected()
          }}
          className={cn(
            'absolute right-3 top-3 z-10 flex size-6 items-center justify-center rounded-md border text-xs transition',
            checked
              ? 'border-[var(--agenthub-accent,#2F5FD0)] bg-[var(--agenthub-accent,#2F5FD0)] text-white'
              : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-700 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-500 dark:hover:border-white/15 dark:hover:bg-neutral-800 dark:hover:text-slate-200',
          )}
        >
          {checked && <Check className="size-4" />}
        </button>
      )}
      <div className="flex items-start gap-3 pr-7">
        <AgentAvatar agent={agent} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">{getAgentDisplayName(agent)}</h3>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-neutral-800 dark:text-slate-400">{agent.isBuiltin ? '内置' : '自定义'}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{agent.description || '可配置的协作 Agent'}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {[agent.adapterName, agent.isOrchestrator ? '编排' : '执行'].map((tag) => (
          <span key={tag} className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-600 dark:border-white/10 dark:bg-neutral-800 dark:text-slate-300">{tag}</span>
        ))}
        <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] text-slate-400 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-500">+1</span>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/10">
        <div className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">{agent.modelId || 'default model'}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 rounded-md border-slate-300 bg-white text-xs text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:bg-neutral-800" onClick={onSelect}>详情</Button>
          <Button size="sm" variant="outline" className="h-8 rounded-md border-slate-300 bg-white text-xs text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:bg-neutral-800" onClick={onStart}>开始对话</Button>
        </div>
      </div>
    </article>
  )
}

function TeamCard({
  team,
  selected,
  selectable,
  checked,
  onToggleSelected,
  onSelect,
  onStartChat,
}: {
  team: TeamWithMembers & { memberCount: number }
  selected: boolean
  selectable: boolean
  checked: boolean
  onToggleSelected: () => void
  onSelect: () => void
  onStartChat: () => void
}) {
  return (
    <article className={cn('relative rounded-lg border bg-white p-3.5 transition hover:border-slate-300 hover:bg-slate-50 dark:bg-neutral-900 dark:hover:border-white/15 dark:hover:bg-neutral-800/70', selected ? 'border-[var(--agenthub-accent,#2F5FD0)] before:absolute before:left-0 before:top-3 before:h-8 before:w-[3px] before:rounded-r-full before:bg-[var(--agenthub-accent,#2F5FD0)] dark:border-[var(--agenthub-accent-border)]' : 'border-slate-200 dark:border-white/10')}>
      {selectable && (
        <button
          type="button"
          aria-pressed={checked}
          title={checked ? '取消选择' : '选择用于批量删除'}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelected()
          }}
          className={cn(
            'absolute right-3 top-3 z-10 flex size-6 items-center justify-center rounded-md border text-xs transition',
            checked
              ? 'border-[var(--agenthub-accent,#2F5FD0)] bg-[var(--agenthub-accent,#2F5FD0)] text-white'
              : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-700 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-500 dark:hover:border-white/15 dark:hover:bg-neutral-800 dark:hover:text-slate-200',
          )}
        >
          {checked && <Check className="size-4" />}
        </button>
      )}
      <div className="flex items-start gap-3 pr-7">
        <AgentAvatar agent={{ id: team.id, name: team.name }} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">{team.name}</h3>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-neutral-800 dark:text-slate-400">{team.memberCount} 人</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{team.description || '多 Agent 协作团队'}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-600 dark:border-white/10 dark:bg-neutral-800 dark:text-slate-300">团队</span>
        {team.members.find((m) => m.isLead) && (
          <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[10px] text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/30 dark:text-amber-400">含负责人</span>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/10">
        <div className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">{team.goal || '协作完成任务'}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 rounded-md border-slate-300 bg-white text-xs text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:bg-neutral-800" onClick={onSelect}>详情</Button>
          <Button size="sm" variant="outline" className="h-8 rounded-md border-slate-300 bg-white text-xs text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:bg-neutral-800" onClick={onStartChat}>开始对话</Button>
        </div>
      </div>
    </article>
  )
}

function AgentDetailPanel({
  agent,
  deleting,
  onStart,
  onEdit,
  onDelete,
  onClose,
}: {
  agent?: AgentRow
  deleting: boolean
  onStart: (agent: AgentRow) => void
  onEdit: (agent: AgentRow) => void
  onDelete: (agent: AgentRow) => void
  onClose: () => void
}) {
  const [promptOpen, setPromptOpen] = useState(false)

  if (!agent) {
    return (
      <aside className="hidden w-[340px] shrink-0 self-start rounded-xl border border-slate-200 bg-white shadow-[var(--agenthub-shadow-card)] xl:sticky xl:top-[calc(var(--agenthub-titlebar-height,0px)+1rem)] xl:block">
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">选择一个 Agent 查看详情</div>
      </aside>
    )
  }

  return (
    <aside className="hidden w-[340px] shrink-0 self-start rounded-xl border border-slate-200 bg-white shadow-[var(--agenthub-shadow-card)] xl:sticky xl:top-[calc(var(--agenthub-titlebar-height,0px)+1rem)] xl:block">
      <div className="flex max-h-[calc(100vh-var(--agenthub-titlebar-height,0px)-2rem)] flex-col">
        <div className="shrink-0 border-b border-slate-200 p-4">
          <div className="flex items-start gap-3">
            <div className="transition duration-200 hover:scale-105">
              <AgentAvatar agent={agent} size="lg" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-xl font-semibold tracking-tight text-slate-950">{getAgentDisplayName(agent)}</h2>
                <span className="rounded-full bg-[var(--agenthub-accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--agenthub-accent)]">{agent.isBuiltin ? '内置' : '自定义'}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{agent.description || '可配置的协作 Agent'}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-100"
              title="关闭详情"
              aria-label="关闭详情"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {agent.capabilities.map((capability) => (
              <span key={capability} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">{capability}</span>
            ))}
          </div>
          <Button onClick={() => onStart(agent)} className="mt-4 w-full rounded-xl bg-[var(--agenthub-accent)] shadow-sm shadow-none transition hover:-translate-y-0.5 hover:bg-[var(--agenthub-accent-hover)] hover:shadow-md">
            开始对话
          </Button>
          <Button
            variant="outline"
            onClick={() => onEdit(agent)}
            className="mt-2 w-full rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <Pencil className="mr-2 size-4" />
            编辑配置 / 绑定 MCP
          </Button>
          {!agent.isBuiltin && (
            <Button
              variant="outline"
              onClick={() => onDelete(agent)}
              disabled={deleting}
              className="mt-2 w-full rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="mr-2 size-4" />
              {deleting ? '删除中…' : '删除 Agent'}
            </Button>
          )}
        </div>

        <div className="agenthub-hide-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            <DetailSection icon={<SlidersHorizontal className="size-4" />} title="模型配置" aside={<SavedState />}>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500">
                      <Check className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-[var(--agenthub-accent)]">{agent.modelId || 'default model'}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">{agent.adapterName} · {agent.modelProvider ?? '默认 provider'}</div>
                    </div>
                  </div>
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                </div>
              </div>
            </DetailSection>

            <DetailSection icon={<FileText className="size-4" />} title="系统提示词" aside="摘要">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className={cn('text-xs leading-5 text-slate-600 transition-all duration-200', !promptOpen && 'line-clamp-4')}>
                  {agent.systemPrompt || '未配置系统提示'}
                </div>
                <button type="button" onClick={() => setPromptOpen((open) => !open)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--agenthub-accent)] transition hover:text-[var(--agenthub-accent-hover)]">
                  {promptOpen ? '收起' : '查看更多'}
                  <ChevronDown className={cn('size-3 transition-transform duration-200', promptOpen && 'rotate-180')} />
                </button>
              </div>
            </DetailSection>

            <DetailSection icon={<Wrench className="size-4" />} title="工具权限">
              <div className="space-y-2">
                {(agent.toolNames.length > 0 ? agent.toolNames : ['message']).map((toolName) => (
                  <PermissionRow key={toolName} name={formatToolName(toolName)} code={toolName} />
                ))}
                <CapabilityRows label="Skills" ids={agent.skillIds} empty="未绑定 Skills" />
                <CapabilityRows label="MCP" ids={agent.mcpServerIds} empty={agent.adapterName === 'custom' ? 'Custom adapter 当前暂不支持外部 MCP' : '未绑定 MCP Servers'} />
              </div>
            </DetailSection>

            <DetailSection icon={<History className="size-4" />} title="最近会话">
              <HistoryRow icon={<MessageCircle className="size-4" />} title="新建单聊入口" description="已接入原有会话创建和消息流" time="可用" />
            </DetailSection>

            <DetailSection icon={<FileCode2 className="size-4" />} title="最近产物">
              <HistoryRow icon={<FileText className="size-4" />} title="产物库联动" description="按 Agent 过滤待后端聚合字段补充" time="已接入" />
            </DetailSection>
        </div>
      </div>
    </aside>
  )
}



function PermissionRow({ name, code }: { name: string; code: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:border-slate-300 hover:bg-slate-100 dark:border-white/10 dark:bg-neutral-950/40 dark:hover:border-white/15 dark:hover:bg-neutral-800/70">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white text-slate-500 dark:bg-neutral-800 dark:text-slate-400">
        <Wrench className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">{name}</div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400 dark:text-slate-500">{code}</div>
      </div>
      <CheckCircle2 className="size-4 shrink-0 text-emerald-500 dark:text-emerald-300" />
    </div>
  )
}

function CapabilityRows({ label, ids, empty }: { label: string; ids: string[]; empty: string }) {
  if (ids.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-400 dark:border-white/10 dark:bg-neutral-900">
        {label}：{empty}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/10 dark:bg-neutral-950/40">
      <div className="mb-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <code key={id} className="max-w-full truncate rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500 ring-1 ring-slate-200 dark:bg-neutral-900 dark:text-slate-400 dark:ring-white/10">
            {id}
          </code>
        ))}
      </div>
    </div>
  )
}

function formatToolName(toolName: string) {
  const labels: Record<string, string> = {
    ask_user: '询问用户',
    bash: '运行命令',
    create_artifact: '创建产物',
    dispatch_to_agent: '调度 Agent（旧版）',
    fs_list: '浏览文件',
    fs_read: '读取文件',
    fs_write: '写入文件',
    message: '消息回复',
    read_attachment: '读取附件',
  }
  return labels[toolName] ?? toolName.replaceAll('_', ' ')
}


