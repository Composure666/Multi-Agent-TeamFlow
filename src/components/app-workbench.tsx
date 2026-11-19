'use client'

import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  BarChart3,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  Code,
  Coins,
  Copy,
  FileText,
  Grid2X2,
  Image,
  ImagePlus,
  LayoutTemplate,
  Menu,
  MessageCircle,
  MessageSquare,
  Paperclip,
  PenLine,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Users,
  X
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { useAgentList, useAppStore, useConversationList, type AppWorkbenchView } from '@/stores/app-store'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
  const hasActiveConversation = useAppStore((s) => s.activeConversationId != null)

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
    <div className="flex h-full min-h-0 bg-[var(--agenthub-surface-muted)] text-slate-950 dark:text-slate-50">
      <WorkbenchNav view={view} onViewChange={setView} onOpenSettings={() => openSettingsTarget(null)} />
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* 对话页平时不渲染顶栏（聊天区自带 header + 汉堡）；但无活跃会话时聊天区
            只有空态、无 header、无汉堡，顶栏是唯一能打开抽屉（含会话列表）的入口
            （batch4-leftovers §8b），故该情形下顶栏仍要出现。 */}
        {(view !== 'conversations' || !hasActiveConversation) && !analyticsFocusMode && <MobileWorkbenchTopBar currentLabel={currentViewLabel} onOpen={openMobileSidebar} onOpenInformationCenter={() => setView('information-center')} />}
        <WorkbenchViewRouter
          view={view}
          renderers={{
            'new-task': () => <NewTaskView onOpenConversations={() => setView('conversations')} onOpenAgents={() => setView('agents')} />,
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
      <DialogContent className="flex max-h-[min(760px,calc(100vh-2rem))] max-w-3xl grid-rows-none flex-col overflow-hidden border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] p-0 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface)] sm:max-w-3xl">
        <div className={cn('relative overflow-hidden bg-gradient-to-br px-5 pb-5 pt-6 text-white', team.coverClassName)}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.12),rgba(15,23,42,0.72))]" />
          <DialogHeader className="relative z-10 gap-3 pr-10">
            <div className="flex items-start gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/12 text-3xl shadow-sm backdrop-blur">
                {leadMember?.avatar ?? '🤖'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-medium text-white/85 backdrop-blur">{category?.label ?? '场景'}</span>
                  <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-medium text-white/85 backdrop-blur">{team.type === 'team' ? '多 Agent 团队' : '单 Agent'}</span>
                  <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-medium text-white/85 backdrop-blur">{team.heat}</span>
                </div>
                <DialogTitle className="truncate text-2xl font-semibold tracking-tight text-white">{team.name}</DialogTitle>
                <DialogDescription className="mt-2 max-w-2xl text-sm leading-6 text-white/78">{team.description}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-5 pb-8">
            <section className="rounded-xl border border-[var(--agenthub-border)] bg-slate-50 p-4 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface-sunken)]/70">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                  工作流说明
                  {workflowCustom && (
                    <span className="ml-2 inline-flex translate-y-[-1px] items-center rounded-full bg-[var(--agenthub-accent-soft)] px-2 py-0.5 text-3xs font-medium text-[var(--agenthub-accent)]">已自定义</span>
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
                  <span key={tag} className="rounded-md border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] px-2.5 py-1 text-xs text-slate-600 dark:border-[var(--agenthub-border)] dark:bg-white/5 dark:text-slate-300">
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
                      <div key={member.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] p-3 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface-raised)]">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--agenthub-border)] bg-slate-50 text-lg dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface-sunken)]">{member.avatar}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{member.name}</div>
                            {member.isLead && <span className="shrink-0 rounded-full bg-[var(--agenthub-accent-soft)] px-2 py-0.5 text-3xs font-medium text-[var(--agenthub-accent)]">主理人</span>}
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
              <section className="rounded-xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] p-4 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface-raised)]">
                <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-100">能力介绍</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{team.systemPromptTemplate}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex size-7 items-center justify-center rounded-md bg-slate-100 text-base dark:bg-[var(--agenthub-surface-sunken)]">{leadMember.avatar}</span>
                  <span>{leadMember.name}</span>
                  <span>·</span>
                  <span className="font-mono">{leadMember.modelName}</span>
                </div>
              </section>
            )}

            <section className="rounded-xl border border-dashed border-[var(--agenthub-border)] bg-slate-50 p-4 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface-sunken)]/70">
              <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-100">召唤上下文</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{team.systemPromptTemplate}</p>
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="sticky bottom-0 z-10 m-0 shrink-0 flex-row items-center justify-between rounded-none border-t border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] p-4 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface)]">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex -space-x-2">
              {team.members.slice(0, 3).map((member) => (
                <span key={member.id} className="flex size-7 items-center justify-center rounded-full border border-white bg-slate-100 text-sm dark:border-[var(--agenthub-surface)] dark:bg-[var(--agenthub-surface-raised)]">{member.avatar}</span>
              ))}
              {hiddenMemberCount > 0 && <span className="flex size-7 items-center justify-center rounded-full border border-white bg-slate-200 text-3xs text-slate-600 dark:border-[var(--agenthub-surface)] dark:bg-[var(--agenthub-surface-raised)] dark:text-slate-300">+{hiddenMemberCount}</span>}
            </div>
            <span className="truncate text-xs text-slate-500 dark:text-slate-400">{team.type === 'team' ? `${team.members.length} 位成员协作` : '单 Agent 对话'}</span>
          </div>
          <Button onClick={() => void onSummon(team)} disabled={summoning} className="shrink-0 rounded-md bg-[var(--agenthub-accent)] px-4 text-[var(--primary-foreground)] hover:bg-[var(--agenthub-accent-hover)]">
            {summoning ? '召唤中' : `召唤 ${team.name}`}
          </Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>

      <Dialog open={workflowOpen} onOpenChange={setWorkflowOpen}>
        <DialogContent className="border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface)] sm:max-w-lg">
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
            <Button onClick={saveWorkflow} className="rounded-md bg-[var(--agenthub-accent)] text-[var(--primary-foreground)] hover:bg-[var(--agenthub-accent-hover)]">
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
    <div className="flex shrink-0 items-center gap-3 border-b border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] px-3 py-1 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface)] md:hidden">
      <button
        type="button"
        onClick={onOpen}
        className="flex size-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 active:bg-slate-200 dark:text-slate-300 dark:hover:bg-white/5 dark:active:bg-white/10"
        title="打开菜单"
      >
        <Menu className="size-4 stroke-[2.2]" />
      </button>
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-900 text-white dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface-raised)]">
        <Sparkles className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
        {BRAND_NAME} <span className="font-normal text-slate-500 dark:text-slate-400">· {currentLabel}</span>
      </div>
      <button
        type="button"
        onClick={onOpenInformationCenter}
        className="relative flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
        title="信息中心"
        aria-label="信息中心"
      >
        <Bell className="size-4 stroke-[2.2]" />
        {unreadNotificationCount > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-[var(--agenthub-accent)] px-1.5 py-0.5 text-3xs font-semibold leading-none text-[var(--primary-foreground)]">
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
          'fixed inset-y-0 left-0 z-50 flex w-[min(86vw,320px)] flex-col border-r border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] shadow-lg transition-transform duration-200 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface)] md:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--agenthub-border)] px-4 py-4 dark:border-[var(--agenthub-border)]">
          <button type="button" onClick={() => onViewChange('new-task')} className="flex min-w-0 items-center gap-3 text-left">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-900 text-white dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface-raised)]">
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
            className="flex size-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100 dark:active:bg-white/10"
            title="关闭菜单"
          >
            <X className="size-4 stroke-[2.2]" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-3 rounded-lg border border-[var(--agenthub-border)] bg-slate-50 p-3 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface-muted)]">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-900 dark:text-slate-100">
              <CheckCircle2 className="size-3.5 text-emerald-500 dark:text-emerald-300" />
              个人工作区
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">管理本地会话、Agent、产物与自动化任务。</p>
          </div>

          <button
            type="button"
            onClick={() => onViewChange('new-task')}
            className={cn(
              'mb-3 flex min-h-10 w-full items-center gap-3 rounded-lg border border-slate-300 bg-[var(--agenthub-surface)] px-3 text-left text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 active:scale-[0.99] dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface)] dark:text-slate-300 dark:hover:border-white/15 dark:hover:bg-white/5',
              view === 'new-task' && 'border-[var(--agenthub-accent)] text-[var(--agenthub-accent)]',
            )}
          >
            <Plus className="size-4" />
            <span className="min-w-0 flex-1 truncate">新建任务</span>
          </button>

          <nav className="space-y-4" aria-label="工作台导航">
            {(['primary', 'workspace'] as const).map((group) => (
              <div key={group} className="space-y-1.5">
                <div className="px-3 text-3xs font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
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
                          ? 'bg-[var(--agenthub-accent-soft)] font-semibold text-[var(--agenthub-accent)] before:absolute before:left-0 before:top-2 before:h-6 before:w-[3px] before:rounded-r-full before:bg-[var(--agenthub-accent)] dark:bg-[var(--agenthub-surface-raised)]'
                          : 'text-slate-600 hover:bg-[var(--agenthub-accent-soft)] active:bg-slate-200 dark:text-slate-400 dark:hover:bg-white/5 dark:active:bg-white/10',
                      )}
                    >
                      <Icon className="size-4 stroke-[2.1]" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.id === 'information-center' && unreadNotificationCount > 0 && (
                        <span className="rounded-full bg-[var(--agenthub-accent)] px-1.5 py-0.5 text-3xs font-semibold leading-none text-[var(--primary-foreground)]">
                          {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>

          {/* 390 下会话列表入口（batch4-leftovers §8b）：会话列表只在桌面侧栏里
              （`hidden md:flex` 的 WorkbenchNav），移动端进对话页后无处切换会话；
              抽屉在对话页时直接把同一份 ConversationListPanel 嵌在这里，选中即收起抽屉。
              mobile-workbench-cleanup B5：列表改放导航下方——导航是退出/切换视图的主路径，
              打开抽屉先见导航，不必滚过会话列表；会话列表仍在同一滚动区内，下滑即见。 */}
          {view === 'conversations' && (
            <div className="mt-4 border-t border-[var(--agenthub-border)] pt-3 dark:border-[var(--agenthub-border)]">
              <ConversationListPanel variant="embedded" onSelectConversation={onClose} />
            </div>
          )}
        </div>

        <div className="space-y-2 border-t border-[var(--agenthub-border)] p-3 dark:border-[var(--agenthub-border)]">
          {accountOpen && (
            <UserAccountOverview usage={usage} onReload={usage.reload} onOpenSettings={onOpenSettings} onClose={() => setAccountOpen(false)} />
          )}

          <button
            type="button"
            onClick={() => setAccountOpen((expanded) => !expanded)}
            aria-expanded={accountOpen}
            className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] text-left transition hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface)] dark:hover:border-white/15 dark:hover:bg-white/5 dark:active:bg-white/10"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">A</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-medium text-slate-900">Workspace</span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-3xs font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">Local</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
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
  className,
}: {
  usage: { data: UsageSummary | null; loading: boolean; error: string | null }
  onReload: () => void
  onOpenSettings: () => void
  onClose?: () => void
  className?: string
}) {
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)
  const topModels = usage.data?.byModel.slice(0, 1) ?? []
  const topConversations = usage.data?.topConversations.slice(0, 5) ?? []

  return (
    <div
      className={cn(
        'agenthub-card-container flex min-w-0 flex-col overflow-hidden p-4',
        className,
      )}
    >
      {/* 顶部 Workspace 信息 */}
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white dark:bg-[var(--agenthub-surface-raised)]">A</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">Workspace</div>
              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-3xs font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">Local</span>
            </div>
            <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">本地单用户 · 用量概览</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-3xs font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">已连接</span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex size-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-100"
              aria-label="关闭账户概览"
              title="关闭账户概览"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {usage.loading && !usage.data ? (
        <div className="mt-4 flex flex-1 items-center justify-center rounded-xl border border-[var(--agenthub-border)] bg-slate-50 px-3 py-5 text-xs text-slate-500 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface-muted)] dark:text-slate-400">加载用量数据...</div>
      ) : usage.error ? (
        <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-600">
          <div className="line-clamp-2">{usage.error}</div>
          <button type="button" onClick={onReload} className="mt-2 font-medium text-rose-700 hover:text-rose-900">重试</button>
        </div>
      ) : usage.data ? (
        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)]/60 p-3 dark:border-white/5 dark:bg-white/5">
              <div className="text-xs text-slate-400">今日 Token</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">{formatTok(usage.data.today.totalTokens)}</div>
            </div>
            <div className="rounded-xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)]/60 p-3 dark:border-white/5 dark:bg-white/5">
              <div className="text-xs text-slate-400">本周 Token</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">{formatTok(usage.data.week.totalTokens)}</div>
            </div>
          </div>

          {topModels.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>常用模型</span>
                <span>{usage.data.today.runs} 次今日运行</span>
              </div>
              {topModels.map((model) => (
                <UsageBarRow key={model.model} label={model.model} value={model.totalTokens} runs={model.runs} max={topModels[0].totalTokens} />
              ))}
            </div>
          )}

          {topConversations.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-xs text-slate-500 dark:text-slate-400">最近高频会话</div>
              <div className="space-y-0.5">
                {topConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setActiveConversation(conversation.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-[var(--agenthub-accent-soft)] hover:text-slate-900 dark:hover:bg-white/5 dark:hover:text-slate-100"
                    title={`更新时间 ${new Date(conversation.updatedAt).toLocaleString('zh-CN')}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                    <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-slate-400">
                      <Coins className="size-3" />
                      {formatTok(conversation.totalTokens)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {usage.data.allTime.runs === 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-[var(--agenthub-border)] bg-slate-50 px-3 py-4 text-center text-xs text-slate-500 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface-muted)] dark:text-slate-400">还没有用量数据，和 Agent 对话后会显示在这里。</div>
          )}
        </div>
      ) : null}

      <div className="mt-4 grid shrink-0 grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onReload}
          disabled={usage.loading}
          className="flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-[var(--agenthub-accent-soft)] hover:text-slate-900 disabled:opacity-50 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface)] dark:text-slate-300 dark:hover:border-white/15 dark:hover:bg-white/5 dark:hover:text-slate-100"
        >
          <BarChart3 className="size-3.5" />
          {usage.loading ? '刷新中' : '刷新'}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-[var(--agenthub-accent-soft)] hover:text-slate-900 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface)] dark:text-slate-300 dark:hover:border-white/15 dark:hover:bg-white/5 dark:hover:text-slate-100"
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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-300">{label}</span>
        <span className="shrink-0 pl-2 font-mono text-xs text-slate-400 dark:text-slate-500">{formatTok(value)} · {runs}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-[var(--agenthub-surface-raised)]">
        <div className="h-full rounded-full bg-[var(--agenthub-accent)] transition-all" style={{ width: `${pct}%` }} />
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
      // ❗ overflow-hidden 是必需的，不是装饰：各区块总高超过侧栏时，默认 overflow:visible
      // 会让底部「Workspace」溢出到容器外，再被 page.tsx 的 overflow-hidden 裁掉
      // —— 表现就是「底部那块不见了 / 被遮挡」。配合 `.wb-history` 的 min-height:0，
      // 高度不足时是历史区收缩，而不是固定区块被挤出去。
      className={cn('wb-sidebar hidden h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] px-3 py-2.5 transition-[width] duration-200 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface)] md:flex', compact ? 'w-[72px]' : view === 'conversations' || view === 'new-task' ? 'w-[288px]' : 'w-[260px]')}
    >
      {/* ① 品牌区（shrink-0） */}
      <div className={cn('flex shrink-0 items-center gap-2 px-2 pb-1.5', compact && 'flex-col gap-2 px-0 pb-1')}>
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
            <span className="text-center text-xs font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-50">
              <span className="block">Multi-Agent</span>
              <span className="block">TeamFlow</span>
            </span>
          )}
          {!compact && (
            <div className="min-w-0">
              {/* Q15：非 compact 品牌名也折成两行（与 72px 窄轨同一规范），去掉该行 truncate；
                  否则 288px 侧栏可用宽约 104px，14px 的 "Multi-Agent TeamFlow" 必然被裁成 "Multi-Age…"。
                  副标题改换行显示（batch 3 项 5）：同一 104px 宽度下 12px 的
                  "Multi-Agent Collaboration & Workflow" 单行必然截成 "Multi-Agent…"，
                  换行 3 行完整显示，不只缩字号。 */}
              <div className="text-sm font-semibold leading-tight tracking-tight dark:text-slate-50">
                <span className="block">Multi-Agent</span>
                <span className="block">TeamFlow</span>
              </div>
              <div className="text-xs leading-snug text-slate-500/60 dark:text-slate-400/60">{BRAND_TAGLINE_EN}</div>
            </div>
          )}
        </button>
        {!compact && (
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle className="size-8 rounded-lg text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-100" />
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
              title="设置"
            >
              <Settings className="size-4 stroke-[2.2]" />
            </button>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
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

      {/* ② 新建任务（shrink-0）。h-11 → h-10：这一步省下的 4.25px 直接进历史区。 */}
      <button
        type="button"
        onClick={() => onViewChange('new-task')}
        className={cn(
          'mb-1.5 flex h-10 items-center justify-center gap-2 rounded-[14px] border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] px-3 text-base font-medium text-slate-700 transition hover:border-slate-300 hover:bg-[var(--agenthub-accent-soft)] hover:text-[var(--agenthub-accent)] dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface)] dark:text-slate-300 dark:hover:border-white/15 dark:hover:bg-white/5 dark:hover:text-slate-50',
          compact && 'px-0',
          view === 'new-task' && 'border-[var(--agenthub-accent)] bg-[var(--agenthub-accent-soft)] font-semibold text-[var(--agenthub-accent)] dark:border-white/15 dark:bg-[var(--agenthub-accent-soft)] dark:text-slate-50',
        )}
      >
        <Plus className="size-4" />
        {!compact && <span className="min-w-0 flex-1 text-left">新建任务</span>}
        {!compact && <span className="ml-auto text-3xs font-normal text-slate-400">Ctrl + N</span>}
      </button>

      {/* ③ 主导航（shrink-0）。行高 / 行距由 globals.css 的 `--wb-nav-h` / `--wb-nav-gap`
          按窗口高度分档给 —— 这是控制「历史列表可用高度」的唯一有效杠杆。 */}
      <nav className="wb-nav flex shrink-0 flex-col" aria-label="工作台导航">
        {navItems.filter((item) => item.id !== 'new-task').map((item) => {
          const Icon = item.icon
          const active = view === item.id
          const showAutomationResultNotice = item.id === 'conversations' && hasAutomationResultNotice && !active
          const showUnreadNotifications = item.id === 'information-center' && unreadNotificationCount > 0
          return (
            <Fragment key={item.id}>
              {item.id === 'run-board' && !compact && (
                <div className="mb-0.5 mt-2 border-t border-[var(--agenthub-border)] px-[18px] pt-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:border-[var(--agenthub-border)]">
                  分析
                </div>
              )}
              <button
                type="button"
                onClick={() => onViewChange(item.id)}
                title={compact ? item.label : undefined}
                className={cn(
                  // 行高由 .wb-nav-item 给（见 globals.css），不写 h-9 —— 否则两处会打架
                  'wb-nav-item relative flex w-full items-center gap-2.5 rounded-[14px] px-[18px] text-base transition',
                  compact && 'justify-center px-0',
                  item.id === 'run-board' && !compact && 'pl-5',
                  active
                    ? 'bg-[var(--agenthub-accent-soft)] font-semibold text-[var(--agenthub-accent)]  dark:bg-[var(--agenthub-accent-soft)]'
                    : 'font-medium text-slate-600 hover:bg-[var(--agenthub-accent-soft)] hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100',
                  showAutomationResultNotice && 'animate-pulse ring-1 ring-[var(--agenthub-accent-border)]',
                )}
              >
                <Icon className={cn('size-4 shrink-0 stroke-[2.2]', active && 'stroke-[2.5]')} />
                {!compact && item.label}
                {showAutomationResultNotice && (
                  <span className={cn('ml-auto size-2 rounded-full bg-[var(--agenthub-accent)]', compact && 'absolute right-2 top-2')} title="有自动化任务结果生成" />
                )}
                {showUnreadNotifications && (
                  <span className={cn('ml-auto rounded-full bg-[var(--agenthub-accent)] px-1.5 py-0.5 text-3xs font-semibold text-[var(--primary-foreground)]', compact && 'absolute right-1 top-1 px-1')} title="未读通知">
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                  </span>
                )}
              </button>
            </Fragment>
          )
        })}
      </nav>

      {/* ④ 对话历史 —— **只在「对话」页渲染**。
          判据直接用既有的当前页状态 `view`（`WorkbenchNav` 的入参，源头是 app-store，
          桌面侧栏与移动端抽屉共用同一份）—— 不新造"是否显示历史"的重复状态。

          非对话页（信息中心 / Agent 库 / 能力中心 / 产物库 / 经验资产 / 自动化 /
          运行展板 / 数据概览）整块**不渲染**：组件卸载 ⇒ 布局空间直接释放，
          不留空白容器、不留固定高度、不留无效滚动区。

          弹性尺寸（`flex: 1 1 0%` + `min-height: 0`）写在 globals.css 的 `.wb-history`
          里，理由与 `.wb-nav-item` 的行高相同：不依赖 Tailwind v4 不可控的生成顺序。
          `min-height: 0` 尤其不可省 —— flex 子项默认 `min-height: auto`，
          列表内容会把它顶高，而不是让内部的 ScrollArea 去滚。 */}
      {!compact && view === 'conversations' && (
        <section className="wb-history flex flex-col overflow-hidden border-t border-[var(--agenthub-border)] pt-1.5 dark:border-[var(--agenthub-border)]">
          <ConversationListPanel variant="embedded" />
        </section>
      )}

      {/* ⑤ 底部工具 + Workspace（shrink-0，永远贴在侧栏最底）。
          `mt-auto` 取代了上一版的弹性占位 <div>：非对话页没有历史区时由它把底部推到最底；
          对话页里历史区已经把剩余高度吃满，`mt-auto` 自然失效（没有剩余空间可占）。
          这样既不需要额外的占位元素，也不会在非对话页留下任何"空白容器"。
          整块不使用任何 absolute / 覆盖定位 —— 否则它会盖住历史列表的最后几行。

          ❗ 内部的尺寸与间距保持改造前的原始值（`space-y-2 pt-3` / `p-2` / `size-9`）：
             这是用户明确要求「不要动」的区域。曾把它压成 `px-1.5 py-1` + `size-8`，
             结果 Workspace 那一行连同 Local 徽章被挤到展示不全 —— 不要再压。
          ❗指南与「官网」入口都不在这里：前者已移入设置第 10 个 Tab，
             后者本就在设置「官网」页，不重复添加。 */}
      <div className="mt-auto shrink-0 space-y-2 pt-3">
        {/* Workspace 入口 + 详情弹出面板。
            面板通过 Popover.Portal 渲染到 body，因此可以跨出侧栏、不被 aside 的
            overflow-hidden 裁切；定位在入口上方（side="top"），左侧对齐触发器
            （align="start"），向右延伸覆盖主内容区。 */}
        <Popover open={accountOpen && !compact} onOpenChange={(open) => { if (!compact) setAccountOpen(open) }}>
          <PopoverTrigger
            onClick={() => compact && setCollapsed(false)}
            aria-expanded={accountOpen && !compact}
            className={cn('w-full rounded-lg border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] text-left transition hover:border-slate-300 hover:bg-slate-50 dark:border-[var(--agenthub-border)] dark:bg-[var(--agenthub-surface)] dark:hover:border-white/15 dark:hover:bg-white/5', compact ? 'px-2' : 'p-2')}
            title={compact ? '展开账户概览' : accountOpen ? '收起账户概览' : '展开账户概览'}
          >
            <div className={cn('flex items-center gap-2', compact && 'justify-center')}>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">A</div>
              {!compact && (
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <div className="truncate text-xs font-medium">Workspace</div>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-3xs font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">Local</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    本地模式
                  </div>
                </div>
              )}
              {!compact && <ChevronDown className={cn('size-4 shrink-0 text-slate-400 transition-transform', accountOpen && 'rotate-180')} />}
            </div>
          </PopoverTrigger>
          {!compact && (
            <PopoverContent side="top" align="start" sideOffset={8} className="w-[380px] border-none bg-transparent p-0 shadow-none">
              <UserAccountOverview
                className="h-[460px] max-h-[min(90vh,520px)] w-[380px]"
                usage={usage}
                onReload={usage.reload}
                onOpenSettings={() => { setAccountOpen(false); onOpenSettings() }}
                onClose={() => setAccountOpen(false)}
              />
            </PopoverContent>
          )}
        </Popover>
      </div>
    </aside>
  )
}

// 新任务页 A 方案「聚焦型」常量（只供 NewTaskView 使用）。
type OutputKindId = 'image-text' | 'docs' | 'code' | 'data'

// 产出 chip：现有代码里没有独立的“产出类型”字段，此处映射到既有的场景分类
// （设计产物 / 内容文档 / 代码开发 / 金融投资），切换改变最近团队行的候选顺序。
const OUTPUT_KINDS: { id: OutputKindId; label: string; category: SceneCategoryId; icon: LucideIcon }[] = [
  { id: 'image-text', label: '图文', category: 'design', icon: Image },
  { id: 'docs', label: '文档', category: 'docs', icon: FileText },
  { id: 'code', label: '代码', category: 'code', icon: Code },
  { id: 'data', label: '数据分析', category: 'finance', icon: BarChart3 },
]

// 示例 pills：点按填入输入框（不改团队选择）。
const EXAMPLE_PILLS: { label: string; icon: LucideIcon }[] = [
  { label: '做一套产品宣传图', icon: Image },
  { label: '写一篇公众号推文', icon: PenLine },
  { label: '分析这份销售数据', icon: BarChart3 },
  { label: '生成一个落地页', icon: LayoutTemplate },
]

// 最近团队行单字色块配色（按效果图顺序：工程蓝 / 钢蓝 / 金 / 灰）。
const RECENT_TEAM_COLORS = ['var(--agenthub-accent)', '#3E7CB1', 'var(--agenthub-gold)']
const NEW_TEAM_COLOR = '#5B606B'

// W6 新建任务页背景（方案一：淡网格 + 柔光，用户 2026-11-18 已选）。
// 网格选 38px color-mix 直线网格，而不用 --agenthub-pattern：浅色六套的 pattern
// 是圆点阵（非 mock 的直线网格），深色 pattern 仅约 5% 且无固定格距；38px 直线网格
// 按每主题 primary 走 7%（浅）/ 9%（深），与 mock 几何一致、切主题跟着换。
// 7%/9% 落地值按 mock 代码（深色 9%）而非说明卡文字的“各主题 7%”。
const NEWTASK_GRID_MASK = 'radial-gradient(ellipse 90% 75% at 50% 38%, #000 30%, transparent 78%)'
const NEWTASK_GRID_IMAGE = (alpha: string) =>
  `linear-gradient(color-mix(in srgb, var(--primary) ${alpha}, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--primary) ${alpha}, transparent) 1px, transparent 1px)`
// 柔光实测定位：composer 顶 220.5px、高 244.3px（1366 与 1920 实测一致，顶部锚定
// 布局），中心约 342.6px。旧 640×340 top:173 使光心落在输入框中心，但 composer 是
// 不透明白卡、比柔光宽 370px，柔光被整块盖住、仅上下边缘透出暖晕（batch 3 项 3）。
// 改法：椭圆加宽到 1500px（max-w-full 兜底，1366 下取容器宽 1078、仍比 composer 宽
// 68px；1920 下 1500 比 composer 宽 156px），光心上移到 310px，柔光上沿 130px、
// 在 composer 上方露出一道约 90px 的暖晕带，左右也溢出卡外；金 28% + primary 12%
// 的浓度不变，保持克制、不抢内容。外层容器另加 overflow-x-hidden，兜住加宽后
// blur(28px) 向两侧漫出的像素，避免横向滚动条。
// 深浅共用同一团柔光（与 mock 一致）。
const NEWTASK_GLOW_TOP = 130
const NEWTASK_GLOW_HEIGHT = 360
const NEWTASK_GLOW_BACKGROUND =
  'radial-gradient(closest-side, color-mix(in srgb, var(--agenthub-gold) 28%, transparent), color-mix(in srgb, var(--primary) 12%, transparent) 55%, transparent)'

function NewTaskView({
  onOpenConversations,
  onOpenAgents,
}: {
  onOpenConversations: () => void
  onOpenAgents: () => void
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
  const [activeCategory, setActiveCategory] = useState<SceneCategoryId>('design')
  const [activeSubcategoryId, setActiveSubcategoryId] = useState<string | null>(null)
  // A 方案 chips：产出类型（现有代码里没有独立的“产出类型”字段，此处映射到既有
  // 场景分类——设计产物/内容文档/代码开发/金融投资；切换会改变下方最近团队行的
  // 候选顺序与 chip 文案，见 recentTeams）。参考图/团队/更多三枚 chip 均接真实功能。
  const [outputKind, setOutputKind] = useState<OutputKindId>('image-text')
  const [teamMenuOpen, setTeamMenuOpen] = useState(false)
  const [outputMenuOpen, setOutputMenuOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
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
  // 最近团队行：只取真实可召唤的团队（type === 'team'）。效果图里的「光影造像工坊 /
  // 文案小队 / 数据分析组」在代码库中不是可召唤团队（光影造像工坊只存在于 /demo 的
  // showcase 回放数据），按“不造假数据”改用真实团队名；单字色块是 fallback——全部
  // 8 个团队均未填 iconUrl，无真实头像可用。产出 chip 选中的分类排在前面。
  const recentTeams = [
    ...SUMMON_TEAMS.filter((team) => team.type === 'team' && team.category === activeCategory),
    ...SUMMON_TEAMS.filter((team) => team.type === 'team' && team.category !== activeCategory),
  ].slice(0, 3)
  const closeAllMenus = () => {
    setTeamMenuOpen(false)
    setOutputMenuOpen(false)
    setMoreMenuOpen(false)
  }

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

  // 只选团队、不动输入框内容：供团队 chip 菜单与最近团队行使用（与旧版 agent 下拉
  // 行为一致——换人选不覆盖已打好的字）。
  const selectTeam = async (team: SummonableTeam) => {
    setActiveSubcategoryId(team.id)
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
    <div className="agenthub-hide-scrollbar relative flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden overflow-y-auto bg-[var(--agenthub-surface-muted)]">
      {/* W6 背景层（方案一）：淡网格 + 柔光，z-0 在内容之下，pointer-events-none 不挡交互。
          内容容器只加 relative（不设 z-index），靠 DOM 顺序盖在背景层之上——避免新建
          stacking context 困住 composer 内的 fixed 菜单遮罩。 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 dark:hidden"
        style={{ backgroundImage: NEWTASK_GRID_IMAGE('7%'), backgroundSize: '38px 38px', maskImage: NEWTASK_GRID_MASK, WebkitMaskImage: NEWTASK_GRID_MASK }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 hidden dark:block"
        style={{ backgroundImage: NEWTASK_GRID_IMAGE('9%'), backgroundSize: '38px 38px', maskImage: NEWTASK_GRID_MASK, WebkitMaskImage: NEWTASK_GRID_MASK }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 z-0 w-[1500px] max-w-full -translate-x-1/2"
        style={{ top: NEWTASK_GLOW_TOP, height: NEWTASK_GLOW_HEIGHT, background: NEWTASK_GLOW_BACKGROUND, filter: 'blur(28px)' }}
      />
      {/* A 方案「聚焦型」：原版通栏宽度（1280px / 2xl 1440px）居中单列，文字居中；工作台外壳（侧栏）不动 */}
      <div className="relative mx-auto flex w-full max-w-[1280px] flex-1 flex-col items-center px-4 pb-8 pt-4 text-center md:px-8 md:pt-6 2xl:max-w-[1440px] 2xl:px-12">
        <p className="text-[11px] font-bold tracking-[0.1em] text-[#9A958A] dark:text-slate-500">WORKBENCH — NEW TASK</p>
        <h1 className="font-heading mt-4 text-[28px] font-black leading-[1.15] text-[#17181C] dark:text-[#EDE9E1] md:text-[44px]">
          一句话，<span className="text-[var(--agenthub-accent)]">组一支队</span>开工
        </h1>
        {/* 副文案照抄效果图。2026-11-18 batch 3 项 4：后半句原承诺“系统在你打字时
            就帮你配好”实时匹配，真实实现暂无该逻辑，已改成“创建后”才配好，不再承诺打字时匹配。 */}
        <p className="mt-2 max-w-[480px] text-[13.5px] leading-[1.7] text-[#777268] dark:text-slate-400 md:mt-3">
          把目标说清楚就行——选谁、怎么分工、产出什么，创建后系统帮你把人和分工配好。
        </p>

        {/* 大输入框 composer：白底卡片；金色只在左上一角（两条 38% 渐变描边），非整圈金框。
            上限 28vh（标题层级轮：H1 44px + 两枚 H2 让页高 +80px，为保 1366×768 顶格放得下，
            容器 pt-10→pt-6、上限 32vh→28vh；batch 4 旧数字 245.8px/724.8px 已失效）。
            极限态（textarea 顶满 215px）最近团队行底约 755px，余量约 13px。 */}
        <section className="relative mt-5 w-full rounded-[18px] border-[1.5px] border-[#D9DDE6] bg-white p-4 text-left shadow-[0_12px_32px_color-mix(in_srgb,var(--agenthub-accent)_10%,transparent)] dark:border-[#2E2A24] dark:bg-[#1C1A17] dark:shadow-none md:mt-7">
          <span aria-hidden className="pointer-events-none absolute left-0 top-0 h-[1.5px] w-[38%] rounded-tl-[18px] bg-[linear-gradient(90deg,color-mix(in_srgb,var(--agenthub-gold)_55%,transparent),transparent)]" />
          <span aria-hidden className="pointer-events-none absolute left-0 top-0 h-[38%] w-[1.5px] rounded-tl-[18px] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--agenthub-gold)_55%,transparent),transparent)]" />
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
              placeholder="帮我为「光影造像工坊」做一套小红书宣传：主图 1 张、详情长图 1 张，配一段 120 字以内的文案，风格温暖、电影感。"
              className="min-h-[120px] max-h-[min(320px,28vh)] resize-none overflow-y-auto border-0 bg-transparent px-2 pb-3 pt-2 text-[15px] leading-[1.65] text-[#17181C] shadow-none placeholder:text-slate-400 focus-visible:ring-0 dark:text-[#EDE9E1] md:min-h-[150px]"
            />
            {contentOverflow && (
              <span className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-full bg-[var(--agenthub-surface)]/85 px-2 py-0.5 text-xs font-medium text-slate-500 shadow-sm backdrop-blur dark:bg-[var(--agenthub-surface)]/85 dark:text-slate-400">
                已省略 · 框内滑动查看
              </span>
            )}
          </div>

          {/* 附件列表（参考图 chip / 粘贴上传均落在这里） */}
          {enhanceError && !enhanceOpen && <div className="px-2 pb-3 text-xs text-red-600">{enhanceError}</div>}
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2 pb-3">
              {pendingFiles.map((file) => (
                <span key={`${file.name}-${file.lastModified}`} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--agenthub-border)] bg-slate-50 px-3 py-1 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">
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

          {/* 分隔线 + chips / CTA 行 */}
          <div className="mx-2 h-px bg-[#E7E5E0] dark:bg-[#2E2A24]" />
          <div className="flex flex-wrap items-center gap-2 px-2 pb-1 pt-3">
            {/* 团队 chip：接既有团队/Agent 选择（旧版 agent 下拉 + 快捷团队胶囊合一） */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setOutputMenuOpen(false)
                  setMoreMenuOpen(false)
                  setTeamMenuOpen((open) => !open)
                }}
                aria-expanded={teamMenuOpen}
                aria-haspopup="true"
                title={selectedTeam ? `已选择小队：${selectedTeam.name}` : '选择团队或 Agent'}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E5E0] bg-[var(--agenthub-surface-muted)] px-[10px] py-[7px] text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-[#2E2A24] dark:bg-white/5 dark:text-slate-300 dark:hover:text-slate-100"
              >
                <Users className="size-3.5 shrink-0 text-[var(--agenthub-accent)]" />
                <span className="max-w-[160px] truncate">
                  {selectingTeamId ? '匹配中…' : selectedTeam ? selectedTeam.name : activeAgents.length === 1 ? getAgentDisplayName(activeAgents[0]) : activeAgents.length > 1 ? `${getAgentDisplayName(activeAgents[0])} 等 ${activeAgents.length} 位` : '选择团队'}
                </span>
                <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', teamMenuOpen && 'rotate-180')} />
              </button>
              {teamMenuOpen && (
                <>
                  <button type="button" aria-label="关闭菜单" tabIndex={-1} className="fixed inset-0 z-10 cursor-default border-0 bg-transparent p-0" onClick={closeAllMenus} />
                  <div className="absolute left-0 top-[calc(100%+8px)] z-20 max-h-[320px] w-[280px] overflow-y-auto rounded-xl border border-[var(--agenthub-border)] bg-white py-1.5 text-left shadow-[0_12px_32px_rgba(15,23,42,0.16)] dark:border-[#2E2A24] dark:bg-[#1C1A17]">
                    <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold text-slate-400">团队</p>
                    {SUMMON_TEAMS.map((team) => {
                      const TeamIcon = team.type === 'team' ? Users : Sparkles
                      const isSelected = selectedTeam?.id === team.id
                      return (
                        <button
                          key={team.id}
                          type="button"
                          onClick={() => {
                            closeAllMenus()
                            void selectTeam(team)
                          }}
                          disabled={selectingTeamId === team.id}
                          title={team.description}
                          className={cn(
                            'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70 dark:hover:bg-white/5',
                            isSelected ? 'font-semibold text-[var(--agenthub-accent)]' : 'text-slate-700 dark:text-slate-200',
                          )}
                        >
                          <TeamIcon className="size-4 shrink-0 text-[var(--agenthub-accent)]" />
                          <span className="min-w-0 flex-1 truncate">{team.name}</span>
                          <span className="shrink-0 text-xs text-slate-400">{team.type === 'team' ? `${team.members.length} 位成员` : '单 Agent'}</span>
                          {isSelected && <Check className="size-4 shrink-0" />}
                        </button>
                      )
                    })}
                    <div className="mx-3 my-1.5 h-px bg-[#E7E5E0] dark:bg-[#2E2A24]" />
                    <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold text-slate-400">单个 Agent</p>
                    {agents.map((agent) => {
                      const isSelected = !selectedTeam && activeAgentIds[0] === agent.id
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => {
                            setSelectedAgentIds([agent.id])
                            setSelectedTeam(null)
                            setActiveSubcategoryId(null)
                            closeAllMenus()
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition hover:bg-slate-50 dark:hover:bg-white/5',
                            isSelected ? 'font-semibold text-[var(--agenthub-accent)]' : 'text-slate-700 dark:text-slate-200',
                          )}
                        >
                          <AgentAvatar agent={agent} size="xs" />
                          <span className="min-w-0 flex-1 truncate">{getAgentDisplayName(agent)}</span>
                          {isSelected && <Check className="size-4 shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            {/* 产出 chip：映射到既有场景分类（无独立产出类型字段，见文件顶部注释） */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setTeamMenuOpen(false)
                  setMoreMenuOpen(false)
                  setOutputMenuOpen((open) => !open)
                }}
                aria-expanded={outputMenuOpen}
                aria-haspopup="true"
                title="选择产出类型"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E5E0] bg-[var(--agenthub-surface-muted)] px-[10px] py-[7px] text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-[#2E2A24] dark:bg-white/5 dark:text-slate-300 dark:hover:text-slate-100"
              >
                <span>产出：{OUTPUT_KINDS.find((kind) => kind.id === outputKind)?.label}</span>
                <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', outputMenuOpen && 'rotate-180')} />
              </button>
              {outputMenuOpen && (
                <>
                  <button type="button" aria-label="关闭菜单" tabIndex={-1} className="fixed inset-0 z-10 cursor-default border-0 bg-transparent p-0" onClick={closeAllMenus} />
                  <div className="absolute left-0 top-[calc(100%+8px)] z-20 w-[180px] rounded-xl border border-[var(--agenthub-border)] bg-white py-1.5 text-left shadow-[0_12px_32px_rgba(15,23,42,0.16)] dark:border-[#2E2A24] dark:bg-[#1C1A17]">
                    {OUTPUT_KINDS.map((kind) => {
                      const KindIcon = kind.icon
                      const isSelected = outputKind === kind.id
                      return (
                        <button
                          key={kind.id}
                          type="button"
                          onClick={() => {
                            setOutputKind(kind.id)
                            setActiveCategory(kind.category)
                            closeAllMenus()
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition hover:bg-slate-50 dark:hover:bg-white/5',
                            isSelected ? 'font-semibold text-[var(--agenthub-accent)]' : 'text-slate-700 dark:text-slate-200',
                          )}
                        >
                          <KindIcon className="size-4 shrink-0 text-[var(--agenthub-accent)]" />
                          <span className="min-w-0 flex-1 truncate">{kind.label}</span>
                          {isSelected && <Check className="size-4 shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            {/* 参考图 chip：接既有附件上传流程（与旧版回形针按钮同一 file input） */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="上传参考图"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E5E0] bg-[var(--agenthub-surface-muted)] px-[10px] py-[7px] text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-[#2E2A24] dark:bg-white/5 dark:text-slate-300 dark:hover:text-slate-100"
            >
              <ImagePlus className="size-3.5 shrink-0 text-[var(--agenthub-accent)]" />
              参考图
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => setPendingFiles(Array.from(event.target.files ?? []))}
            />

            {/* 增强提示词 chip：直接可见（原版工具栏按钮，A 方案曾收进“更多”菜单，用户要求放回） */}
            <button
              type="button"
              onClick={() => void enhancePrompt()}
              disabled={enhancingPrompt || sending || uploading}
              title={enhancingPrompt ? '提示词增强中' : '增强提示词'}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E5E0] bg-[var(--agenthub-surface-muted)] px-[10px] py-[7px] text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-60 dark:border-[#2E2A24] dark:bg-white/5 dark:text-slate-300 dark:hover:text-slate-100"
            >
              {enhancingPrompt ? (
                <Spinner size="sm" className="size-3.5 shrink-0" />
              ) : (
                <Sparkles className="size-3.5 shrink-0 text-[var(--agenthub-accent)]" />
              )}
              {enhancingPrompt ? '增强中…' : '增强提示词'}
            </button>

            {/* 更多 chip：高级选项收进这里——目前只有真实存在的一项（写入审批）；
                提示词增强已移回工具栏直接可见。“优先级”在现有代码里没有对应功能，不造假项。 */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setTeamMenuOpen(false)
                  setOutputMenuOpen(false)
                  setMoreMenuOpen((open) => !open)
                }}
                aria-expanded={moreMenuOpen}
                aria-haspopup="true"
                title="更多选项"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E5E0] bg-[var(--agenthub-surface-muted)] px-[10px] py-[7px] text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-[#2E2A24] dark:bg-white/5 dark:text-slate-300 dark:hover:text-slate-100"
              >
                更多
                <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', moreMenuOpen && 'rotate-180')} />
              </button>
              {moreMenuOpen && (
                <>
                  <button type="button" aria-label="关闭菜单" tabIndex={-1} className="fixed inset-0 z-10 cursor-default border-0 bg-transparent p-0" onClick={closeAllMenus} />
                  <div className="absolute left-0 top-[calc(100%+8px)] z-20 w-[220px] rounded-xl border border-[var(--agenthub-border)] bg-white py-1.5 text-left shadow-[0_12px_32px_rgba(15,23,42,0.16)] dark:border-[#2E2A24] dark:bg-[#1C1A17]">
                    <button
                      type="button"
                      onClick={() => {
                        setApprovalMode((mode) => (mode === 'review' ? 'auto' : 'review'))
                        closeAllMenus()
                      }}
                      title="切换写入审批模式"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5"
                    >
                      <span className="min-w-0 flex-1 truncate">写入审批</span>
                      <span className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                        approvalMode === 'review'
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400',
                      )}
                      >
                        {approvalMode === 'review' ? 'Review' : 'Auto'}
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* CTA：创建任务（旧版圆形发送按钮的同一 submit） */}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!content.trim() || activeAgentIds.length === 0 || sending || uploading}
              title={uploading ? '上传中' : '创建任务'}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--agenthub-accent)] px-[18px] py-[10px] text-[13.5px] font-extrabold text-[var(--primary-foreground)] transition hover:bg-[var(--agenthub-accent-hover)] disabled:opacity-60"
            >
              {sending || uploading ? '创建中…' : (
                <>
                  创建任务
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </div>
        </section>

        {/* 示例 pills：点按填入输入框 */}
        <h2 className="mt-6 text-[17px] font-bold text-[#17181C] dark:text-[#EDE9E1] md:mt-9">不知道怎么开头？试试这些</h2>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {EXAMPLE_PILLS.map((pill) => {
            const PillIcon = pill.icon
            return (
              <button
                key={pill.label}
                type="button"
                onClick={() => {
                  setContent(pill.label)
                  taskInputRef.current?.focus()
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E5E0] bg-white px-3 py-2 text-[12.5px] font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-[#2E2A24] dark:bg-[#1C1A17] dark:text-slate-200 dark:hover:text-white"
              >
                <PillIcon className="size-3.5 shrink-0 text-[var(--agenthub-accent)]" />
                {pill.label}
              </button>
            )
          })}
        </div>

        {/* 最近团队：真实可召唤团队 + 新建团队；与侧栏最近对话列表并存（后者在会话视图，不动） */}
        <h2 className="mt-6 text-[17px] font-bold text-[#17181C] dark:text-[#EDE9E1] md:mt-9">最近的团队</h2>
        <div className="mt-3 flex items-start justify-center gap-[18px]">
          {recentTeams.map((team, index) => {
            const active = activeSubcategoryId === team.id
            return (
              <div key={team.id} className="flex w-[72px] flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void selectTeam(team)}
                  disabled={selectingTeamId === team.id}
                  title={team.description}
                  aria-pressed={active}
                  className={cn(
                    'flex size-[32px] items-center justify-center rounded-full text-[15px] font-bold transition hover:opacity-90 disabled:cursor-wait disabled:opacity-70 md:size-[38px]',
                    RECENT_TEAM_COLORS[index % RECENT_TEAM_COLORS.length] === 'var(--agenthub-accent)'
                      ? 'text-[var(--primary-foreground)]'
                      : 'text-white',
                    active && 'ring-2 ring-[var(--agenthub-accent)] ring-offset-2 ring-offset-[var(--agenthub-surface-muted)]',
                  )}
                  style={{ backgroundColor: RECENT_TEAM_COLORS[index % RECENT_TEAM_COLORS.length] }}
                >
                  {selectingTeamId === team.id ? '…' : team.name.charAt(0)}
                </button>
                <span className="whitespace-nowrap text-center text-[11px] leading-tight text-[#8A857B] dark:text-slate-500">{team.name}</span>
              </div>
            )
          })}
          <div className="flex w-[72px] flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenAgents}
              title="去 Agent 库新建团队"
              className="flex size-[32px] items-center justify-center rounded-full text-white transition hover:opacity-90 md:size-[38px]"
              style={{ backgroundColor: NEW_TEAM_COLOR }}
            >
              <Plus className="size-4" />
            </button>
            <span className="whitespace-nowrap text-center text-[11px] leading-tight text-[#8A857B] dark:text-slate-500">新建团队</span>
          </div>
        </div>

        {sceneAgentError && <div className="mt-4 text-xs text-amber-600 dark:text-amber-300">{sceneAgentError}</div>}
      </div>
    </div>
  )
}


function ConversationListPanel({ variant = 'standalone', onSelectConversation }: { variant?: 'standalone' | 'embedded'; onSelectConversation?: () => void }) {
  const allConversations = useConversationList()
  // 归档会话默认不显示，但必须留一个入口 —— 否则「归档」就是一次性删除
  // （线上 2026-09-16 报障：自动化产出写进了已归档会话，对话页里找不到）。
  const conversations = allConversations.filter((c) => !c.archived)
  const archivedConversations = allConversations.filter((c) => c.archived)
  const activeId = useAppStore((s) => s.activeConversationId)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)
  // 选中即打开：抽屉里复用本列表时，选中后由调用方收起抽屉（桌面侧栏不传该回调，行为不变）。
  const selectConversation = (conversationId: string) => {
    setActiveConversation(conversationId)
    onSelectConversation?.()
  }
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
      variant === 'standalone' && 'agenthub-card-container hidden w-[292px] shrink-0 lg:flex',
      variant === 'embedded' && 'h-full',
    )}>
      {/* embedded（侧栏内）时它是 flex 列里的固定块：标题 + 说明 + 搜索钉在历史区顶部，
          真正的列表在下面的 ScrollArea 里独立滚动。`shrink-0` 保证它不被列表内容压扁。 */}
      <div className={cn('shrink-0 border-b border-[var(--agenthub-border)]', variant === 'embedded' ? 'pb-2' : 'p-4')}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className={cn('font-semibold', variant === 'embedded' ? 'text-sm' : 'text-base')}>对话历史</h2>
            <p className={cn('truncate text-xs text-slate-500', variant === 'embedded' ? 'mt-0.5' : 'mt-1')}>选择一个会话继续协作</p>
          </div>
          {variant === 'standalone' && (
            <div className="flex shrink-0 items-center gap-1">
              <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]">
                <MessageSquare className="size-4" />
              </div>
            </div>
          )}
        </div>
        <div className={cn('relative', variant === 'embedded' ? 'mt-2' : 'mt-3')}>
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索对话" className="h-8 rounded-lg border-0 bg-slate-100 pl-9 text-xs shadow-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-[var(--agenthub-accent-border)]" />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5 py-2">
          <div className="px-2 pb-1 text-3xs font-medium uppercase tracking-wider text-slate-400">最近对话</div>
          {filtered.map((conversation) => {
            const isGroup = conversation.mode === 'group' || conversation.agentIds.length > 1
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => selectConversation(conversation.id)}
                onContextMenu={(event) => {
                  // 右键不该同时触发浏览器原生菜单（会把自绘菜单顶掉）
                  event.preventDefault()
                  setContextMenu({ convId: conversation.id, x: event.clientX, y: event.clientY })
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 text-left transition',
                  'h-11',
                  activeId === conversation.id
                    ? 'bg-[var(--agenthub-accent-soft)] text-slate-950 dark:text-slate-50'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-slate-100',
                )}
              >
                <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', activeId === conversation.id ? 'bg-[var(--agenthub-surface)] text-[var(--agenthub-accent)]' : 'bg-slate-100 text-slate-500')}>
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
                    <span className="block truncate text-sm font-medium leading-5">{conversation.title}</span>
                  )}
                  <span className="mt-0.5 block truncate text-3xs leading-4 text-slate-500">
                    {conversation.agentIds.map((id) => agents[id] ? getAgentDisplayName(agents[id]) : null).filter(Boolean).join(' / ') || '未配置 Agent'}
                  </span>
                </span>
                <span className="ml-1 shrink-0 self-start pt-1 text-3xs text-slate-400">{formatConversationTime(conversation.updatedAt)}</span>
              </button>
            )
          })}
          {filtered.length === 0 && (
            <div className={cn('px-3 text-center text-xs text-slate-500', variant === 'embedded' ? 'py-5' : 'py-8')}>
              {conversations.length === 0
                ? '还没有对话，从上方「新建任务」开始'
                : `没有匹配「${query.trim()}」的会话`}
            </div>
          )}

          {archivedConversations.length > 0 && (
            <div className="mt-2 border-t border-[var(--agenthub-border)] pt-2 dark:border-white/5">
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                aria-expanded={showArchived}
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-slate-500 transition hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5"
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
                    onClick={() => selectConversation(conversation.id)}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      setContextMenu({ convId: conversation.id, x: event.clientX, y: event.clientY })
                    }}
                    title="已归档 · 右键可取消归档或删除"
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2 text-left opacity-70 transition hover:bg-slate-50 hover:opacity-100 dark:hover:bg-white/5 dark:hover:text-slate-100',
                      'h-11',
                      activeId === conversation.id && 'bg-[var(--agenthub-accent-soft)] opacity-100',
                    )}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/5">
                      <Archive className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.8125rem] font-medium leading-5 text-slate-600 dark:text-slate-300">{conversation.title}</span>
                      <span className="mt-0.5 block truncate text-3xs leading-4 text-slate-400">
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
              onSelect: () => selectConversation(contextConversation.id),
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
      className="w-full rounded border border-primary/40 bg-background px-1.5 py-0.5 text-sm font-medium outline-none ring-2 ring-primary/30"
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
