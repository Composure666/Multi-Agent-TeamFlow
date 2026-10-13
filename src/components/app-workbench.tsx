'use client'

import {
  Archive,
  ArchiveRestore,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Coins,
  Copy,
  Grid2X2,
  Menu,
  MessageCircle,
  MessageSquare,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Users,
  Waypoints,
  X
} from 'lucide-react'
import { nanoid } from 'nanoid'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'

import { AgentAvatar } from '@/components/agent-avatar'
import { AgentRunDebugBoard } from '@/components/agent-run-debug-board'
import {
  SUMMON_SCENE_CATEGORIES,
  SUMMON_TEAMS,
  findOrchestratorAgent,
  getAgentDisplayName,
  includeOrchestrator,
  resolveOrCreateTeamAgents,
  type SceneCategoryId,
  type SummonableTeam,
} from '@/components/agent-catalog'
import { ContextMenu } from '@/components/conversation-context-menu'
import { AgentWorkspace } from '@/components/agent-workspace'
import { AnalyticsWorkspace } from '@/components/analytics-workspace'
import { AutomationWorkspace } from '@/components/automation-workspace'
import { ArtifactWorkspace } from '@/components/artifact-workspace'
import { CapabilityCenterWorkspace } from '@/components/capability-center-workspace'
import { ConversationWorkspace } from '@/components/conversation-workspace'
import { ExperienceLibrary } from '@/components/experience-library'
import { InformationCenterWorkspace } from '@/components/information-center-workspace'
import { MessageHighlightLayer } from '@/components/message-highlight-layer'
import { PromptEnhanceModal } from '@/components/prompt-enhance-modal'
import { SelectionPopover } from '@/components/selection-popover'
import { SettingsDialog } from '@/components/settings-dialog'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { WorkbenchViewRouter } from '@/components/workbench-view-router'
import { Meta } from '@/components/workbench-detail-primitives'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import type { AgentRow } from '@/db/schema'
import {
  createConversation,
  deleteConversation,
  fetchAgents,
  fetchConversations,
  fetchUsageSummary,
  optimizePrompt,
  renameConversation,
  sendMessage,
  setFsWriteApprovalMode,
  toggleArchiveConversation,
  togglePinConversation,
  uploadAttachment,
  type UsageSummary,
} from '@/lib/api'
import { BRAND_NAME, BRAND_TAGLINE_EN, BRAND_TAGLINE_ZH } from '@/lib/brand'
import { emitUiCommand } from '@/lib/ui-command-events'
import { cn } from '@/lib/utils'
import { useAgentList, useAppStore, useConversationList, type AppWorkbenchView } from '@/stores/app-store'
import { WORKBENCH_NAVIGATION } from '@/components/workbench-navigation'
import type { PromptEnhanceContext } from '@/shared/prompt-enhance'

type WorkbenchView = AppWorkbenchView

const navItems = WORKBENCH_NAVIGATION

export function AppWorkbench() {
  const view = useAppStore((s) => s.workbenchView)
  const setView = useAppStore((s) => s.setWorkbenchView)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const closeSettingsTarget = useAppStore((s) => s.closeSettingsTarget)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const [selectedTeam, setSelectedTeam] = useState<SummonableTeam | null>(null)
  const [teamDialogOpen, setTeamDialogOpen] = useState(false)
  const [summoningTeamId, setSummoningTeamId] = useState<string | null>(null)
  const [analyticsFocusMode, setAnalyticsFocusMode] = useState(false)
  const agents = useAgentList()
  const setConversations = useAppStore((s) => s.setConversations)
  const setAgents = useAppStore((s) => s.setAgents)
  const upsertConversation = useAppStore((s) => s.upsertConversation)
  const upsertAgent = useAppStore((s) => s.upsertAgent)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)
  const mobileSidebarOpen = useAppStore((s) => s.mobileSidebarOpen)
  const setMobileSidebarOpen = useAppStore((s) => s.setMobileSidebarOpen)

  useEffect(() => {
    fetchConversations().then(setConversations).catch(console.error)
    fetchAgents().then(setAgents).catch(console.error)
  }, [setAgents, setConversations])

  useEffect(() => {
    if (view !== 'analytics') setAnalyticsFocusMode(false)
  }, [view])

  const openTeamDetail = (team: SummonableTeam) => {
    setSelectedTeam(team)
    setTeamDialogOpen(true)
  }

  const handleSummonTeam = async (team: SummonableTeam) => {
    if (summoningTeamId) return
    setSummoningTeamId(team.id)
    try {
      const teamAgents = includeOrchestrator(await resolveOrCreateTeamAgents(team, agents, upsertAgent), agents)
      const uniqueAgentIds = teamAgents.map((agent) => agent.id)
      if (uniqueAgentIds.length === 0) return

      const conv = await createConversation({
        title: team.name,
        mode: uniqueAgentIds.length > 1 ? 'group' : 'single',
        agentIds: uniqueAgentIds,
      })
      upsertConversation(conv)
      setActiveConversation(conv.id)
      setTeamDialogOpen(false)
      setSelectedTeam(null)
      setView('conversations')
    } catch (err) {
      console.error('[AppWorkbench] summon team failed', err)
    } finally {
      setSummoningTeamId(null)
    }
  }

  const currentViewLabel = navItems.find((item) => item.id === view)?.label ?? BRAND_NAME
  const openMobileSidebar = () => setMobileSidebarOpen(true)
  const closeMobileSidebar = () => setMobileSidebarOpen(false)
  const changeViewFromMobile = (nextView: WorkbenchView) => {
    setView(nextView)
    setMobileSidebarOpen(false)
  }
  const openSettingsFromMobile = () => {
    openSettingsTarget(null)
    setMobileSidebarOpen(false)
  }

  return (
    <div className="flex h-full min-h-0 bg-gradient-to-b from-[#FCFDFF] to-[#F4F6FB] dark:from-[#12151B] dark:to-[#0F1115] text-slate-950 dark:text-slate-50">
      <WorkbenchNav view={view} onViewChange={setView} onOpenSettings={() => openSettingsTarget(null)} />
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {view !== 'conversations' && !analyticsFocusMode && <MobileWorkbenchTopBar currentLabel={currentViewLabel} onOpen={openMobileSidebar} onOpenInformationCenter={() => setView('information-center')} />}
        <WorkbenchViewRouter
          view={view}
          renderers={{
            'new-task': () => <NewTaskView onOpenConversations={() => setView('conversations')} />,
            conversations: () => <ConversationWorkspace />,
            agents: () => <AgentWorkspace onOpenConversations={() => setView('conversations')} onOpenTeamDetail={openTeamDetail} />,
            'capability-center': () => <CapabilityCenterWorkspace />,
            artifacts: () => <ArtifactWorkspace onOpenConversations={() => setView('conversations')} />,
            experiences: () => <ExperienceLibrary agents={agents.map((a) => ({ id: a.id, name: a.name }))} />,
            automation: () => (
              <AutomationWorkspace
                onOpenConversation={(conversationId) => {
                  setActiveConversation(conversationId)
                  setView('conversations')
                }}
              />
            ),
            'information-center': () => <InformationCenterWorkspace />,
            'run-board': () => <AgentRunDebugBoard onFocusChange={setAnalyticsFocusMode} />,
            analytics: () => <AnalyticsWorkspace />,
          }}
        />
      </main>
      <MobileWorkbenchDrawer open={mobileSidebarOpen} view={view} onClose={closeMobileSidebar} onViewChange={changeViewFromMobile} onOpenSettings={openSettingsFromMobile} />
      <SettingsDialog open={settingsOpen} onOpenChange={(open) => {
        if (!open) closeSettingsTarget()
        else openSettingsTarget(null)
      }} />
      <TeamSummonDialog
        team={selectedTeam}
        open={teamDialogOpen}
        onOpenChange={(open) => {
          setTeamDialogOpen(open)
          if (!open) setSelectedTeam(null)
        }}
        onSummon={handleSummonTeam}
        summoning={Boolean(summoningTeamId)}
      />
      <SelectionPopover />
      <MessageHighlightLayer />
    </div>
  )
}

function TeamSummonDialog({
  team,
  open,
  onOpenChange,
  onSummon,
  summoning,
}: {
  team: SummonableTeam | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSummon: (team: SummonableTeam) => Promise<void>
  summoning: boolean
}) {
  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [workflowDraft, setWorkflowDraft] = useState('')
  const [workflowCustom, setWorkflowCustom] = useState<string | null>(null)

  // 按 team 切换时同步本地自定义工作流；默认工作流随预设走，无需存储
  useEffect(() => {
    setWorkflowOpen(false)
    setWorkflowCustom(null)
    if (!team || typeof window === 'undefined') return
    try {
      setWorkflowCustom(window.localStorage.getItem(`agenthub.teamWorkflow.${team.id}`))
    } catch {
      setWorkflowCustom(null)
    }
  }, [team])

  const openWorkflowSettings = () => {
    if (!team) return
    setWorkflowDraft(workflowCustom ?? team.workflow)
    setWorkflowOpen(true)
  }

  const saveWorkflow = () => {
    if (!team) return
    const value = workflowDraft.trim()
    try {
      if (value) window.localStorage.setItem(`agenthub.teamWorkflow.${team.id}`, value)
      else window.localStorage.removeItem(`agenthub.teamWorkflow.${team.id}`)
    } catch {
      // 忽略存储异常
    }
    setWorkflowCustom(value || null)
    setWorkflowOpen(false)
  }

  const resetWorkflow = () => {
    if (!team) return
    try {
      window.localStorage.removeItem(`agenthub.teamWorkflow.${team.id}`)
    } catch {
      // 忽略存储异常
    }
    setWorkflowCustom(null)
    setWorkflowOpen(false)
  }

  if (!team) return null

  const category = SUMMON_SCENE_CATEGORIES.find((item) => item.id === team.category)
  const leadMember = team.members.find((member) => member.isLead) ?? team.members[0]
  const hiddenMemberCount = Math.max(team.members.length - 3, 0)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(760px,calc(100vh-2rem))] max-w-3xl grid-rows-none flex-col overflow-hidden border border-slate-200 bg-white p-0 dark:border-white/10 dark:bg-[#1C1F26] sm:max-w-3xl">
        <div className={cn('relative overflow-hidden bg-gradient-to-br px-5 pb-5 pt-6 text-white', team.coverClassName)}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.12),rgba(15,23,42,0.72))]" />
          <DialogHeader className="relative z-10 gap-3 pr-10">
            <div className="flex items-start gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/12 text-3xl shadow-sm backdrop-blur">
                {leadMember?.avatar ?? '🤖'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur">{category?.label ?? '场景'}</span>
                  <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur">{team.type === 'team' ? '多 Agent 团队' : '单 Agent'}</span>
                  <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur">{team.heat}</span>
                </div>
                <DialogTitle className="truncate text-2xl font-semibold tracking-tight text-white">{team.name}</DialogTitle>
                <DialogDescription className="mt-2 max-w-2xl text-sm leading-6 text-white/78">{team.description}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-5 pb-8">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-[#121418]/70">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                  工作流说明
                  {workflowCustom && (
                    <span className="ml-2 inline-flex translate-y-[-1px] items-center rounded-full bg-[var(--agenthub-accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--agenthub-accent)]">已自定义</span>
                  )}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-md text-xs"
                  onClick={openWorkflowSettings}
                  title="自定义工作流说明"
                >
                  <Settings className="mr-1.5 size-3.5" />
                  设置
                </Button>
              </div>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{workflowCustom ?? team.workflow}</p>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-950 dark:text-slate-100">擅长领域</h3>
              <div className="flex flex-wrap gap-2">
                {team.tags.map((tag) => (
                  <span key={tag} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                    {tag}
                  </span>
                ))}
              </div>
            </section>

            {team.type === 'team' ? (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-100">团队成员</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{team.members.length} 位 Agent</span>
                </div>
                <div className="max-h-[250px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {team.members.map((member) => (
                      <div key={member.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#252932]">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-lg dark:border-white/10 dark:bg-[#121418]">{member.avatar}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{member.name}</div>
                            {member.isLead && <span className="shrink-0 rounded-full bg-[var(--agenthub-accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--agenthub-accent)]">主理人</span>}
                          </div>
                          <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="truncate">{member.role}</span>
                            <span className="shrink-0">·</span>
                            <span className="truncate font-mono">{member.modelName}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : (
              <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#252932]">
                <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-100">能力介绍</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{team.systemPromptTemplate}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex size-7 items-center justify-center rounded-md bg-slate-100 text-base dark:bg-[#121418]">{leadMember.avatar}</span>
                  <span>{leadMember.name}</span>
                  <span>·</span>
                  <span className="font-mono">{leadMember.modelName}</span>
                </div>
              </section>
            )}

            <section className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-[#121418]/70">
              <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-100">召唤上下文</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{team.systemPromptTemplate}</p>
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="sticky bottom-0 z-10 m-0 shrink-0 flex-row items-center justify-between rounded-none border-t border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#1C1F26]">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex -space-x-2">
              {team.members.slice(0, 3).map((member) => (
                <span key={member.id} className="flex size-7 items-center justify-center rounded-full border border-white bg-slate-100 text-sm dark:border-[#1C1F26] dark:bg-[#252932]">{member.avatar}</span>
              ))}
              {hiddenMemberCount > 0 && <span className="flex size-7 items-center justify-center rounded-full border border-white bg-slate-200 text-[10px] text-slate-600 dark:border-[#1C1F26] dark:bg-[#252932] dark:text-slate-300">+{hiddenMemberCount}</span>}
            </div>
            <span className="truncate text-xs text-slate-500 dark:text-slate-400">{team.type === 'team' ? `${team.members.length} 位成员协作` : '单 Agent 对话'}</span>
          </div>
          <Button onClick={() => void onSummon(team)} disabled={summoning} className="shrink-0 rounded-md bg-[var(--agenthub-accent)] px-4 text-white hover:bg-[var(--agenthub-accent-hover)]">
            {summoning ? '召唤中' : `召唤 ${team.name}`}
          </Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>

      <Dialog open={workflowOpen} onOpenChange={setWorkflowOpen}>
        <DialogContent className="border border-slate-200 bg-white dark:border-white/10 dark:bg-[#1C1F26] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>工作流设置</DialogTitle>
            <DialogDescription>
              自定义「{team.name}」的工作流说明，将覆盖默认文案；清空后保存可恢复默认。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={workflowDraft}
            onChange={(e) => setWorkflowDraft(e.target.value)}
            rows={6}
            placeholder="输入自定义工作流说明…"
            className="resize-none text-sm"
          />
          <DialogFooter>
            {workflowCustom && (
              <Button variant="ghost" onClick={resetWorkflow} className="text-xs text-slate-500 sm:mr-auto">
                恢复默认
              </Button>
            )}
            <Button variant="outline" onClick={() => setWorkflowOpen(false)}>
              取消
            </Button>
            <Button onClick={saveWorkflow} className="rounded-md bg-[var(--agenthub-accent)] text-white hover:bg-[var(--agenthub-accent-hover)]">
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function MobileWorkbenchTopBar({
  currentLabel,
  onOpen,
  onOpenInformationCenter,
}: {
  currentLabel: string
  onOpen: () => void
  onOpenInformationCenter: () => void
}) {
  const unreadNotificationCount = useAppStore((s) => s.unreadNotificationCount)
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-white/10 dark:bg-neutral-900 md:hidden">
      <button
        type="button"
        onClick={onOpen}
        className="flex size-10 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 active:bg-slate-200 dark:text-slate-300 dark:hover:bg-neutral-800 dark:active:bg-neutral-700"
        title="打开菜单"
      >
        <Menu className="size-5 stroke-[2.2]" />
      </button>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-900 text-white dark:border-white/10 dark:bg-neutral-800">
        <Sparkles className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{BRAND_NAME}</div>
        <div className="truncate text-xs text-slate-500 dark:text-slate-400">{currentLabel}</div>
      </div>
      <button
        type="button"
        onClick={onOpenInformationCenter}
        className="relative flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200 dark:text-slate-400 dark:hover:bg-neutral-800 dark:hover:text-slate-100"
        title="信息中心"
        aria-label="信息中心"
      >
        <Bell className="size-4 stroke-[2.2]" />
        {unreadNotificationCount > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-[var(--agenthub-accent)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
            {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
          </span>
        )}
      </button>
      <ThemeToggle className="size-8 rounded-lg text-slate-500 dark:text-slate-400" />
    </div>
  )
}

function MobileWorkbenchDrawer({
  open,
  view,
  onClose,
  onViewChange,
  onOpenSettings,
}: {
  open: boolean
  view: WorkbenchView
  onClose: () => void
  onViewChange: (view: WorkbenchView) => void
  onOpenSettings: () => void
}) {
  const [accountOpen, setAccountOpen] = useState(false)
  const usage = useUsageSummary(open && accountOpen)
  const unreadNotificationCount = useAppStore((s) => s.unreadNotificationCount)

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="关闭菜单"
          className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[1px] md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        aria-hidden={!open}
        aria-label="移动工作台菜单"
        inert={!open}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[min(86vw,320px)] flex-col border-r border-slate-200 bg-white shadow-lg transition-transform duration-200 dark:border-white/10 dark:bg-neutral-900 md:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 dark:border-white/10">
          <button type="button" onClick={() => onViewChange('new-task')} className="flex min-w-0 items-center gap-3 text-left">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-900 text-white dark:border-white/10 dark:bg-neutral-800">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">{BRAND_NAME}</div>
              <div className="truncate text-xs text-slate-500 dark:text-slate-400">{BRAND_TAGLINE_ZH}</div>
            </div>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭菜单"
            className="flex size-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200 dark:text-slate-400 dark:hover:bg-neutral-800 dark:hover:text-slate-100 dark:active:bg-neutral-700"
            title="关闭菜单"
          >
            <X className="size-4 stroke-[2.2]" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-neutral-950/40">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-900 dark:text-slate-100">
              <CheckCircle2 className="size-3.5 text-emerald-500 dark:text-emerald-300" />
              个人工作区
            </div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">管理本地会话、Agent、产物与自动化任务。</p>
          </div>

          <button
            type="button"
            onClick={() => onViewChange('new-task')}
            className={cn(
              'mb-3 flex min-h-10 w-full items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 text-left text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 active:scale-[0.99] dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:border-white/15 dark:hover:bg-neutral-800',
              view === 'new-task' && 'border-[var(--agenthub-accent,#2F5FD0)] text-[var(--agenthub-accent,#2F5FD0)]',
            )}
          >
            <Plus className="size-5" />
            <span className="min-w-0 flex-1 truncate">新建任务</span>
          </button>

          <nav className="space-y-4" aria-label="工作台导航">
            {(['primary', 'workspace'] as const).map((group) => (
              <div key={group} className="space-y-1.5">
                <div className="px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                  {group === 'primary' ? '协作' : '工作区'}
                </div>
                {navItems.filter((item) => item.group === group).map((item) => {
                  const Icon = item.icon
                  const active = view === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onViewChange(item.id)}
                      className={cn(
                        'relative flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition active:scale-[0.99]',
                        active
                          ? 'bg-[#E7F0FF] font-semibold text-[var(--agenthub-accent,#2F5FD0)] before:absolute before:left-0 before:top-2 before:h-6 before:w-[3px] before:rounded-r-full before:bg-[var(--agenthub-accent,#2F5FD0)] dark:bg-neutral-800'
                          : 'text-slate-600 hover:bg-[#EEF5FF] active:bg-slate-200 dark:text-slate-400 dark:hover:bg-neutral-800 dark:active:bg-neutral-700',
                      )}
                    >
                      <Icon className="size-5 stroke-[2.1]" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.id === 'information-center' && unreadNotificationCount > 0 && (
                        <span className="rounded-full bg-[var(--agenthub-accent)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                          {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
        </div>

        <div className="space-y-2 border-t border-slate-100 p-3 dark:border-white/10">
          {accountOpen && (
            <UserAccountOverview usage={usage} onReload={usage.reload} onOpenSettings={onOpenSettings} onClose={() => setAccountOpen(false)} />
          )}

          <button
            type="button"
            onClick={() => emitUiCommand('open-user-guide')}
            className="flex min-h-10 w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-600 transition active:scale-[0.99] hover:border-slate-300 hover:bg-[#EEF4FF] dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:border-white/15 dark:hover:bg-neutral-800"
          >
            <CircleHelp className="size-5 stroke-[2.1]" />
            <span className="min-w-0 flex-1 truncate">使用指南</span>
          </button>

          <button
            type="button"
            onClick={() => setAccountOpen((expanded) => !expanded)}
            aria-expanded={accountOpen}
            className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-slate-200 bg-white text-left transition hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100 dark:border-white/10 dark:bg-neutral-900 dark:hover:border-white/15 dark:hover:bg-neutral-800 dark:active:bg-neutral-700"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">A</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-medium text-slate-900">Workspace</span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">Local</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                本地模式
              </div>
            </div>
            <ChevronDown className={cn('size-4 shrink-0 text-slate-400 transition-transform', accountOpen && 'rotate-180')} />
          </button>
        </div>
      </aside>
    </>
  )
}

function useUsageSummary(enabled: boolean) {
  const [data, setData] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const summary = await fetchUsageSummary()
      setData(summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled || data || loading) return
    void reload()
  }, [data, enabled, loading, reload])

  return { data, loading, error, reload }
}

function UserAccountOverview({
  usage,
  onReload,
  onOpenSettings,
  onClose,
}: {
  usage: { data: UsageSummary | null; loading: boolean; error: string | null }
  onReload: () => void
  onOpenSettings: () => void
  onClose?: () => void
}) {
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)
  const topModels = usage.data?.byModel.slice(0, 2) ?? []
  const topConversations = usage.data?.topConversations.slice(0, 3) ?? []

  return (
    <div className="max-h-[52vh] min-w-0 overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-[var(--agenthub-shadow-card)] dark:border-white/10 dark:bg-neutral-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-neutral-800">A</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="truncate text-xs font-semibold text-slate-900 dark:text-slate-50">Workspace</div>
              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">Local</span>
            </div>
            <div className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">本地单用户 · 用量概览</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">已连接</span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex size-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-neutral-800 dark:hover:text-slate-100"
              aria-label="关闭账户概览"
              title="关闭账户概览"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {usage.loading && !usage.data ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-5 text-center text-xs text-slate-500 dark:border-white/10 dark:bg-neutral-950/40 dark:text-slate-400">加载用量数据...</div>
      ) : usage.error ? (
        <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-600">
          <div className="line-clamp-2">{usage.error}</div>
          <button type="button" onClick={onReload} className="mt-2 font-medium text-rose-700 hover:text-rose-900">重试</button>
        </div>
      ) : usage.data ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Meta label="今日 Token" value={formatTok(usage.data.today.totalTokens)} />
            <Meta label="本周 Token" value={formatTok(usage.data.week.totalTokens)} />
          </div>

          {topModels.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-slate-400">
                <span>常用模型</span>
                <span>{usage.data.today.runs} 次今日运行</span>
              </div>
              {topModels.slice(0, 1).map((model) => (
                <UsageBarRow key={model.model} label={model.model} value={model.totalTokens} runs={model.runs} max={topModels[0].totalTokens} />
              ))}
            </div>
          )}

          {topConversations.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">最近高频会话</div>
              {topConversations.slice(0, 2).map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setActiveConversation(conversation.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left text-xs transition hover:bg-[#EEF4FF] hover:text-slate-900 dark:hover:bg-neutral-800 dark:hover:text-slate-100"
                  title={`更新时间 ${new Date(conversation.updatedAt).toLocaleString('zh-CN')}`}
                >
                  <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                  <span className="shrink-0 font-mono text-[11px] text-slate-400">
                    <Coins className="mr-1 inline size-3" />
                    {formatTok(conversation.totalTokens)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {usage.data.allTime.runs === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500 dark:border-white/10 dark:bg-neutral-950/40 dark:text-slate-400">还没有用量数据，和 Agent 对话后会显示在这里。</div>
          )}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onReload}
          disabled={usage.loading}
          className="flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-[#EEF4FF] hover:text-slate-900 disabled:opacity-50 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:border-white/15 dark:hover:bg-neutral-800 dark:hover:text-slate-100"
        >
          <BarChart3 className="size-3.5" />
          {usage.loading ? '刷新中' : '刷新'}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-[#EEF4FF] hover:text-slate-900 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:border-white/15 dark:hover:bg-neutral-800 dark:hover:text-slate-100"
        >
          <Settings className="size-3.5" />
          设置
        </button>
      </div>
    </div>
  )
}

function UsageBarRow({ label, value, runs, max }: { label: string; value: number; runs: number; max: number }) {
  const pct = max > 0 ? (value * 100) / max : 0

  return (
    <div className="space-y-1 rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-neutral-950/40">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate font-mono text-slate-600 dark:text-slate-300">{label}</span>
        <span className="shrink-0 font-mono text-[11px] text-slate-400 dark:text-slate-500">{formatTok(value)} · {runs}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-neutral-800">
        <div className="h-full rounded-full bg-[var(--agenthub-accent,#2F5FD0)] transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function formatTok(n: number): string {
  if (n < 1000) return `${n}`
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

function WorkbenchNav({
  view,
  onViewChange,
  onOpenSettings,
}: {
  view: WorkbenchView
  onViewChange: (view: WorkbenchView) => void
  onOpenSettings: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [navHovered, setNavHovered] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const hasAutomationResultNotice = useAppStore((s) => Object.keys(s.automationResultNotices).length > 0)
  const unreadNotificationCount = useAppStore((s) => s.unreadNotificationCount)
  const compact = collapsed || ((view === 'analytics' || view === 'run-board') && !navHovered)
  const usage = useUsageSummary(accountOpen && !compact)

  return (
    <aside
      onMouseEnter={() => (view === 'analytics' || view === 'run-board') && !collapsed && setNavHovered(true)}
      onMouseLeave={() => (view === 'analytics' || view === 'run-board') && setNavHovered(false)}
      className={cn('hidden h-full min-h-0 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-3 transition-[width] duration-200 dark:border-white/10 dark:bg-neutral-900 md:flex', compact ? 'w-[72px]' : view === 'conversations' || view === 'new-task' ? 'w-[288px]' : 'w-[260px]')}
    >
      <div className={cn('mb-3 flex items-center gap-2 px-2', compact && 'flex-col px-0')}>
        <button
          type="button"
          onClick={() => onViewChange('new-task')}
          className={cn('flex min-w-0 items-center gap-2 text-left', compact ? 'w-full flex-col justify-center' : 'flex-1')}
          title={compact ? BRAND_NAME : undefined}
        >
          <img
            src="/icons/agenthub-mark-32.png"
            alt={BRAND_NAME}
            className="size-8 shrink-0 rounded-lg object-cover"
          />
          {/* 72px 窄轨放不下整名，按品牌规范折成两行：Multi-Agent / TeamFlow */}
          {compact && (
            <span className="text-center text-[11px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-50">
              <span className="block">Multi-Agent</span>
              <span className="block">TeamFlow</span>
            </span>
          )}
          {!compact && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight dark:text-slate-50">{BRAND_NAME}</div>
              <div className="truncate text-[11px] text-slate-500/60 dark:text-slate-400/60">{BRAND_TAGLINE_EN}</div>
            </div>
          )}
        </button>
        {!compact && (
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle className="size-8 rounded-lg text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-100" />
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-neutral-800 dark:hover:text-slate-100"
              title="设置"
            >
              <Settings className="size-4 stroke-[2.2]" />
            </button>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-neutral-800 dark:hover:text-slate-100"
              title="收起侧边栏"
            >
              <Menu className="size-4 stroke-[2.2]" />
            </button>
          </div>
        )}
        {compact && (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            title="展开侧边栏"
          >
            <Menu className="size-4 stroke-[2.2]" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => onViewChange('new-task')}
        className={cn(
          'mb-2 flex h-11 items-center justify-center gap-2 rounded-[14px] border border-slate-200 bg-white px-3 text-[15px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-[#EEF5FF] hover:text-[var(--agenthub-accent,#2F5FD0)] dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:border-white/15 dark:hover:bg-neutral-800 dark:hover:text-slate-50',
          compact && 'px-0',
          view === 'new-task' && 'border-[var(--agenthub-accent,#2F5FD0)] bg-[#E7F0FF] font-semibold text-[var(--agenthub-accent,#2F5FD0)] dark:border-white/15 dark:bg-[#1E2A3A] dark:text-slate-50',
        )}
      >
        <Plus className="size-4" />
        {!compact && <span className="min-w-0 flex-1 text-left">新建任务</span>}
        {!compact && <span className="ml-auto text-[10px] font-normal text-slate-400">Ctrl + N</span>}
      </button>

      <nav className="shrink-0 space-y-1">
        {navItems.filter((item) => item.id !== 'new-task').map((item) => {
          const Icon = item.icon
          const active = view === item.id
          const showAutomationResultNotice = item.id === 'conversations' && hasAutomationResultNotice && !active
          const showUnreadNotifications = item.id === 'information-center' && unreadNotificationCount > 0
          return (
            <Fragment key={item.id}>
              {item.id === 'run-board' && !compact && (
                <div className="mb-1 mt-4 border-t border-slate-100 px-[18px] pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-white/10">
                  分析
                </div>
              )}
              <button
                type="button"
                onClick={() => onViewChange(item.id)}
                title={compact ? item.label : undefined}
                className={cn(
                  'relative flex w-full items-center gap-2.5 rounded-[14px] px-[18px] text-[15px] transition',
                  'h-9',
                  compact && 'justify-center px-0',
                  item.id === 'run-board' && !compact && 'pl-5',
                  active
                    ? 'bg-[#E7F0FF] font-semibold text-[var(--agenthub-accent,#2F5FD0)]  dark:bg-[#1E2A3A]'
                    : 'font-medium text-slate-600 hover:bg-[#EEF5FF] hover:text-slate-900 dark:text-slate-400 dark:hover:bg-neutral-800 dark:hover:text-slate-100',
                  showAutomationResultNotice && 'animate-pulse ring-1 ring-[var(--agenthub-accent-border)]',
                )}
              >
                <Icon className={cn('size-4 shrink-0 stroke-[2.2]', active && 'stroke-[2.5]')} />
                {!compact && item.label}
                {showAutomationResultNotice && (
                  <span className={cn('ml-auto size-2 rounded-full bg-[var(--agenthub-accent)]', compact && 'absolute right-2 top-2')} title="有自动化任务结果生成" />
                )}
                {showUnreadNotifications && (
                  <span className={cn('ml-auto rounded-full bg-[var(--agenthub-accent)] px-1.5 py-0.5 text-[10px] font-semibold text-white', compact && 'absolute right-1 top-1 px-1')} title="未读通知">
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                  </span>
                )}
              </button>
            </Fragment>
          )
        })}
      </nav>

      {!compact && view === 'conversations' && (
        <div className="mt-2 min-h-0 flex-1 overflow-hidden border-t border-slate-100 pt-3 dark:border-white/10">
          <ConversationListPanel variant="embedded" />
        </div>
      )}

      {(!compact && view !== 'conversations') && <div className="min-h-3 flex-1" />}

      <div className="relative shrink-0 space-y-2 pt-3">
        {accountOpen && !compact && (
          <div className="absolute bottom-full left-0 z-50 mb-2 w-[300px]">
            <UserAccountOverview usage={usage} onReload={usage.reload} onOpenSettings={onOpenSettings} onClose={() => setAccountOpen(false)} />
          </div>
        )}

        {/* 使用指南常驻入口。首次进入会自动弹一次，关掉之后靠这里再打开。
            走 ui-command 而不是本地 state —— 指南弹窗挂在根布局（app/page.tsx），不在本组件树里。 */}
        <button
          type="button"
          onClick={() => emitUiCommand('open-user-guide')}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white text-left text-slate-600 transition hover:border-slate-300 hover:bg-[#EEF4FF] hover:text-slate-900 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:border-white/15 dark:hover:bg-neutral-800 dark:hover:text-slate-100',
            compact ? 'justify-center px-2 py-2' : 'px-2 py-2',
          )}
          title="使用指南"
          aria-label="使用指南"
        >
          <CircleHelp className="size-4 shrink-0" />
          {!compact && <span className="text-xs font-medium">使用指南</span>}
        </button>

        <button
          type="button"
          onClick={() => compact ? setCollapsed(false) : setAccountOpen((open) => !open)}
          aria-expanded={accountOpen && !compact}
          className={cn('w-full rounded-lg border border-slate-200 bg-white text-left transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-neutral-900 dark:hover:border-white/15 dark:hover:bg-neutral-800', compact && 'px-2', !compact && 'p-2')}
          title={compact ? '展开账户概览' : accountOpen ? '收起账户概览' : '展开账户概览'}
        >
          <div className={cn('flex items-center gap-2', compact && 'justify-center')}>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">A</div>
            {!compact && (
              <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <div className="truncate text-xs font-medium">Workspace</div>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">Local</span>
              </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  本地模式
                </div>
              </div>
            )}
            {!compact && <ChevronDown className={cn('size-4 shrink-0 text-slate-400 transition-transform', accountOpen && 'rotate-180')} />}
          </div>
        </button>
      </div>
    </aside>
  )
}

function NewTaskView({
  onOpenConversations,
}: {
  onOpenConversations: () => void
}) {
  const agents = useAgentList()
  const defaultAgent = findOrchestratorAgent(agents) ?? agents[0]
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
  const [selectedTeam, setSelectedTeam] = useState<{ id: string; name: string } | null>(null)
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [approvalMode, setApprovalMode] = useState<'auto' | 'review'>('review')
  const [uploading, setUploading] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [enhanceOpen, setEnhanceOpen] = useState(false)
  const [enhancingPrompt, setEnhancingPrompt] = useState(false)
  const [enhancedText, setEnhancedText] = useState('')
  const [enhanceError, setEnhanceError] = useState<string | null>(null)
  const [enhanceOriginalText, setEnhanceOriginalText] = useState('')
  const [activeCategory, setActiveCategory] = useState<SceneCategoryId>(SUMMON_SCENE_CATEGORIES[0].id)
  const [activeSubcategoryId, setActiveSubcategoryId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const upsertConversation = useAppStore((s) => s.upsertConversation)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)
  const addLocalUserMessage = useAppStore((s) => s.addLocalUserMessage)
  const replaceLocalMessageId = useAppStore((s) => s.replaceLocalMessageId)
  const upsertMessage = useAppStore((s) => s.upsertMessage)
  const upsertAgent = useAppStore((s) => s.upsertAgent)
  const [selectingTeamId, setSelectingTeamId] = useState<string | null>(null)
  const [sceneAgentError, setSceneAgentError] = useState<string | null>(null)
  const [contentOverflow, setContentOverflow] = useState(false)
  const taskInputRef = useRef<HTMLTextAreaElement>(null)

  const handleTaskPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      setPendingFiles((prev) => [...prev, ...files])
    }
  }

  useEffect(() => {
    const el = taskInputRef.current
    if (!el) return
    setContentOverflow(el.scrollHeight > el.clientHeight + 4)
  }, [content])

  const activeAgentIds = selectedAgentIds.length > 0 ? selectedAgentIds : defaultAgent ? [defaultAgent.id] : []
  const activeAgents = activeAgentIds.map((id) => agents.find((agent) => agent.id === id)).filter((agent): agent is AgentRow => Boolean(agent))
  const activeCategoryMeta = SUMMON_SCENE_CATEGORIES.find((category) => category.id === activeCategory) ?? SUMMON_SCENE_CATEGORIES[0]
  const quickTeams = SUMMON_TEAMS.filter((team) => team.category === activeCategory)

  const uploadFiles = async (conversationId: string) => {
    if (pendingFiles.length === 0) return []
    setUploading(true)
    try {
      return await Promise.all(pendingFiles.map((file) => uploadAttachment(conversationId, file)))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /**
   * 只带「会改变任务怎么执行」的背景:选了小队或指定了 Agent(可能涉及分工)、待上传附件。
   * 「场景分类」只是当前页面的筛选器、审批模式是系统状态,都跟任务本身无关,不再传给优化器。
   */
  const buildNewTaskEnhanceContext = (): PromptEnhanceContext => {
    const context: PromptEnhanceContext = {}
    const names = selectedTeam
      ? [selectedTeam.name, ...activeAgents.map((agent) => getAgentDisplayName(agent))]
      : activeAgents.map((agent) => getAgentDisplayName(agent))
    if (names.length > 0) context.participants = names
    if (pendingFiles.length > 0) context.attachments = pendingFiles.map((file) => file.name)
    return context
  }

  const enhancePrompt = async () => {
    const text = content.trim()
    if (enhancingPrompt) return
    if (!text) {
      setEnhanceError('请输入需要增强的提示词。')
      setEnhanceOriginalText('')
      setEnhancedText('')
      setEnhanceOpen(true)
      return
    }

    setEnhancingPrompt(true)
    setEnhanceError(null)
    setEnhanceOriginalText(text)
    setEnhancedText('')
    setEnhanceOpen(true)
    try {
      const result = await optimizePrompt(text, buildNewTaskEnhanceContext())
      setEnhancedText(result.enhancedText)
    } catch (err) {
      console.error('[NewTaskView] optimize prompt failed', err)
      setEnhanceError('提示词增强失败，请稍后重试。')
    } finally {
      setEnhancingPrompt(false)
    }
  }

  const applySubcategoryPrompt = async (team: SummonableTeam) => {
    const category = SUMMON_SCENE_CATEGORIES.find((item) => item.id === team.category)
    const memberNames = team.members.map((member) => member.name).join('、')
    const lines = [
      `我想使用「${team.name}」完成一个任务。`,
      category ? `场景：${category.label}` : '',
      `目标：${team.description}`,
      `建议工作流：${team.workflow}`,
      memberNames ? `建议参与 Agent：${memberNames}` : '',
      '请基于以上场景，先帮我澄清目标、拆解步骤，并给出可执行方案。',
    ].filter((line) => line.length > 0)

    setActiveSubcategoryId(team.id)
    setContent(lines.join('\n'))
    setSceneAgentError(null)
    setSelectingTeamId(team.id)

    try {
      const teamAgents = includeOrchestrator(await resolveOrCreateTeamAgents(team, agents, upsertAgent), agents)
      if (teamAgents.length > 0) {
        setSelectedAgentIds(teamAgents.map((agent) => agent.id))
        setSelectedTeam({ id: team.id, name: team.name })
      }
    } catch (err) {
      console.error('[NewTaskView] resolve scene agents failed', err)
      setSceneAgentError('未能自动匹配场景 Agent，可手动选择后继续。')
    } finally {
      setSelectingTeamId(null)
    }
  }

  const submit = async () => {
    const text = content.trim()
    if (!text || activeAgentIds.length === 0 || sending) return
    setSending(true)
    try {
      const submittedAgentIds = activeAgentIds.length > 1 ? includeOrchestrator(activeAgents, agents).map((agent) => agent.id) : activeAgentIds
      const initialMentionedAgentIds = submittedAgentIds.length > 1 ? [] : submittedAgentIds
      const conv = await createConversation({
        title: text.length > 24 ? `${text.slice(0, 24)}…` : text,
        mode: submittedAgentIds.length > 1 ? 'group' : 'single',
        agentIds: submittedAgentIds,
      })
      upsertConversation(conv)
      if (approvalMode !== conv.fsWriteApprovalMode) {
        const updated = await setFsWriteApprovalMode(conv.id, approvalMode)
        upsertConversation(updated)
      }
      const uploadedAttachments = await uploadFiles(conv.id)
      setActiveConversation(conv.id)
      onOpenConversations()

      const tempId = `temp_${nanoid()}`
      addLocalUserMessage({
        tempId,
        conversationId: conv.id,
        content: text,
        mentionedAgentIds: initialMentionedAgentIds,
        attachments: uploadedAttachments,
      })
      setContent('')
      setPendingFiles([])
      const result = await sendMessage(conv.id, {
        content: text,
        mentionedAgentIds: initialMentionedAgentIds,
        attachmentIds: uploadedAttachments.map((attachment) => attachment.id),
      })
      replaceLocalMessageId(tempId, result.messageId)
      for (const message of result.messages ?? []) upsertMessage(message)
    } catch (err) {
      console.error('[AppWorkbench] create task failed', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="agenthub-hide-scrollbar flex h-full min-h-0 min-w-0 flex-col overflow-y-auto bg-gradient-to-b from-[#FCFDFF] to-[#F4F6FB] dark:from-[#12151B] dark:to-[#0F1115]">
      {/* 主内容区 - 垂直居中；全幅铺满，内容锚点随屏幕放宽（1280 → 1440） */}
      <div className="flex min-h-[calc(100vh-var(--agenthub-titlebar-height,0px)-64px)] flex-1 items-center justify-center md:min-h-[calc(100vh-var(--agenthub-titlebar-height,0px)-16px)]">
        <div className="mx-auto w-full max-w-[1280px] px-8 pb-12 2xl:max-w-[1440px] 2xl:px-12">
          {/* Hero Section - 左侧标题/说明/场景/快捷 Agent，右侧放大版机器人吉祥物 */}
          <div className="grid items-center gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,500px)] xl:gap-10 2xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
            <div className="min-w-0 translate-y-5">
              <h1 className="text-[38px] font-[760] leading-[1.25] tracking-tight text-slate-950 dark:text-slate-50 xl:text-[42px] 2xl:text-[46px]">
                <span className="block">{BRAND_NAME}</span>
                <span className="block">
                  多 Agent <span className="text-[var(--agenthub-accent)]">团队协作</span>工作流
                </span>
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-500 dark:text-slate-400 xl:text-[16px] 2xl:text-[17px]">{activeCategoryMeta.description}</p>

              {/* 一级场景切换 Tabs */}
              <div className="mt-6 flex flex-nowrap items-center gap-2.5">
                {SUMMON_SCENE_CATEGORIES.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      setActiveCategory(category.id)
                      setActiveSubcategoryId(null)
                      setSelectedTeam(null)
                    }}
                    className={cn(
                      'h-[42px] shrink-0 whitespace-nowrap rounded-full px-[16px] text-[14px] transition active:scale-[0.98]',
                      activeCategory === category.id
                        ? 'bg-[var(--agenthub-accent)] font-semibold text-white shadow-[0_10px_24px_rgba(47,95,208,0.28)] hover:bg-[var(--agenthub-accent-hover)]'
                        : 'bg-white font-medium text-slate-600 ring-1 ring-[rgba(120,140,180,0.12)] hover:bg-[#F7F9FD] hover:text-slate-900 hover:ring-[rgba(120,140,180,0.20)] dark:bg-white/5 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-white/10 dark:hover:text-slate-100',
                    )}
                  >
                    {category.label}
                  </button>
                ))}
              </div>

              {/* 二级快捷 Agent 胶囊 */}
              <div className="mt-4 flex flex-wrap gap-2.5">
                {quickTeams.map((team) => {
                  const active = activeSubcategoryId === team.id
                  const TeamIcon = team.type === 'team' ? Users : Sparkles
                  return (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => void applySubcategoryPrompt(team)}
                      disabled={selectingTeamId === team.id}
                      className={cn(
                        'inline-flex h-[40px] items-center gap-2 rounded-full border px-4 text-[13px] font-medium transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-70',
                        active
                          ? 'border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-slate-100',
                      )}
                      title={team.description}
                    >
                      <TeamIcon className="size-4 shrink-0 text-[var(--agenthub-accent)]" />
                      {selectingTeamId === team.id ? '匹配中…' : team.name}
                    </button>
                  )
                })}
              </div>
            </div>

            <RobotMascot />
          </div>

          {/* 核心交互输入框 - 悬浮白色大卡片（输入 + 工具栏合并在一个阴影卡片中） */}
          <section className="mt-7 overflow-hidden rounded-[18px] border border-[rgba(120,140,180,0.08)] bg-white shadow-[0_18px_60px_rgba(80,120,220,0.10)] dark:border-white/10 dark:bg-[#1C1F26]">
            {/* 上半部：输入区 */}
            <PromptEnhanceModal
              visible={enhanceOpen}
              originalText={enhanceOriginalText || content}
              enhancedText={enhancedText}
              loading={enhancingPrompt}
              error={enhanceError}
              onOpenChange={(open) => {
                if (!enhancingPrompt) setEnhanceOpen(open)
              }}
              onKeepOriginal={() => setEnhanceOpen(false)}
              onUseEnhanced={() => {
                setContent(enhancedText)
                setEnhanceOpen(false)
              }}
            />
            <div className="relative">
              <Textarea
                ref={taskInputRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void submit()
                  }
                }}
                onPaste={handleTaskPaste}
                placeholder={`今天想让 ${BRAND_NAME} 帮你完成什么？`}
                className="min-h-[150px] max-h-[280px] resize-none overflow-y-auto border-0 bg-transparent px-6 pb-3.5 pt-8 text-[15px] shadow-none placeholder:text-slate-400 focus-visible:ring-0 2xl:min-h-[168px] 2xl:max-h-[320px] 2xl:px-7 2xl:text-[16px]"
              />
              {contentOverflow && (
                <span className="pointer-events-none absolute bottom-2 right-6 z-10 rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-medium text-slate-500 shadow-sm backdrop-blur dark:bg-neutral-900/85 dark:text-slate-400">
                  已省略 · 框内滑动查看
                </span>
              )}
            </div>

            {/* 附件列表 */}
            {enhanceError && !enhanceOpen && <div className="px-6 pb-3 text-xs text-red-600">{enhanceError}</div>}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 px-6 pb-3">
                {pendingFiles.map((file) => (
                  <span key={`${file.name}-${file.lastModified}`} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                    <Paperclip className="size-3" />
                    {file.name}
                    <button
                      type="button"
                      onClick={() => setPendingFiles((list) => list.filter((item) => item !== file))}
                      className="text-slate-400 transition hover:text-slate-700"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* 中间浅灰分割线 */}
            <div className="mx-7 h-px bg-slate-100/60 dark:bg-white/10" />

            {/* 下半部：参数配置栏 */}
            <div className="flex flex-wrap items-center gap-2.5 px-5 py-4">
              <span className="pl-1 text-xs font-medium text-slate-400">Workspace</span>
              <div className="relative">
                <Waypoints className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--agenthub-accent)]" />
                <select
                  value={selectedTeam ? selectedTeam.id : activeAgentIds[0] ?? ''}
                  onChange={(e) => {
                    setSelectedAgentIds(e.target.value ? [e.target.value] : [])
                    setSelectedTeam(null)
                  }}
                  className="h-10 appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-9 text-sm font-medium text-slate-700 outline-none transition focus:border-[var(--agenthub-accent)] dark:border-white/10 dark:bg-transparent dark:text-slate-200"
                >
                  {selectedTeam && <option value={selectedTeam.id}>{selectedTeam.name} · {activeAgents.length} 位协作</option>}
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{getAgentDisplayName(agent)}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              </div>

              <button
                type="button"
                onClick={() => setApprovalMode((mode) => (mode === 'review' ? 'auto' : 'review'))}
                title="切换写入审批模式"
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition',
                  approvalMode === 'review'
                    ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/70 hover:bg-emerald-100/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20'
                    : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200/70 hover:bg-slate-200/60 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10',
                )}
              >
                {approvalMode === 'review' ? '✓ Review' : 'Auto'}
              </button>

              {/* 分割线 + 右侧操作区 */}
              <div className="ml-auto flex items-center gap-1.5">
                <div className="mr-1.5 h-6 w-px bg-slate-200/50 dark:bg-white/10" />
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => setPendingFiles(Array.from(event.target.files ?? []))}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  title="附件上传"
                  onClick={() => fileInputRef.current?.click()}
                  className="size-10 rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-300"
                >
                  <Paperclip className="size-[18px]" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title={enhancingPrompt ? '提示词增强中' : '增强提示词'}
                  onClick={() => void enhancePrompt()}
                  disabled={enhancingPrompt || sending || uploading}
                  className="size-10 rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-300"
                >
                  {enhancingPrompt ? (
                    <Spinner size="sm" className="size-[18px]" />
                  ) : (
                    <Sparkles className="size-[18px]" />
                  )}
                </Button>
                <Button
                  onClick={() => void submit()}
                  disabled={!content.trim() || activeAgentIds.length === 0 || sending || uploading}
                  size="icon"
                  className="ml-1 size-11 rounded-xl bg-[var(--agenthub-accent,#2F5FD0)] text-white shadow-[0_8px_20px_rgba(47,95,208,0.32)] transition hover:bg-[var(--agenthub-accent-hover,#244FB3)] disabled:opacity-70"
                  title={uploading ? '上传中' : '发送'}
                >
                  <Send className="size-[18px]" />
                </Button>
              </div>
            </div>
          </section>

          {/* 底部状态栏 - 居中对齐 */}
          {sceneAgentError && <div className="mt-3 text-center text-xs text-amber-600 dark:text-amber-300">{sceneAgentError}</div>}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5 text-[12px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5 rounded-md px-1">
              选择工作空间
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1.5 rounded-md px-1">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              本地沙箱 · 运行中
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1.5 rounded-md px-1">
              {selectedTeam ? `已选择小队：${selectedTeam.name} · ${activeAgents.length} 位协作` : approvalMode === 'review' ? 'Review 保护 enabled' : 'Auto 模式 · 直接生效'}
            </span>
            {activeAgents.length > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1.5 rounded-md px-1 text-[var(--agenthub-accent)]">
                  <AgentAvatar agent={activeAgents[0]} size="xs" />
                  {selectedTeam ? `${selectedTeam.name} · ${activeAgents.length} 位协作` : activeAgents.length === 1 ? getAgentDisplayName(activeAgents[0]) : `${getAgentDisplayName(activeAgents[0])} 等 ${activeAgents.length} 位 Agent`}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function RobotMascot() {
  return (
    <div aria-hidden className="relative hidden h-[380px] w-[420px] shrink-0 select-none xl:block">
      <div className="absolute inset-0">
        {/* 轻蓝色氛围光 */}
        <div className="absolute left-1/2 top-1/2 size-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(96,165,250,0.16),transparent_60%)] blur-3xl" />

        <svg
          viewBox="0 0 420 380"
          className="absolute inset-0 h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="rm-orbit" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#22D3EE" />
              <stop offset="55%" stopColor="#5B8DEF" />
              <stop offset="100%" stopColor="#8B5CF6" />
            </linearGradient>
            <linearGradient id="rm-shell" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#DDE6F2" />
            </linearGradient>
            <linearGradient id="rm-face" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1E2A4A" />
              <stop offset="100%" stopColor="#0B1124" />
            </linearGradient>
            <linearGradient id="rm-ear" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7AAEFF" />
              <stop offset="100%" stopColor="#2F5FD0" />
            </linearGradient>
            <linearGradient id="rm-chipBlue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7AAEFF" />
              <stop offset="100%" stopColor="#3B6BE0" />
            </linearGradient>
            <linearGradient id="rm-chipTeal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#0F9D7A" />
            </linearGradient>
            <linearGradient id="rm-chipPurple" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#A78BFA" />
              <stop offset="100%" stopColor="#7C4DEF" />
            </linearGradient>
            <filter id="rm-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#0F1125" floodOpacity="0.18" />
            </filter>
          </defs>

          {/* 轨道环（居中靠下，呼应参考图） */}
          <ellipse cx="210" cy="252" rx="170" ry="48" fill="none" stroke="url(#rm-orbit)" strokeWidth="9" opacity="0.9" />
          <ellipse cx="210" cy="252" rx="170" ry="48" fill="none" stroke="#FFFFFF" strokeWidth="2" opacity="0.55" />

          {/* 聊天方块（左上） */}
          <g transform="translate(54 60) rotate(-8 38 38)" filter="url(#rm-shadow)">
            <rect x="0" y="0" width="76" height="76" rx="18" fill="#FFFFFF" />
            <rect x="12" y="18" width="52" height="40" rx="10" fill="url(#rm-chipBlue)" />
            <rect x="42" y="62" width="10" height="8" rx="2" fill="#FFFFFF" />
            <rect x="20" y="28" width="34" height="5" rx="2.5" fill="#FFFFFF" opacity="0.95" />
            <rect x="20" y="40" width="22" height="5" rx="2.5" fill="#FFFFFF" opacity="0.7" />
          </g>

          {/* 用户方块（右上） */}
          <g transform="translate(252 30) rotate(8 42 42)" filter="url(#rm-shadow)">
            <rect x="0" y="0" width="84" height="84" rx="20" fill="#FFFFFF" />
            <rect x="14" y="18" width="56" height="48" rx="11" fill="url(#rm-chipTeal)" />
            <circle cx="42" cy="34" r="9" fill="#FFFFFF" />
            <path d="M22 60 c4 -10 16 -10 20 -10 c4 0 16 0 20 10 v4 H22 z" fill="#FFFFFF" />
          </g>

          {/* 工具方块（右下） */}
          <g transform="translate(282 246) rotate(12 38 38)" filter="url(#rm-shadow)">
            <rect x="0" y="0" width="76" height="76" rx="18" fill="#FFFFFF" />
            <rect x="12" y="18" width="52" height="40" rx="10" fill="url(#rm-chipPurple)" />
            <path d="M24 36 a8 8 0 1 1 11 11 l-12 12 -6 -2 -2 -6 z" fill="#FFFFFF" />
            <path d="M48 26 l9 9" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
          </g>

          {/* 耳朵（机器人两侧） */}
          <g transform="translate(86 174)">
            <rect x="0" y="0" width="32" height="68" rx="16" fill="url(#rm-ear)" />
            <rect x="6" y="6" width="20" height="56" rx="10" fill="#1E2A4A" opacity="0.18" />
          </g>
          <g transform="translate(302 174)">
            <rect x="0" y="0" width="32" height="68" rx="16" fill="url(#rm-ear)" />
            <rect x="6" y="6" width="20" height="56" rx="10" fill="#1E2A4A" opacity="0.18" />
          </g>

          {/* 头部主体 */}
          <g transform="translate(120 84)">
            {/* 外壳 */}
            <rect x="0" y="0" width="180" height="148" rx="56" fill="url(#rm-shell)" filter="url(#rm-shadow)" />
            {/* 天线 */}
            <rect x="80" y="-22" width="20" height="24" rx="6" fill="#DDE6F2" />
            <circle cx="90" cy="-32" r="12" fill="#5B8DEF" />
            <circle cx="90" cy="-32" r="20" fill="#5B8DEF" opacity="0.18" />
            {/* 脸 */}
            <rect x="22" y="28" width="136" height="92" rx="32" fill="url(#rm-face)" />
            {/* 闭眼弧 */}
            <g stroke="#6AA6FF" strokeWidth="9" strokeLinecap="round" fill="none">
              <path d="M48 84 q14 -22 28 0" />
              <path d="M104 84 q14 -22 28 0" />
            </g>
          </g>
        </svg>

        {/* 底部柔光椭圆 */}
        <div className="absolute bottom-[40px] left-1/2 h-[28px] w-[150px] -translate-x-1/2 rounded-[50%] bg-[#6E9EFF] opacity-[0.10] blur-xl" />
      </div>

      {/* 机器人下方的轻量装饰胶囊（保留原「Orchestrator / Working… / Review Enabled」） */}
      <div className="absolute inset-x-0 bottom-[10px] flex items-center justify-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-[11px] text-slate-400 ring-1 ring-slate-200/60 shadow-sm backdrop-blur-sm dark:bg-white/5 dark:text-slate-400 dark:ring-white/10">
          <Waypoints className="size-3 text-[var(--agenthub-accent)]/70" />
          Orchestrator
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-[11px] text-slate-400 ring-1 ring-slate-200/60 shadow-sm backdrop-blur-sm dark:bg-white/5 dark:text-slate-400 dark:ring-white/10">
          <Sparkles className="size-3 text-[var(--agenthub-accent)]/70" />
          Working…
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-[11px] text-slate-400 ring-1 ring-slate-200/60 shadow-sm backdrop-blur-sm dark:bg-white/5 dark:text-slate-400 dark:ring-white/10">
          <span className="text-emerald-500/80">✓</span>
          Review Enabled
        </span>
      </div>
    </div>
  )
}

function ConversationListPanel({ variant = 'standalone' }: { variant?: 'standalone' | 'embedded' }) {
  const allConversations = useConversationList()
  // 归档会话默认不显示，但必须留一个入口 —— 否则「归档」就是一次性删除
  // （线上 2026-09-16 报障：自动化产出写进了已归档会话，对话页里找不到）。
  const conversations = allConversations.filter((c) => !c.archived)
  const archivedConversations = allConversations.filter((c) => c.archived)
  const activeId = useAppStore((s) => s.activeConversationId)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)
  const agents = useAppStore((s) => s.agents)
  const removeConversation = useAppStore((s) => s.removeConversation)
  const upsertConversation = useAppStore((s) => s.upsertConversation)
  const [query, setQuery] = useState('')
  // 右键菜单：记录被点的会话与鼠标坐标（菜单自己负责贴边夹取）
  const [contextMenu, setContextMenu] = useState<{ convId: string; x: number; y: number } | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const handleTogglePin = async (convId: string) => {
    try {
      const updated = await togglePinConversation(convId)
      upsertConversation(updated)
    } catch (err) {
      console.error('[ConversationListPanel] toggle pin failed', err)
    }
  }

  const handleToggleArchive = async (convId: string) => {
    try {
      const updated = await toggleArchiveConversation(convId)
      upsertConversation(updated)
    } catch (err) {
      console.error('[ConversationListPanel] toggle archive failed', err)
    }
  }

  const finishRename = async (convId: string, currentTitle: string, next: string) => {
    const trimmed = next.trim()
    setRenamingId(null)
    if (!trimmed || trimmed === currentTitle) return
    try {
      const updated = await renameConversation(convId, trimmed)
      upsertConversation(updated)
    } catch (err) {
      console.error('[ConversationListPanel] rename failed', err)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTargetId) return
    setDeleting(true)
    try {
      await deleteConversation(deleteTargetId)
      removeConversation(deleteTargetId)
      setDeleteTargetId(null)
    } catch (err) {
      console.error('[ConversationListPanel] delete failed', err)
    } finally {
      setDeleting(false)
    }
  }

  const deleteTarget = deleteTargetId ? allConversations.find((c) => c.id === deleteTargetId) : null
  const contextConversation = contextMenu
    ? allConversations.find((c) => c.id === contextMenu.convId) ?? null
    : null

  const filtered = conversations.filter((conversation) => conversation.title.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <aside className={cn(
      'flex min-h-0 flex-col',
      variant === 'standalone' && 'hidden w-[292px] shrink-0 rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60 lg:flex',
      variant === 'embedded' && 'h-full',
    )}>
      <div className={cn('border-b border-slate-100', variant === 'embedded' ? 'pb-3' : 'p-4')}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className={cn('font-semibold', variant === 'embedded' ? 'text-sm' : 'text-base')}>对话历史</h2>
            <p className="mt-1 truncate text-xs text-slate-500">选择一个会话继续协作</p>
          </div>
          {variant === 'standalone' && (
            <div className="flex shrink-0 items-center gap-1">
              <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]">
                <MessageSquare className="size-4" />
              </div>
            </div>
          )}
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索对话" className="h-8 rounded-lg border-0 bg-slate-100 pl-9 text-xs shadow-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-[var(--agenthub-accent-border)]" />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5 py-2">
          <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">最近对话</div>
          {filtered.map((conversation) => {
            const isGroup = conversation.mode === 'group' || conversation.agentIds.length > 1
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setActiveConversation(conversation.id)}
                onContextMenu={(event) => {
                  // 右键不该同时触发浏览器原生菜单（会把自绘菜单顶掉）
                  event.preventDefault()
                  setContextMenu({ convId: conversation.id, x: event.clientX, y: event.clientY })
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 text-left transition',
                  'h-11',
                  activeId === conversation.id
                    ? 'bg-[var(--agenthub-accent-soft)] text-slate-950'
                    : 'text-slate-700 hover:bg-slate-100',
                )}
              >
                <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', activeId === conversation.id ? 'bg-white text-[var(--agenthub-accent)]' : 'bg-slate-100 text-slate-500')}>
                  {isGroup ? <Grid2X2 className="size-3.5" /> : <MessageCircle className="size-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  {renamingId === conversation.id ? (
                    <RenameInput
                      key={conversation.id}
                      initial={conversation.title}
                      onCommit={(next) => void finishRename(conversation.id, conversation.title, next)}
                      onCancel={() => setRenamingId(null)}
                    />
                  ) : (
                    <span className="block truncate text-[13px] font-medium leading-5">{conversation.title}</span>
                  )}
                  <span className="mt-0.5 block truncate text-[10px] leading-4 text-slate-500">
                    {conversation.agentIds.map((id) => agents[id] ? getAgentDisplayName(agents[id]) : null).filter(Boolean).join(' / ') || '未配置 Agent'}
                  </span>
                </span>
                <span className="ml-1 shrink-0 self-start pt-1 text-[10px] text-slate-400">{formatConversationTime(conversation.updatedAt)}</span>
              </button>
            )
          })}
          {filtered.length === 0 && <div className="px-3 py-8 text-center text-xs text-slate-500">暂无匹配会话</div>}

          {archivedConversations.length > 0 && (
            <div className="mt-2 border-t border-slate-100 pt-2 dark:border-white/5">
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                aria-expanded={showArchived}
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] font-medium text-slate-500 transition hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5"
              >
                <Archive className="size-3.5 shrink-0 opacity-70" />
                已归档
                <span className="ml-auto tabular-nums text-slate-400">{archivedConversations.length}</span>
                <ChevronDown className={cn('size-3 shrink-0 transition-transform', !showArchived && '-rotate-90')} />
              </button>
              {showArchived &&
                archivedConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setActiveConversation(conversation.id)}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      setContextMenu({ convId: conversation.id, x: event.clientX, y: event.clientY })
                    }}
                    title="已归档 · 右键可取消归档或删除"
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2 text-left opacity-70 transition hover:bg-slate-50 hover:opacity-100 dark:hover:bg-white/5',
                      'h-11',
                      activeId === conversation.id && 'bg-[var(--agenthub-accent-soft)] opacity-100',
                    )}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/5">
                      <Archive className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium leading-5 text-slate-600 dark:text-slate-300">{conversation.title}</span>
                      <span className="mt-0.5 block truncate text-[10px] leading-4 text-slate-400">
                        已归档 · {formatConversationTime(conversation.updatedAt)}
                      </span>
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {contextConversation && contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          label={`「${contextConversation.title}」操作`}
          onClose={() => setContextMenu(null)}
          items={[
            {
              key: 'open',
              label: '打开对话',
              icon: <MessageSquare className="size-3.5 shrink-0 opacity-70" />,
              onSelect: () => setActiveConversation(contextConversation.id),
            },
            {
              key: 'pin',
              label: contextConversation.pinnedAt ? '取消置顶' : '置顶',
              icon: contextConversation.pinnedAt
                ? <PinOff className="size-3.5 shrink-0 opacity-70" />
                : <Pin className="size-3.5 shrink-0 opacity-70" />,
              onSelect: () => void handleTogglePin(contextConversation.id),
            },
            {
              key: 'archive',
              label: contextConversation.archived ? '取消归档' : '归档',
              icon: contextConversation.archived
                ? <ArchiveRestore className="size-3.5 shrink-0 opacity-70" />
                : <Archive className="size-3.5 shrink-0 opacity-70" />,
              onSelect: () => void handleToggleArchive(contextConversation.id),
            },
            {
              key: 'rename',
              label: '重命名',
              icon: <Pencil className="size-3.5 shrink-0 opacity-70" />,
              onSelect: () => setRenamingId(contextConversation.id),
            },
            {
              key: 'copy-title',
              label: '复制标题',
              icon: <Copy className="size-3.5 shrink-0 opacity-70" />,
              onSelect: () => {
                void navigator.clipboard?.writeText(contextConversation.title).catch(() => {})
              },
            },
            {
              key: 'delete',
              label: '删除会话',
              tone: 'danger',
              icon: <Trash2 className="size-3.5 shrink-0" />,
              onSelect: () => setDeleteTargetId(contextConversation.id),
            },
          ]}
        />
      )}

      <Dialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除会话</DialogTitle>
            <DialogDescription>
              确定要删除「{deleteTarget?.title}」吗？该会话的所有消息、产物和工作区都会一并清除，无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargetId(null)}>
              取消
            </Button>
            <Button
              variant="default"
              className="bg-red-600 hover:bg-red-700"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {deleting ? '删除中...' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string
  onCommit: (next: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit(draft)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      maxLength={100}
      className="w-full rounded border border-primary/40 bg-background px-1.5 py-0.5 text-[13px] font-medium outline-none ring-2 ring-primary/30"
    />
  )
}

function formatConversationTime(value: number) {
  const date = new Date(value)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isToday) return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
