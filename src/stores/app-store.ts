'use client'

import { enableMapSet } from 'immer'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import type { AgentRunRow, AgentRow, ArtifactRow, AttachmentRow, ConversationWithMeta, MessageRow, WorkspaceMemoryRow } from '@/db/schema'
import { getToolDisplayName } from '@/lib/tool-display'
import type {
  AgentRunDebugDetail,
  AgentRunDebugEventRecord,
  AgentRunDebugListItem,
  AppNotification,
  AppNotificationTarget,
  AppNotificationTargetType,
  DispatchPlanItem,
  DispatchTaskStatus,
  MessagePart,
  PendingBashCommand,
  PendingDispatchPlan,
  PendingMcpToolApproval,
  PendingQuestion,
  PendingWrite,
  StreamEvent,
  TerminalEventRecord,
  TerminalSessionRecord,
} from '@/shared/types'

enableMapSet()

export type AppWorkbenchView = 'new-task' | 'conversations' | 'agents' | 'capability-center' | 'artifacts' | 'experiences' | 'automation' | 'run-board' | 'analytics' | 'information-center'

export type SettingsSection = 'api-keys' | 'providers' | 'workspaces' | 'notifications'

export interface AutomationResultNotice {
  notificationId: string
  conversationId: string
  automationId?: string
  runId?: string
  createdAt: number
}

export interface DispatchState {
  runId: string                                    // Orchestrator 的 runId
  messageId: string                                // 触发 plan 的 Orchestrator message id
  plan: DispatchPlanItem[]
  taskStatus: Record<string, DispatchTaskStatus>
  childRunIds: Record<string, string>              // taskId → childRunId
  reviewStatus?: 'pending' | 'approved' | 'rejected'
  pendingPlanId?: string
}

interface AppState {
  // ─── 实体 ──────────────────────────────────────────
  conversations: Record<string, ConversationWithMeta>
  agents: Record<string, AgentRow>
  messages: Record<string, MessageRow>
  artifacts: Record<string, ArtifactRow>

  // ─── 关系（按 conversationId 分桶）───────────────
  messageIdsByConv: Record<string, string[]>
  runsByConv: Record<string, Record<string, AgentRunRow>>

  // Orchestrator 的调度状态，按 Orchestrator runId 索引
  dispatchesByRunId: Record<string, DispatchState>

  // ─── 工作台导航 ──────────────────────────────────────
  workbenchView: AppWorkbenchView

  // ─── 当前会话 ──────────────────────────────────────
  activeConversationId: string | null

  // ─── 产物预览 ──────────────────────────────────────
  previewArtifactId: string | null
  activeArtifactId: string | null
  activeAutomationId: string | null
  activeAutomationRunId: string | null
  activeRunBoardConversationId: string | null
  activeRunBoardRunId: string | null
  settingsOpen: boolean
  activeSettingsSection: SettingsSection | null

  // ─── 右侧文件浏览器面板（与 artifact preview 互斥）─
  fileExplorerOpen: boolean

  // ─── 中间 tab 容器：每个会话的「对话 + 打开的文件 tab」状态 ─
  // tab id: 'chat' 表示主对话；其它是相对 workspace 的文件路径
  openFilesByConv: Record<string, string[]>      // 文件路径列表（按打开顺序）
  activeTabByConv: Record<string, string>        // 当前 tab id

  // ─── 引用回复目标（按 conversationId 分桶）───────
  replyTargetByConv: Record<string, string | null>

  // ─── 选区改写：等待注入到 MessageInput 的引用块（全局，不分会话） ─
  pendingQuoteForInput: {
    text: string
    sourceLabel: string
    /** 选区意图：'ask' 来自聊天消息（就这段提问），'rewrite' 来自 artifact/文件（默认） */
    kind?: 'rewrite' | 'ask'
    /** 可选：选区来自哪个 artifact，方便 agent 用 read_artifact 拿完整上下文 */
    artifactId?: string
    /** 可选：选区来自哪个文件路径 */
    filePath?: string
  } | null

  // ─── 待发送的附件（按 conversationId 分桶）。文件库和 MessageInput 共享。
  pendingAttachmentsByConv: Record<string, AttachmentRow[]>

  // ─── Agent fs_write 审批等待队列（按 conversationId 分桶）─
  pendingWritesByConv: Record<string, PendingWrite[]>

  // ─── Agent bash 关键命令审批等待队列（按 conversationId 分桶）─
  pendingBashCommandsByConv: Record<string, PendingBashCommand[]>

  // ─── 外部 MCP 工具调用审批等待队列（按 conversationId 分桶）─
  pendingMcpToolApprovalsByConv: Record<string, PendingMcpToolApproval[]>

  // ─── Workspace Memory（按 conversationId 分桶，面板 lazy fetch）─
  workspaceMemoriesByConv: Record<string, WorkspaceMemoryRow[]>

  // ─── Agent Run Debug（面板 lazy fetch）─
  agentRunDebugByConv: Record<string, AgentRunDebugListItem[]>
  agentRunDebugDetailsByRun: Record<string, AgentRunDebugDetail>
  agentRunDebugEventsByRun: Record<string, AgentRunDebugEventRecord[]>
  terminalSessionsByRun: Record<string, TerminalSessionRecord[]>
  terminalEventsBySession: Record<string, TerminalEventRecord[]>

  // ─── Agent ask_user 结构化问答等待队列（按 conversationId 分桶）─
  pendingQuestionsByConv: Record<string, PendingQuestion[]>

  // ─── 未读计数（流式响应到达时，非 active 会话 +1；切到该会话清零）
  unreadByConv: Record<string, number>

  // ─── 移动端 sidebar 抽屉开关 ──
  mobileSidebarOpen: boolean

  // ─── 流连接状态 ────────────────────────────────────
  streamConnected: boolean

  // ─── 用户通知 ──────────────────────────────────────
  notifications: AppNotification[]
  persistentNotifications: AppNotification[]
  unreadNotificationCount: number
  automationResultNotices: Record<string, AutomationResultNotice>
  pendingMessageJump: { conversationId: string; messageId: string } | null

  // ─── actions ───────────────────────────────────────
  setStreamConnected(connected: boolean): void
  setWorkbenchView(view: AppWorkbenchView): void
  openConversation(conversationId: string): void
  openConversationTarget(target: { conversationId: string; messageId?: string | null }): void
  openNotificationTarget(target: AppNotificationTarget): void
  openSettingsTarget(section?: string | null): void
  closeSettingsTarget(): void
  openAutomationTarget(target: { automationId: string; runId?: string | null }): void
  openRunBoardTarget(target: { conversationId: string; runId?: string | null }): void
  clearRunBoardTarget(): void
  openArtifactTarget(target: { artifactId: string; conversationId?: string | null; messageId?: string | null }): void
  consumePendingMessageJump(): { conversationId: string; messageId: string } | null
  addNotification(notification: AppNotification): void
  dismissNotification(id: string): void
  clearNotifications(): void
  setPersistentNotifications(list: AppNotification[], unreadCount?: number): void
  upsertPersistentNotification(notification: AppNotification): void
  setUnreadNotificationCount(count: number): void
  markNotificationReadLocal(id: string): void
  deleteNotificationLocal(id: string): void

  setConversations(list: ConversationWithMeta[]): void
  upsertConversation(conv: ConversationWithMeta): void
  removeConversation(id: string): void

  setAgents(list: AgentRow[]): void
  upsertAgent(agent: AgentRow): void
  removeAgent(agentId: string): void

  setMessagesForConversation(conversationId: string, list: MessageRow[]): void
  /** 单条 message upsert（编辑后重发场景：服务端写完 user message，前端要自己塞进 store）。 */
  upsertMessage(message: MessageRow): void
  setActiveConversation(id: string | null): void

  setMobileSidebarOpen(open: boolean): void

  openArtifactPreview(artifactId: string): void
  closeArtifactPreview(): void
  upsertArtifact(artifact: ArtifactRow): void
  removeArtifact(artifactId: string): void
  removeArtifacts(artifactIds: string[]): void

  setFileExplorerOpen(open: boolean): void
  openFile(conversationId: string, path: string): void
  closeFile(conversationId: string, path: string): void
  setActiveTab(conversationId: string, tab: string): void

  setReplyTarget(conversationId: string, messageId: string | null): void

  setPendingQuote(quote: AppState['pendingQuoteForInput']): void

  setBookmarkedMessageIds(conversationId: string, ids: string[]): void

  setPinnedMessageIds(conversationId: string, ids: string[]): void

  /** 批量删除消息（撤回 / 编辑场景）。同时清理 messageIdsByConv 对应桶 + replyTarget。 */
  removeMessages(conversationId: string, messageIds: string[]): void
  clearConversationHistory(conversationId: string, conversation: ConversationWithMeta): void

  addPendingAttachment(conversationId: string, attachment: AttachmentRow): void
  removePendingAttachment(conversationId: string, attachmentId: string): void
  clearPendingAttachments(conversationId: string): void

  setPendingWritesForConversation(conversationId: string, list: PendingWrite[]): void

  setPendingBashCommandsForConversation(
    conversationId: string,
    list: PendingBashCommand[],
  ): void

  setPendingMcpToolApprovalsForConversation(
    conversationId: string,
    list: PendingMcpToolApproval[],
  ): void

  setWorkspaceMemoriesForConversation(conversationId: string, list: WorkspaceMemoryRow[]): void
  upsertWorkspaceMemory(conversationId: string, memory: WorkspaceMemoryRow): void
  removeWorkspaceMemory(conversationId: string, memoryId: string): void

  setAgentRunDebugList(conversationId: string, runs: AgentRunDebugListItem[]): void
  upsertAgentRunDebugList(conversationId: string, runs: AgentRunDebugListItem[]): void
  setAgentRunDebugDetail(runId: string, detail: AgentRunDebugDetail): void
  setAgentRunDebugEvents(runId: string, events: AgentRunDebugEventRecord[]): void
  setTerminalSessionsForRun(runId: string, sessions: TerminalSessionRecord[]): void
  setTerminalEventsForSession(sessionId: string, events: TerminalEventRecord[]): void

  setPendingQuestionsForConversation(conversationId: string, list: PendingQuestion[]): void

  setPendingDispatchPlansForConversation(
    conversationId: string,
    list: PendingDispatchPlan[],
  ): void

  /** 高亮指定消息 1.5 秒（点击「引用」预览时的跳转反馈） */
  highlightedMessageId: string | null
  highlightMessage(messageId: string): void

  addLocalUserMessage(args: {
    tempId: string
    conversationId: string
    content: string
    mentionedAgentIds: string[]
    parentMessageId?: string | null
    attachments?: AttachmentRow[]
  }): void
  replaceLocalMessageId(tempId: string, realId: string): void

  applyEvent(event: StreamEvent): void
}

export const useAppStore = create<AppState>()(
  immer((set) => ({
    conversations: {},
    agents: {},
    messages: {},
    artifacts: {},
    messageIdsByConv: {},
    runsByConv: {},
    dispatchesByRunId: {},
    workbenchView: 'new-task',
    activeConversationId: null,
    previewArtifactId: null,
    activeArtifactId: null,
    activeAutomationId: null,
    activeAutomationRunId: null,
    activeRunBoardConversationId: null,
    activeRunBoardRunId: null,
    settingsOpen: false,
    activeSettingsSection: null,
    fileExplorerOpen: false,
    openFilesByConv: {},
    activeTabByConv: {},
    replyTargetByConv: {},
    pendingAttachmentsByConv: {},
    pendingWritesByConv: {},
    pendingBashCommandsByConv: {},
    pendingMcpToolApprovalsByConv: {},
    workspaceMemoriesByConv: {},
    agentRunDebugByConv: {},
    agentRunDebugDetailsByRun: {},
    agentRunDebugEventsByRun: {},
    terminalSessionsByRun: {},
    terminalEventsBySession: {},
    pendingQuestionsByConv: {},
    unreadByConv: {},
    mobileSidebarOpen: false,
    pendingQuoteForInput: null,
    highlightedMessageId: null,
    streamConnected: false,
    notifications: [],
    persistentNotifications: [],
    unreadNotificationCount: 0,
    automationResultNotices: {},
    pendingMessageJump: null,

    setStreamConnected: (connected) =>
      set((s) => {
        s.streamConnected = connected
      }),

    setWorkbenchView: (view) =>
      set((s) => {
        s.workbenchView = view
      }),

    openConversation: (conversationId) =>
      set((s) => {
        s.workbenchView = 'conversations'
        s.activeConversationId = conversationId
        delete s.unreadByConv[conversationId]
        for (const [id, notice] of Object.entries(s.automationResultNotices)) {
          if (notice.conversationId === conversationId) delete s.automationResultNotices[id]
        }
        s.mobileSidebarOpen = false
      }),

    openConversationTarget: (target) =>
      set((s) => {
        s.workbenchView = 'conversations'
        s.activeConversationId = target.conversationId
        if (target.messageId) {
          s.pendingMessageJump = { conversationId: target.conversationId, messageId: target.messageId }
        }
        delete s.unreadByConv[target.conversationId]
        for (const [id, notice] of Object.entries(s.automationResultNotices)) {
          if (notice.conversationId === target.conversationId) delete s.automationResultNotices[id]
        }
        s.mobileSidebarOpen = false
      }),

    openNotificationTarget: (target) => {
      const targetType: AppNotificationTargetType = target.type
      if (targetType === 'conversation' && target.conversationId) {
        useAppStore.getState().openConversationTarget({
          conversationId: target.conversationId,
          messageId: target.messageId,
        })
        return
      }
      if (targetType === 'settings') {
        useAppStore.getState().openSettingsTarget(target.settingsSection)
        return
      }
      if (targetType === 'automation' && target.automationId) {
        useAppStore.getState().openAutomationTarget({ automationId: target.automationId, runId: target.runId })
        return
      }
      if (targetType === 'artifact' && target.artifactId) {
        useAppStore.getState().openArtifactTarget({
          artifactId: target.artifactId,
          conversationId: target.conversationId,
          messageId: target.messageId,
        })
      }
    },

    openSettingsTarget: (section) =>
      set((s) => {
        s.settingsOpen = true
        s.activeSettingsSection = normalizeSettingsSection(section)
        s.mobileSidebarOpen = false
      }),

    closeSettingsTarget: () =>
      set((s) => {
        s.settingsOpen = false
      }),

    openAutomationTarget: (target) =>
      set((s) => {
        s.workbenchView = 'automation'
        s.activeAutomationId = target.automationId
        s.activeAutomationRunId = target.runId ?? null
        s.activeRunBoardConversationId = null
        s.activeRunBoardRunId = null
        s.mobileSidebarOpen = false
      }),

    openRunBoardTarget: (target) =>
      set((s) => {
        s.workbenchView = 'run-board'
        s.activeConversationId = target.conversationId
        s.activeRunBoardConversationId = target.conversationId
        s.activeRunBoardRunId = target.runId ?? null
        s.activeAutomationId = null
        s.activeAutomationRunId = null
        s.mobileSidebarOpen = false
      }),

    clearRunBoardTarget: () =>
      set((s) => {
        s.activeRunBoardConversationId = null
        s.activeRunBoardRunId = null
      }),

    openArtifactTarget: (target) =>
      set((s) => {
        s.workbenchView = 'artifacts'
        s.activeArtifactId = target.artifactId
        s.previewArtifactId = target.artifactId
        if (target.conversationId && target.messageId) {
          s.pendingMessageJump = { conversationId: target.conversationId, messageId: target.messageId }
        }
        s.mobileSidebarOpen = false
      }),

    consumePendingMessageJump: () => {
      let jump: { conversationId: string; messageId: string } | null = null
      set((s) => {
        jump = s.pendingMessageJump
        s.pendingMessageJump = null
      })
      return jump
    },

    addNotification: (notification) =>
      set((s) => {
        if (s.notifications.some((item) => item.id === notification.id)) return
        s.notifications.unshift(notification)
        if (s.notifications.length > 20) s.notifications.length = 20
      }),

    dismissNotification: (id) =>
      set((s) => {
        s.notifications = s.notifications.filter((item) => item.id !== id)
      }),

    clearNotifications: () =>
      set((s) => {
        s.notifications = []
      }),

    setPersistentNotifications: (list, unreadCount) =>
      set((s) => {
        s.persistentNotifications = list
        if (typeof unreadCount === 'number') s.unreadNotificationCount = unreadCount
      }),

    upsertPersistentNotification: (notification) =>
      set((s) => {
        const existing = s.persistentNotifications.findIndex((item) => item.id === notification.id)
        if (existing >= 0) s.persistentNotifications[existing] = notification
        else s.persistentNotifications.unshift(notification)
      }),

    setUnreadNotificationCount: (count) =>
      set((s) => {
        s.unreadNotificationCount = Math.max(0, count)
      }),

    markNotificationReadLocal: (id) =>
      set((s) => {
        const now = Date.now()
        for (const item of s.persistentNotifications) {
          if (item.id === id && !item.readAt) {
            item.readAt = now
            item.updatedAt = now
            s.unreadNotificationCount = Math.max(0, s.unreadNotificationCount - 1)
          }
        }
      }),

    deleteNotificationLocal: (id) =>
      set((s) => {
        const item = s.persistentNotifications.find((notification) => notification.id === id)
        if (item && !item.readAt) s.unreadNotificationCount = Math.max(0, s.unreadNotificationCount - 1)
        s.persistentNotifications = s.persistentNotifications.filter((notification) => notification.id !== id)
        s.notifications = s.notifications.filter((notification) => notification.id !== id)
        delete s.automationResultNotices[id]
      }),

    setConversations: (list) =>
      set((s) => {
        for (const c of list) s.conversations[c.id] = c
      }),

    upsertConversation: (conv) =>
      set((s) => {
        s.conversations[conv.id] = conv
      }),

    removeConversation: (id) =>
      set((s) => {
        delete s.conversations[id]
        // 清理该会话所有消息
        const msgIds = s.messageIdsByConv[id] ?? []
        for (const mid of msgIds) delete s.messages[mid]
        delete s.messageIdsByConv[id]
        delete s.runsByConv[id]
        delete s.pendingWritesByConv[id]
        delete s.pendingBashCommandsByConv[id]
        delete s.pendingMcpToolApprovalsByConv[id]
        delete s.workspaceMemoriesByConv[id]
        delete s.agentRunDebugByConv[id]
        for (const runId in s.agentRunDebugDetailsByRun) {
          if (s.agentRunDebugDetailsByRun[runId].agentRun.conversationId === id) {
            delete s.agentRunDebugDetailsByRun[runId]
          }
        }
        for (const runId in s.agentRunDebugEventsByRun) {
          if (s.agentRunDebugEventsByRun[runId].some((event) => event.conversationId === id)) {
            delete s.agentRunDebugEventsByRun[runId]
          }
        }
        delete s.pendingQuestionsByConv[id]
        if (s.activeConversationId === id) s.activeConversationId = null
      }),

    setAgents: (list) =>
      set((s) => {
        for (const a of list) s.agents[a.id] = a
      }),

    upsertAgent: (agent) =>
      set((s) => {
        s.agents[agent.id] = agent
      }),

    removeAgent: (agentId) =>
      set((s) => {
        delete s.agents[agentId]
      }),

    setMessagesForConversation: (conversationId, list) =>
      set((s) => {
        const nextIds = list.map((m) => m.id)
        if (!areStringArraysEqual(s.messageIdsByConv[conversationId], nextIds)) {
          s.messageIdsByConv[conversationId] = nextIds
        }
        for (const m of list) {
          const existing = s.messages[m.id]
          if (!existing || !areMessagesEquivalent(existing, m)) {
            s.messages[m.id] = m
          }
          attachDispatchToMessageForRun(s.dispatchesByRunId, m.runId, m.id)
        }
      }),

    upsertMessage: (message) =>
      set((s) => {
        s.messages[message.id] = message
        const bucket = (s.messageIdsByConv[message.conversationId] ??= [])
        if (!bucket.includes(message.id)) bucket.push(message.id)
        attachDispatchToMessageForRun(s.dispatchesByRunId, message.runId, message.id)
      }),

    setActiveConversation: (id) =>
      set((s) => {
        s.activeConversationId = id
        // 切到该会话即视为已读
        if (id) delete s.unreadByConv[id]
        // 切会话时自动收起移动 sidebar
        if (id) s.mobileSidebarOpen = false
      }),

    setMobileSidebarOpen: (open) =>
      set((s) => {
        s.mobileSidebarOpen = open
      }),

    setPendingQuote: (quote) =>
      set((s) => {
        s.pendingQuoteForInput = quote
      }),

    openArtifactPreview: (artifactId) =>
      set((s) => {
        s.previewArtifactId = artifactId
        s.fileExplorerOpen = false // 与文件浏览器互斥
      }),

    closeArtifactPreview: () =>
      set((s) => {
        s.previewArtifactId = null
      }),

    setFileExplorerOpen: (open) =>
      set((s) => {
        s.fileExplorerOpen = open
        if (open) s.previewArtifactId = null // 与 artifact preview 互斥
      }),

    openFile: (conversationId, filePath) =>
      set((s) => {
        const list = s.openFilesByConv[conversationId] ?? []
        if (!list.includes(filePath)) {
          s.openFilesByConv[conversationId] = [...list, filePath]
        }
        s.activeTabByConv[conversationId] = filePath
      }),

    closeFile: (conversationId, filePath) =>
      set((s) => {
        const list = s.openFilesByConv[conversationId]
        if (!list) return
        const next = list.filter((p) => p !== filePath)
        if (next.length === 0) {
          delete s.openFilesByConv[conversationId]
        } else {
          s.openFilesByConv[conversationId] = next
        }
        // 若关掉的是当前 active，切回 chat
        if (s.activeTabByConv[conversationId] === filePath) {
          s.activeTabByConv[conversationId] = 'chat'
        }
      }),

    setActiveTab: (conversationId, tab) =>
      set((s) => {
        s.activeTabByConv[conversationId] = tab
      }),

    upsertArtifact: (artifact) =>
      set((s) => {
        s.artifacts[artifact.id] = artifact
      }),

    removeArtifact: (artifactId) =>
      set((s) => {
        delete s.artifacts[artifactId]
        if (s.previewArtifactId === artifactId) s.previewArtifactId = null
      }),

    removeArtifacts: (artifactIds) =>
      set((s) => {
        for (const id of artifactIds) {
          delete s.artifacts[id]
          if (s.previewArtifactId === id) s.previewArtifactId = null
        }
      }),

    removeMessages: (conversationId, messageIds) =>
      set((s) => {
        const toRemove = new Set(messageIds)
        for (const id of toRemove) delete s.messages[id]

        const bucket = s.messageIdsByConv[conversationId]
        if (bucket) {
          s.messageIdsByConv[conversationId] = bucket.filter((id) => !toRemove.has(id))
        }

        // 清理可能指向被删消息的 replyTarget
        const replyId = s.replyTargetByConv[conversationId]
        if (replyId && toRemove.has(replyId)) {
          delete s.replyTargetByConv[conversationId]
        }
      }),

    clearConversationHistory: (conversationId, conversation) =>
      set((s) => {
        const messageIds = new Set(s.messageIdsByConv[conversationId] ?? [])
        for (const id of messageIds) delete s.messages[id]
        s.messageIdsByConv[conversationId] = []

        const runIds = new Set(Object.keys(s.runsByConv[conversationId] ?? {}))
        for (const runId of runIds) delete s.dispatchesByRunId[runId]
        for (const runId in s.dispatchesByRunId) {
          if (messageIds.has(s.dispatchesByRunId[runId].messageId)) {
            delete s.dispatchesByRunId[runId]
          }
        }

        delete s.runsByConv[conversationId]
        delete s.replyTargetByConv[conversationId]
        delete s.pendingWritesByConv[conversationId]
        delete s.pendingBashCommandsByConv[conversationId]
        delete s.pendingMcpToolApprovalsByConv[conversationId]
        delete s.agentRunDebugByConv[conversationId]
        for (const runId in s.agentRunDebugDetailsByRun) {
          if (s.agentRunDebugDetailsByRun[runId].agentRun.conversationId === conversationId) {
            delete s.agentRunDebugDetailsByRun[runId]
          }
        }
        for (const runId in s.agentRunDebugEventsByRun) {
          if (s.agentRunDebugEventsByRun[runId].some((event) => event.conversationId === conversationId)) {
            delete s.agentRunDebugEventsByRun[runId]
          }
        }
        for (const runId in s.terminalSessionsByRun) {
          const sessions = s.terminalSessionsByRun[runId]
          if (sessions.some((session) => session.conversationId === conversationId)) {
            for (const session of sessions) delete s.terminalEventsBySession[session.id]
            delete s.terminalSessionsByRun[runId]
          }
        }
        delete s.pendingQuestionsByConv[conversationId]
        delete s.unreadByConv[conversationId]
        if (s.highlightedMessageId && messageIds.has(s.highlightedMessageId)) {
          s.highlightedMessageId = null
        }
        s.conversations[conversationId] = conversation
      }),

    setReplyTarget: (conversationId, messageId) =>
      set((s) => {
        if (messageId) s.replyTargetByConv[conversationId] = messageId
        else delete s.replyTargetByConv[conversationId]
      }),

    setBookmarkedMessageIds: (conversationId, ids) =>
      set((s) => {
        const conv = s.conversations[conversationId]
        if (conv) conv.bookmarkedMessageIds = ids
      }),

    setPinnedMessageIds: (conversationId, ids) =>
      set((s) => {
        const conv = s.conversations[conversationId]
        if (conv) conv.pinnedMessageIds = ids
      }),

    addPendingAttachment: (conversationId, attachment) =>
      set((s) => {
        const list = s.pendingAttachmentsByConv[conversationId] ?? []
        if (list.some((a) => a.id === attachment.id)) return
        s.pendingAttachmentsByConv[conversationId] = [...list, attachment]
      }),

    removePendingAttachment: (conversationId, attachmentId) =>
      set((s) => {
        const list = s.pendingAttachmentsByConv[conversationId]
        if (!list) return
        const next = list.filter((a) => a.id !== attachmentId)
        if (next.length === 0) delete s.pendingAttachmentsByConv[conversationId]
        else s.pendingAttachmentsByConv[conversationId] = next
      }),

    clearPendingAttachments: (conversationId) =>
      set((s) => {
        delete s.pendingAttachmentsByConv[conversationId]
      }),

    setPendingWritesForConversation: (conversationId, list) =>
      set((s) => {
        if (list.length === 0) delete s.pendingWritesByConv[conversationId]
        else s.pendingWritesByConv[conversationId] = list
      }),

    setPendingBashCommandsForConversation: (conversationId, list) =>
      set((s) => {
        if (list.length === 0) delete s.pendingBashCommandsByConv[conversationId]
        else s.pendingBashCommandsByConv[conversationId] = list
      }),

    setPendingMcpToolApprovalsForConversation: (conversationId, list) =>
      set((s) => {
        if (list.length === 0) delete s.pendingMcpToolApprovalsByConv[conversationId]
        else s.pendingMcpToolApprovalsByConv[conversationId] = list
      }),

    setWorkspaceMemoriesForConversation: (conversationId, list) =>
      set((s) => {
        if (list.length === 0) delete s.workspaceMemoriesByConv[conversationId]
        else s.workspaceMemoriesByConv[conversationId] = sortWorkspaceMemories(list)
      }),

    upsertWorkspaceMemory: (conversationId, memory) =>
      set((s) => {
        const list = s.workspaceMemoriesByConv[conversationId] ?? []
        const idx = list.findIndex((item) => item.id === memory.id)
        const next = idx >= 0 ? [...list.slice(0, idx), memory, ...list.slice(idx + 1)] : [...list, memory]
        s.workspaceMemoriesByConv[conversationId] = sortWorkspaceMemories(next)
      }),

    removeWorkspaceMemory: (conversationId, memoryId) =>
      set((s) => {
        const list = s.workspaceMemoriesByConv[conversationId]
        if (!list) return
        const next = list.filter((item) => item.id !== memoryId)
        if (next.length === 0) delete s.workspaceMemoriesByConv[conversationId]
        else s.workspaceMemoriesByConv[conversationId] = next
      }),

    setAgentRunDebugList: (conversationId, runs) =>
      set((s) => {
        if (runs.length === 0) delete s.agentRunDebugByConv[conversationId]
        else s.agentRunDebugByConv[conversationId] = sortAgentRunDebugList(runs)
      }),

    upsertAgentRunDebugList: (conversationId, runs) =>
      set((s) => {
        const existing = s.agentRunDebugByConv[conversationId] ?? []
        const next = sortAgentRunDebugList([...existing, ...runs])
        if (next.length === 0) delete s.agentRunDebugByConv[conversationId]
        else s.agentRunDebugByConv[conversationId] = next
      }),

    setAgentRunDebugDetail: (runId, detail) =>
      set((s) => {
        s.agentRunDebugDetailsByRun[runId] = detail
      }),

    setAgentRunDebugEvents: (runId, events) =>
      set((s) => {
        if (events.length === 0) {
          delete s.agentRunDebugEventsByRun[runId]
          return
        }
        s.agentRunDebugEventsByRun[runId] = dedupeAndSortDebugEvents(events)
      }),

    setTerminalSessionsForRun: (runId, sessions) =>
      set((s) => {
        if (sessions.length === 0) {
          // 不再无条件 delete —— SSE 写入的 sessions 可能比 fetchTerminalSessionsForRun 更快。
          // 如果 fetch 返回空但 SSE 已经写入了 sessions/events，保留 SSE 状态以避免终端 transcript 丢失。
          if (!s.terminalSessionsByRun[runId] || s.terminalSessionsByRun[runId]!.length === 0) {
            delete s.terminalSessionsByRun[runId]
          }
          return
        }
        s.terminalSessionsByRun[runId] = dedupeAndSortTerminalSessions(sessions)
      }),

    setTerminalEventsForSession: (sessionId, events) =>
      set((s) => {
        if (events.length === 0) {
          delete s.terminalEventsBySession[sessionId]
          return
        }
        s.terminalEventsBySession[sessionId] = dedupeAndSortTerminalEvents(events)
      }),

    setPendingQuestionsForConversation: (conversationId, list) =>
      set((s) => {
        if (list.length === 0) delete s.pendingQuestionsByConv[conversationId]
        else s.pendingQuestionsByConv[conversationId] = list
      }),

    setPendingDispatchPlansForConversation: (conversationId, list) =>
      set((s) => {
        for (const pending of list) {
          if (pending.conversationId !== conversationId) continue
          const status: DispatchState['taskStatus'] = {}
          for (const task of pending.plan) status[task.id] = 'pending'
          const existing = s.dispatchesByRunId[pending.runId]
          s.dispatchesByRunId[pending.runId] = {
            runId: pending.runId,
            messageId:
              existing?.messageId ||
              findLatestAgentMessageIdForRun(s.messages, pending.runId),
            plan: pending.plan,
            taskStatus: status,
            childRunIds: existing?.childRunIds ?? {},
            reviewStatus: 'pending',
            pendingPlanId: pending.id,
          }
        }
      }),

    highlightMessage: (messageId) => {
      set((s) => {
        s.highlightedMessageId = messageId
      })
      setTimeout(() => {
        // 仅在仍是同一目标时清除（避免连续点击的竞态）
        const current = useAppStore.getState().highlightedMessageId
        if (current === messageId) {
          useAppStore.setState((s) => {
            s.highlightedMessageId = null
          })
        }
      }, 2000)
    },

    addLocalUserMessage: ({ tempId, conversationId, content, mentionedAgentIds, parentMessageId, attachments }) =>
      set((s) => {
        const parts: MessagePart[] = []
        if (content) parts.push({ type: 'text', content })
        for (const a of attachments ?? []) {
          parts.push(
            a.kind === 'image'
              ? {
                  type: 'image_attachment',
                  attachmentId: a.id,
                  fileName: a.fileName,
                  size: a.size,
                  mimeType: a.mimeType,
                }
              : {
                  type: 'file_attachment',
                  attachmentId: a.id,
                  fileName: a.fileName,
                  size: a.size,
                  mimeType: a.mimeType,
                },
          )
        }
        s.messages[tempId] = {
          id: tempId,
          conversationId,
          role: 'user',
          agentId: null,
          parts,
          status: 'complete',
          parentMessageId: parentMessageId ?? null,
          mentionedAgentIds,
          runId: null,
          usage: null,
          createdAt: Date.now(),
        }
        s.messageIdsByConv[conversationId] ??= []
        s.messageIdsByConv[conversationId].push(tempId)
      }),

    replaceLocalMessageId: (tempId, realId) =>
      set((s) => {
        const msg = s.messages[tempId]
        if (!msg) return
        // realId 可能已被 message.added（SSE 早于 POST 返回）抢先插入：别覆盖权威行，也别在桶里留重复
        if (!s.messages[realId]) s.messages[realId] = { ...msg, id: realId }
        delete s.messages[tempId]
        for (const convId in s.messageIdsByConv) {
          const arr = s.messageIdsByConv[convId]
          const idx = arr.indexOf(tempId)
          if (idx < 0) continue
          if (arr.includes(realId)) arr.splice(idx, 1)
          else arr[idx] = realId
        }
      }),

    applyEvent: (event) =>
      set((s) => {
        switch (event.type) {
          case 'heartbeat':
            return

          case 'run.start': {
            s.runsByConv[event.conversationId] ??= {}
            s.runsByConv[event.conversationId][event.runId] = {
              id: event.runId,
              conversationId: event.conversationId,
              agentId: event.agentId,
              triggerMessageId: event.triggerMessageId,
              status: 'running',
              error: null,
              parentRunId: event.parentRunId ?? null,
              usage: null,
              startedAt: event.timestamp,
              finishedAt: null,
            }
            return
          }

          case 'run.end': {
            const run = s.runsByConv[event.conversationId]?.[event.runId]
            if (run) {
              run.status = event.status
              run.finishedAt = event.timestamp
              run.error = event.error ?? null
            }
            if (event.status === 'failed' || event.status === 'aborted') {
              closeUnresolvedToolCallsForRun(
                s.messages,
                event.conversationId,
                event.runId,
                event.status,
                event.error,
              )
            }
            return
          }

          case 'run.usage': {
            const run = s.runsByConv[event.conversationId]?.[event.runId]
            if (run) run.usage = event.usage
            return
          }

          case 'message.usage': {
            const msg = s.messages[event.messageId]
            if (msg) msg.usage = event.usage
            return
          }

          case 'message.start': {
            // 新 agent 消息（DB 端也插入了同 id 的行，前端再次接到是 idempotent）
            s.messages[event.messageId] = {
              id: event.messageId,
              conversationId: event.conversationId,
              role: 'agent',
              agentId: event.agentId,
              parts: [],
              status: 'streaming',
              parentMessageId: null,
              mentionedAgentIds: [],
              runId: event.runId,
              usage: null,
              createdAt: event.timestamp,
            }
            s.messageIdsByConv[event.conversationId] ??= []
            if (!s.messageIdsByConv[event.conversationId].includes(event.messageId)) {
              s.messageIdsByConv[event.conversationId].push(event.messageId)
            }
            attachDispatchToMessageForRun(s.dispatchesByRunId, event.runId, event.messageId)
            // 未读 +1 不在 message.start 触发：claude-code-adapter 整个 run 只发一次 message.start
            // 且发生时用户通常仍在该会话（被 activeConversationId === conv 抑制），导致后续切走再也不计未读。
            // 改在 message.end 触发，两个 adapter 都能可靠 +1，且每个 msg 仅 +1 一次。
            return
          }

          case 'message.end': {
            const msg = s.messages[event.messageId]
            if (msg) msg.status = 'complete'
            // agent 消息完成时 +1 未读；用户当前在该会话则不计入。
            if (s.activeConversationId !== event.conversationId) {
              s.unreadByConv[event.conversationId] =
                (s.unreadByConv[event.conversationId] ?? 0) + 1
            }
            return
          }

          case 'message.added': {
            // 其它客户端创建的用户消息（如手机端发、桌面端在看）。按 id 幂等 upsert：
            // 发送方自己已对账过同 id，这里无副作用；第二个客户端靠这条插入。
            s.messages[event.message.id] = event.message
            s.messageIdsByConv[event.message.conversationId] ??= []
            if (!s.messageIdsByConv[event.message.conversationId].includes(event.message.id)) {
              s.messageIdsByConv[event.message.conversationId].push(event.message.id)
            }
            return
          }

          case 'message.removed': {
            // 撤回 / 编辑 / 重新生成在别处删了消息（及其产物）。幂等移除：发起方已删过则无副作用。
            const toRemove = new Set(event.messageIds)
            for (const id of toRemove) delete s.messages[id]
            const bucket = s.messageIdsByConv[event.conversationId]
            if (bucket) {
              s.messageIdsByConv[event.conversationId] = bucket.filter((id) => !toRemove.has(id))
            }
            const replyId = s.replyTargetByConv[event.conversationId]
            if (replyId && toRemove.has(replyId)) delete s.replyTargetByConv[event.conversationId]
            for (const id of event.artifactIds) {
              delete s.artifacts[id]
              if (s.previewArtifactId === id) s.previewArtifactId = null
            }
            return
          }

          case 'part.start': {
            const msg = s.messages[event.messageId]
            if (!msg) return
            msg.parts[event.partIndex] = event.part
            return
          }

          case 'part.delta': {
            const msg = s.messages[event.messageId]
            if (!msg) return
            const part = msg.parts[event.partIndex]
            if (!part) return
            if (event.delta.type === 'text.append' && part.type === 'text') {
              part.content += event.delta.text
            } else if (event.delta.type === 'thinking.append' && part.type === 'thinking') {
              part.content += event.delta.text
            } else if (event.delta.type === 'code.append' && part.type === 'code') {
              part.content += event.delta.text
            }
            return
          }

          case 'part.end':
            return

          case 'tool.call': {
            const msg = s.messages[event.messageId]
            if (!msg) return
            msg.parts.push({
              type: 'tool_use',
              callId: event.callId,
              toolName: event.toolName,
              args: event.args,
            })
            return
          }

          case 'tool.result': {
            const msg = s.messages[event.messageId]
            if (!msg) return
            const existing = msg.parts.find(
              (part) => part.type === 'tool_result' && part.callId === event.callId,
            )
            if (existing?.type === 'tool_result') {
              existing.result = event.result
              existing.isError = event.isError
              return
            }
            msg.parts.push({
              type: 'tool_result',
              callId: event.callId,
              result: event.result,
              isError: event.isError,
            })
            return
          }

          case 'artifact.create': {
            const a = event.artifact
            s.artifacts[a.id] = {
              ...a,
              parentArtifactId: a.parentArtifactId ?? null,
              // 图集聚合靠 mergedInto 区分「图集根」与「已并入图集的成员行」，
              // 产物库列表据此隐藏成员行。缺省成 undefined 会让 isNull 过滤失效，
              // 一次任务出的多张图又会散成碎片卡片。
              mergedInto: a.mergedInto ?? null,
              updatedAt: a.updatedAt ?? a.createdAt,
            }
            return
          }

          case 'artifact.update': {
            const art = s.artifacts[event.artifactId]
            if (!art) return
            art.content = { ...art.content, ...(event.patch as object) } as typeof art.content
            return
          }

          case 'dispatch.plan.pending': {
            const pending = event.pendingPlan
            const status: DispatchState['taskStatus'] = {}
            for (const t of pending.plan) status[t.id] = 'pending'
            const existing = s.dispatchesByRunId[pending.runId]
            s.dispatchesByRunId[pending.runId] = {
              runId: pending.runId,
              // 跟随该 run「最新」的规划消息：revise 重排会产出新的一条 Orchestrator 消息（同 runId），
              // 计划卡片随之落到新气泡，而不是钉在第一版那条上。
              messageId:
                findLatestAgentMessageIdForRun(s.messages, pending.runId) ||
                existing?.messageId ||
                '',
              plan: pending.plan,
              taskStatus: status,
              childRunIds: existing?.childRunIds ?? {},
              reviewStatus: 'pending',
              pendingPlanId: pending.id,
            }
            return
          }

          case 'dispatch.plan.resolved': {
            const dispatch = s.dispatchesByRunId[event.runId]
            if (!dispatch) return
            if (dispatch.pendingPlanId === event.pendingId) delete dispatch.pendingPlanId
            // revising：只清掉当前 pending（计划卡先回落到只读），等 Orchestrator 重排发来新的
            // dispatch.plan.pending 再变回审批态；不要置成 rejected。
            if (!event.revising) dispatch.reviewStatus = event.approved ? 'approved' : 'rejected'
            return
          }

          case 'dispatch.plan': {
            const existing = s.dispatchesByRunId[event.runId]
            const status: DispatchState['taskStatus'] = {}
            for (const t of event.plan) status[t.id] = 'pending'
            s.dispatchesByRunId[event.runId] = {
              runId: event.runId,
              messageId:
                existing?.messageId ||
                findLatestAgentMessageIdForRun(s.messages, event.runId),
              plan: event.plan,
              taskStatus: status,
              childRunIds: existing?.childRunIds ?? {},
              reviewStatus: 'approved',
            }
            return
          }

          case 'dispatch.start': {
            const d = s.dispatchesByRunId[event.parentRunId]
            if (!d) return
            d.taskStatus[event.taskId] = 'running'
            d.childRunIds[event.taskId] = event.childRunId
            return
          }

          case 'dispatch.end': {
            const direct = s.dispatchesByRunId[event.parentRunId]
            if (direct) {
              direct.taskStatus[event.taskId] = event.status
              if (event.childRunId) direct.childRunIds[event.taskId] = event.childRunId
              return
            }

            // 兼容旧事件形态：如果没有找到 parentRunId，再通过 childRunId 反查
            for (const d of Object.values(s.dispatchesByRunId)) {
              if (event.childRunId && d.childRunIds[event.taskId] === event.childRunId) {
                d.taskStatus[event.taskId] = event.status
                return
              }
            }
            return
          }

          case 'fs_write.pending': {
            const list = s.pendingWritesByConv[event.conversationId] ?? []
            if (list.some((p) => p.id === event.pendingWrite.id)) return
            s.pendingWritesByConv[event.conversationId] = [...list, event.pendingWrite]
            return
          }

          case 'fs_write.resolved': {
            const list = s.pendingWritesByConv[event.conversationId]
            if (!list) return
            const next = list.filter((p) => p.id !== event.pendingId)
            if (next.length === 0) delete s.pendingWritesByConv[event.conversationId]
            else s.pendingWritesByConv[event.conversationId] = next
            return
          }

          case 'bash_command.pending': {
            const list = s.pendingBashCommandsByConv[event.conversationId] ?? []
            if (list.some((p) => p.id === event.pendingCommand.id)) return
            s.pendingBashCommandsByConv[event.conversationId] = [...list, event.pendingCommand]
            return
          }

          case 'bash_command.resolved': {
            const list = s.pendingBashCommandsByConv[event.conversationId]
            if (!list) return
            const next = list.filter((p) => p.id !== event.pendingId)
            if (next.length === 0) delete s.pendingBashCommandsByConv[event.conversationId]
            else s.pendingBashCommandsByConv[event.conversationId] = next
            return
          }

          case 'mcp_tool.pending': {
            const list = s.pendingMcpToolApprovalsByConv[event.conversationId] ?? []
            if (list.some((p) => p.id === event.pendingApproval.id)) return
            s.pendingMcpToolApprovalsByConv[event.conversationId] = [...list, event.pendingApproval]
            return
          }

          case 'mcp_tool.resolved': {
            const list = s.pendingMcpToolApprovalsByConv[event.conversationId]
            if (!list) return
            const next = list.filter((p) => p.id !== event.pendingId)
            if (next.length === 0) delete s.pendingMcpToolApprovalsByConv[event.conversationId]
            else s.pendingMcpToolApprovalsByConv[event.conversationId] = next
            return
          }

          case 'ask_user.pending': {
            const list = s.pendingQuestionsByConv[event.conversationId] ?? []
            if (list.some((q) => q.id === event.pendingQuestion.id)) return
            s.pendingQuestionsByConv[event.conversationId] = [...list, event.pendingQuestion]
            return
          }

          case 'ask_user.resolved': {
            const list = s.pendingQuestionsByConv[event.conversationId]
            if (!list) return
            const next = list.filter((q) => q.id !== event.pendingId)
            if (next.length === 0) delete s.pendingQuestionsByConv[event.conversationId]
            else s.pendingQuestionsByConv[event.conversationId] = next
            return
          }

          case 'notification.created': {
            const shouldToast = event.notification.toast !== false
            if (shouldToast && !s.notifications.some((item) => item.id === event.notification.id)) {
              s.notifications.unshift(event.notification)
              if (s.notifications.length > 20) s.notifications.length = 20
            }
            if (!event.notification.deletedAt && !s.persistentNotifications.some((item) => item.id === event.notification.id)) {
              s.persistentNotifications.unshift(event.notification)
              if (!event.notification.readAt) s.unreadNotificationCount += 1
            }
            const conversationId = getNotificationConversationId(event.notification)
            if (event.notification.source === 'automation' && conversationId && event.notification.runId) {
              s.automationResultNotices[event.notification.id] = {
                notificationId: event.notification.id,
                conversationId,
                automationId: event.notification.automationId,
                runId: event.notification.runId,
                createdAt: event.notification.createdAt,
              }
            }
            return
          }

          case 'run.debug.step.started':
          case 'run.debug.step.completed':
          case 'run.debug.tool.started':
          case 'run.debug.tool.completed':
          case 'run.debug.terminal.output': {
            const nextEvent: AgentRunDebugEventRecord = {
              id: event.debugEventId ?? buildDebugEventFallbackId(event),
              conversationId: event.conversationId,
              runId: event.runId,
              parentRunId: event.parentRunId ?? null,
              agentId: event.agentId ?? null,
              taskId: event.taskId ?? null,
              stepId: event.stepId ?? null,
              toolCallId: event.toolCallId ?? null,
              type: event.type,
              status: event.status ?? null,
              payload: event.payload ?? buildDebugEventPayload(event),
              createdAt: event.timestamp,
            }
            const list = s.agentRunDebugEventsByRun[event.runId] ?? []
            if (list.some((item) => item.id === nextEvent.id)) return
            s.agentRunDebugEventsByRun[event.runId] = dedupeAndSortDebugEvents([...list, nextEvent])
            return
          }

          case 'terminal.started':
          case 'terminal.input':
          case 'terminal.output':
          case 'terminal.error':
          case 'terminal.exited': {
            const terminalEvent: TerminalEventRecord = {
              id: event.terminalEventId ?? buildTerminalEventFallbackId(event),
              sessionId: event.sessionId,
              conversationId: event.conversationId,
              runId: event.runId,
              agentId: event.agentId,
              taskId: event.taskId ?? null,
              toolCallId: event.toolCallId ?? null,
              type: event.type,
              stream: event.stream ?? 'stdout',
              text: event.text ?? '',
              payload: event.payload ?? {},
              seq: event.seq,
              createdAt: event.timestamp,
            }
            s.terminalEventsBySession[event.sessionId] = dedupeAndSortTerminalEvents([
              ...(s.terminalEventsBySession[event.sessionId] ?? []),
              terminalEvent,
            ])

            const existing = s.terminalSessionsByRun[event.runId] ?? []
            const current = existing.find((session) => session.id === event.sessionId)
            const nextSession: TerminalSessionRecord = {
              id: event.sessionId,
              conversationId: event.conversationId,
              runId: event.runId,
              parentRunId: event.parentRunId ?? current?.parentRunId ?? null,
              agentId: event.agentId,
              taskId: event.taskId ?? current?.taskId ?? null,
              toolCallId: event.toolCallId ?? current?.toolCallId ?? null,
              shell: event.shell ?? current?.shell ?? 'Shell',
              cwd: event.cwd ?? current?.cwd ?? '',
              command: event.command ?? current?.command ?? '',
              status: event.status ?? (event.type === 'terminal.exited' ? 'exited' : current?.status ?? 'running'),
              exitCode: event.exitCode ?? current?.exitCode ?? null,
              signal: event.signal ?? current?.signal ?? null,
              startedAt: current?.startedAt ?? event.timestamp,
              endedAt: event.type === 'terminal.exited' ? event.timestamp : current?.endedAt ?? null,
            }
            s.terminalSessionsByRun[event.runId] = dedupeAndSortTerminalSessions([...existing, nextSession])
            return
          }

          default:
            return
        }
      }),
  })),
)

// ─── 派生 hooks ──────────────────────────────────────
// 用 useShallow 防止派生数组每次新引用导致无限渲染（Zustand 5 标准做法）。
import { useShallow } from 'zustand/react/shallow'
function getNotificationConversationId(notification: AppNotification): string | undefined {
  return notification.target?.conversationId ?? notification.conversationId
}

function normalizeSettingsSection(section: string | null | undefined): SettingsSection | null {
  if (section === 'api-keys' || section === 'providers' || section === 'workspaces' || section === 'notifications') return section
  return null
}

function findLatestAgentMessageIdForRun(
  messages: Record<string, MessageRow>,
  runId: string,
): string {
  let attachMsgId = ''
  let attachCreated = -1
  for (const message of Object.values(messages)) {
    if (
      message.runId === runId &&
      message.role === 'agent' &&
      message.createdAt > attachCreated
    ) {
      attachMsgId = message.id
      attachCreated = message.createdAt
    }
  }
  return attachMsgId
}

function sortWorkspaceMemories(list: WorkspaceMemoryRow[]): WorkspaceMemoryRow[] {
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
}

function sortAgentRunDebugList(list: AgentRunDebugListItem[]): AgentRunDebugListItem[] {
  const byId = new Map<string, AgentRunDebugListItem>()
  for (const run of list) byId.set(run.id, run)
  return [...byId.values()].sort((a, b) => b.startedAt - a.startedAt || b.id.localeCompare(a.id))
}

function attachDispatchToMessageForRun(
  dispatches: Record<string, DispatchState>,
  runId: string | null,
  messageId: string,
): void {
  if (!runId) return
  const dispatch = dispatches[runId]
  if (dispatch && !dispatch.messageId) dispatch.messageId = messageId
}

function closeUnresolvedToolCallsForRun(
  messages: Record<string, MessageRow>,
  conversationId: string,
  runId: string,
  status: 'failed' | 'aborted',
  error?: string,
): void {
  const result = buildUnresolvedToolResult(status, error)
  const messageStatus = status === 'aborted' ? 'aborted' : 'error'

  for (const message of Object.values(messages)) {
    if (message.conversationId !== conversationId || message.runId !== runId) continue
    if (message.status === 'streaming') message.status = messageStatus

    const completedCallIds = new Set<string>()
    for (const part of message.parts) {
      if (part.type === 'tool_result') completedCallIds.add(part.callId)
    }

    for (const part of message.parts) {
      if (part.type !== 'tool_use' || completedCallIds.has(part.callId)) continue
      message.parts.push({
        type: 'tool_result',
        callId: part.callId,
        result,
        isError: true,
      })
      completedCallIds.add(part.callId)
    }
  }
}

function buildUnresolvedToolResult(status: 'failed' | 'aborted', error?: string): string {
  if (status === 'aborted') return '工具调用未完成：本次运行已中止。'
  return error
    ? `工具调用未完成：本次运行失败。${error}`
    : '工具调用未完成：本次运行失败。'
}

function areMessagesEquivalent(a: MessageRow, b: MessageRow): boolean {
  if (a === b) return true
  return (
    a.id === b.id &&
    a.conversationId === b.conversationId &&
    a.role === b.role &&
    a.agentId === b.agentId &&
    a.status === b.status &&
    a.parentMessageId === b.parentMessageId &&
    a.runId === b.runId &&
    a.createdAt === b.createdAt &&
    areStringArraysEqual(a.mentionedAgentIds, b.mentionedAgentIds) &&
    areMessageUsageEqual(a.usage, b.usage) &&
    areMessagePartsEqual(a.parts, b.parts)
  )
}

function areStringArraysEqual(a: readonly string[] | undefined, b: readonly string[]): boolean {
  if (!a || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function areMessageUsageEqual(a: MessageRow['usage'], b: MessageRow['usage']): boolean {
  if (a === b) return true
  if (!a || !b) return a === b
  return (
    a.inputTokens === b.inputTokens &&
    a.outputTokens === b.outputTokens &&
    a.cacheReadTokens === b.cacheReadTokens
  )
}

function areMessagePartsEqual(a: readonly MessagePart[], b: readonly MessagePart[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!areMessagePartsEquivalent(a[i], b[i])) return false
  }
  return true
}

function areMessagePartsEquivalent(a: MessagePart, b: MessagePart): boolean {
  if (a === b) return true
  if (a.type !== b.type) return false
  switch (a.type) {
    case 'text':
      return b.type === 'text' && a.content === b.content
    case 'thinking':
      return b.type === 'thinking' && a.content === b.content
    case 'code':
      return b.type === 'code' && a.language === b.language && a.content === b.content
    case 'tool_use':
      return (
        b.type === 'tool_use' &&
        a.callId === b.callId &&
        a.toolName === b.toolName &&
        areUnknownValuesEquivalent(a.args, b.args)
      )
    case 'tool_result':
      return (
        b.type === 'tool_result' &&
        a.callId === b.callId &&
        a.isError === b.isError &&
        areUnknownValuesEquivalent(a.result, b.result)
      )
    case 'artifact_ref':
      return b.type === 'artifact_ref' && a.artifactId === b.artifactId
    case 'deploy_status':
      return (
        b.type === 'deploy_status' &&
        areUnknownValuesEquivalent(a.deployment, b.deployment)
      )
    case 'deploy_candidates':
      return (
        b.type === 'deploy_candidates' &&
        areUnknownValuesEquivalent(a.candidates, b.candidates)
      )
    case 'image_attachment':
    case 'file_attachment':
      return (
        (b.type === 'image_attachment' || b.type === 'file_attachment') &&
        a.type === b.type &&
        a.attachmentId === b.attachmentId &&
        a.fileName === b.fileName &&
        a.size === b.size &&
        a.mimeType === b.mimeType
      )
  }
}

function areUnknownValuesEquivalent(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null || typeof a !== 'object') return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

function buildDebugEventPayload(event: StreamEvent): Record<string, unknown> {
  if (
    event.type !== 'run.debug.step.started' &&
    event.type !== 'run.debug.step.completed' &&
    event.type !== 'run.debug.tool.started' &&
    event.type !== 'run.debug.tool.completed' &&
    event.type !== 'run.debug.terminal.output'
  ) {
    return {}
  }
  return {
    ...(event.toolName ? { toolName: event.toolName } : {}),
    ...(event.argsSummary ? { argsSummary: event.argsSummary } : {}),
    ...(event.outputSummary ? { outputSummary: event.outputSummary } : {}),
    ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
    ...(event.error ? { error: event.error } : {}),
    ...(event.stream ? { stream: event.stream } : {}),
    ...(event.text ? { text: event.text } : {}),
  }
}

function buildDebugEventFallbackId(event: StreamEvent): string {
  if (
    event.type !== 'run.debug.step.started' &&
    event.type !== 'run.debug.step.completed' &&
    event.type !== 'run.debug.tool.started' &&
    event.type !== 'run.debug.tool.completed' &&
    event.type !== 'run.debug.terminal.output'
  ) {
    return `event_${Date.now()}`
  }
  return [
    event.type,
    event.runId,
    event.taskId ?? '',
    event.stepId ?? '',
    event.toolCallId ?? '',
    event.timestamp,
  ].join(':')
}

function dedupeAndSortDebugEvents(events: AgentRunDebugEventRecord[]): AgentRunDebugEventRecord[] {
  const byId = new Map<string, AgentRunDebugEventRecord>()
  for (const event of events) byId.set(event.id, event)
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

function dedupeAndSortTerminalSessions(sessions: TerminalSessionRecord[]): TerminalSessionRecord[] {
  const byId = new Map<string, TerminalSessionRecord>()
  for (const session of sessions) byId.set(session.id, { ...byId.get(session.id), ...session })
  return [...byId.values()].sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))
}

function dedupeAndSortTerminalEvents(events: TerminalEventRecord[]): TerminalEventRecord[] {
  const bySessionSeq = new Map<string, TerminalEventRecord>()
  for (const event of events) bySessionSeq.set(`${event.sessionId}:${event.seq}`, event)
  return [...bySessionSeq.values()].sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id))
}

function buildTerminalEventFallbackId(event: Extract<StreamEvent, { type: TerminalEventRecord['type'] }>): string {
  return [
    event.type,
    event.conversationId,
    event.runId,
    event.sessionId,
    event.seq,
    event.timestamp,
  ].join(':')
}

import { useMemo } from 'react'

export const useMessagesForConversation = (conversationId: string) =>
  useAppStore(
    useShallow((s) =>
      (s.messageIdsByConv[conversationId] ?? []).map((id) => s.messages[id]).filter(Boolean),
    ),
  )

/** 当前会话 pin 的消息（按 pinnedMessageIds 数组顺序，即用户 pin 的时间顺序）。 */
export const usePinnedMessagesForConversation = (conversationId: string) =>
  useAppStore(
    useShallow((s) => {
      const ids = s.conversations[conversationId]?.pinnedMessageIds ?? []
      return ids.map((id) => s.messages[id]).filter(Boolean)
    }),
  )

export const useActiveConversation = () =>
  useAppStore((s) => (s.activeConversationId ? s.conversations[s.activeConversationId] : null))

export const useConversationList = () =>
  useAppStore(
    useShallow((s) =>
      Object.values(s.conversations).sort((a, b) => {
        // 置顶在前：相互按 pinnedAt 倒序；未置顶按 updatedAt 倒序
        if (a.pinnedAt && !b.pinnedAt) return -1
        if (!a.pinnedAt && b.pinnedAt) return 1
        if (a.pinnedAt && b.pinnedAt) return b.pinnedAt - a.pinnedAt
        return b.updatedAt - a.updatedAt
      }),
    ),
  )

export const useAgentList = () => useAppStore(useShallow((s) => Object.values(s.agents)))

export const usePendingAttachments = (conversationId: string) =>
  useAppStore(useShallow((s) => s.pendingAttachmentsByConv[conversationId] ?? []))

/** 当前会话中正在跑的顶层 run（parentRunId 为空的，用于「中止」按钮）。 */
export const useTopLevelRunningRuns = (conversationId: string) =>
  useAppStore(
    useShallow((s) => {
      const runs = s.runsByConv[conversationId]
      if (!runs) return []
      return Object.values(runs).filter((r) => r.status === 'running' && !r.parentRunId)
    }),
  )

/** 任务标题在进度条里只占一行的宽度，取第一行并截断。 */
export function shortTaskLabel(task: string, limit = 22): string {
  const firstLine = task.split('\n').map((line) => line.trim()).find(Boolean) ?? ''
  const cleaned = firstLine.replace(/^[\s\-*\d.、)]+/, '')
  return cleaned.length > limit ? `${cleaned.slice(0, limit)}…` : cleaned
}

/**
 * 此刻 Agent 在做什么 —— 给「正在运行」条用的一句中文，如「正在执行命令」。
 *
 * 数据全在 store 里：运行中 run 的最近一条 agent 消息中，最后一个还没拿到结果的
 * tool_use 就是当前动作。工具调用往往一跑几分钟，这段时间聊天页除了这条文案没有任何
 * 变化，用户会以为卡死 —— 这就是它存在的意义。
 *
 * 返回字符串（不是对象）：字符串引用稳定，selector 不会因为「每次返回新对象」而
 * 触发无意义重渲染。
 */
export function describeRunningActivity(
  state: Pick<AppState, 'runsByConv' | 'messages' | 'messageIdsByConv'>,
  conversationId: string,
): string | null {
  const runningIds = collectRunningRunIds(state, conversationId)
  if (runningIds.size === 0) return null

  const ids = state.messageIdsByConv[conversationId] ?? []
  for (let i = ids.length - 1; i >= 0; i--) {
    const message = state.messages[ids[i]]
    if (!message || message.role !== 'agent' || !message.runId) continue
    if (!runningIds.has(message.runId)) continue

    const finished = new Set<string>()
    for (const part of message.parts) {
      if (part.type === 'tool_result') finished.add(part.callId)
    }
    for (let j = message.parts.length - 1; j >= 0; j--) {
      const part = message.parts[j]
      if (part.type === 'tool_use' && !finished.has(part.callId)) {
        return `正在${getToolDisplayName(part.toolName)}`
      }
    }
    return '正在生成回复'
  }
  return '正在准备'
}

export const useRunningActivity = (conversationId: string): string | null =>
  useAppStore((s) => describeRunningActivity(s, conversationId))

/**
 * 子任务进度：「子任务 3/7 · 核查录取分数线」。没走多任务编排时返回 null。
 * 编排型任务的墙钟时间几乎全花在等子任务上，只显示「正在运行」用户无从判断还剩多少。
 */
export function describeRunningTaskProgress(
  state: Pick<AppState, 'runsByConv' | 'dispatchesByRunId'>,
  conversationId: string,
): string | null {
  const runningIds = collectRunningRunIds(state, conversationId)
  if (runningIds.size === 0) return null

  for (const runId of runningIds) {
    const dispatch = state.dispatchesByRunId[runId]
    if (!dispatch || dispatch.plan.length === 0) continue
    const done = dispatch.plan.filter((task) => {
      const status = dispatch.taskStatus[task.id]
      return (
        status === 'complete' ||
        status === 'failed' ||
        status === 'aborted' ||
        status === 'skipped'
      )
    }).length
    const active = dispatch.plan.find((task) => dispatch.taskStatus[task.id] === 'running')
    const pos = active ? Math.min(done + 1, dispatch.plan.length) : done
    const label = active ? shortTaskLabel(active.task) : ''
    return label
      ? `子任务 ${pos}/${dispatch.plan.length} · ${label}`
      : `子任务 ${done}/${dispatch.plan.length}`
  }
  return null
}

export const useRunningTaskProgress = (conversationId: string): string | null =>
  useAppStore((s) => describeRunningTaskProgress(s, conversationId))

function collectRunningRunIds(
  state: Pick<AppState, 'runsByConv'>,
  conversationId: string,
): Set<string> {
  const running = new Set<string>()
  const runs = state.runsByConv[conversationId]
  if (!runs) return running
  for (const id in runs) {
    if (runs[id].status === 'running') running.add(id)
  }
  return running
}

/** 该会话是否有待审批的 Orchestrator 计划。返回 { planId, runId } 供对话式修改路由。 */
export const usePendingPlanReviewForConversation = (conversationId: string) =>
  useAppStore(
    useShallow((s): { planId: string; runId: string } | null => {
      const runs = s.runsByConv[conversationId]
      if (!runs) return null
      for (const runId in runs) {
        const d = s.dispatchesByRunId[runId]
        if (d?.reviewStatus === 'pending' && d.pendingPlanId) {
          return { planId: d.pendingPlanId, runId }
        }
      }
      return null
    }),
  )

export function selectDispatchForMessage(
  state: Pick<AppState, 'dispatchesByRunId'>,
  messageId: string,
): DispatchState | null {
  for (const id in state.dispatchesByRunId) {
    const dispatch = state.dispatchesByRunId[id]
    if (dispatch.messageId === messageId) return dispatch
  }
  return null
}

export const useDispatchForMessage = (messageId: string) =>
  useAppStore((s) => selectDispatchForMessage(s, messageId))

/** 返回该会话最后一条 user 消息的 id（用于撤回 / 编辑入口判断）。 */
export const useLatestUserMessageId = (conversationId: string): string | null =>
  useAppStore((s) => {
    const ids = s.messageIdsByConv[conversationId]
    if (!ids) return null
    for (let i = ids.length - 1; i >= 0; i--) {
      const m = s.messages[ids[i]]
      if (m && m.role === 'user') return m.id
    }
    return null
  })

/** 返回该会话最后一条 agent 消息的 id（用于「重新生成」入口判断）。 */
export const useLatestAgentMessageId = (conversationId: string): string | null =>
  useAppStore((s) => {
    const ids = s.messageIdsByConv[conversationId]
    if (!ids) return null
    for (let i = ids.length - 1; i >= 0; i--) {
      const m = s.messages[ids[i]]
      if (m && m.role === 'agent') return m.id
    }
    return null
  })

/** 该会话当前打开的文件 tab 列表。 */
export const useOpenFiles = (conversationId: string): string[] =>
  useAppStore(useShallow((s) => s.openFilesByConv[conversationId] ?? []))

/** 该会话当前激活的 tab id（'chat' 或文件路径）。 */
export const useActiveTab = (conversationId: string): string =>
  useAppStore((s) => s.activeTabByConv[conversationId] ?? 'chat')

/** 该会话当前所有待审批的 fs_write（review 模式下 agent 想改文件，等用户决定）。 */
export const usePendingWrites = (conversationId: string | null): PendingWrite[] =>
  useAppStore(useShallow((s) => (conversationId ? s.pendingWritesByConv[conversationId] ?? [] : [])))

/** 该会话当前所有待审批的关键 bash 命令。 */
export const usePendingBashCommands = (conversationId: string | null): PendingBashCommand[] =>
  useAppStore(
    useShallow((s) =>
      conversationId ? s.pendingBashCommandsByConv[conversationId] ?? [] : [],
    ),
  )

/** 该会话当前所有待审批的外部 MCP 工具调用。 */
export const usePendingMcpToolApprovals = (conversationId: string | null): PendingMcpToolApproval[] =>
  useAppStore(
    useShallow((s) =>
      conversationId ? s.pendingMcpToolApprovalsByConv[conversationId] ?? [] : [],
    ),
  )

export const useWorkspaceMemories = (conversationId: string | null): WorkspaceMemoryRow[] =>
  useAppStore(
    useShallow((s) =>
      conversationId ? s.workspaceMemoriesByConv[conversationId] ?? [] : [],
    ),
  )

export const useAgentRunDebugList = (conversationId: string | null): AgentRunDebugListItem[] =>
  useAppStore(
    useShallow((s) =>
      conversationId ? s.agentRunDebugByConv[conversationId] ?? [] : [],
    ),
  )

export const useAgentRunDebugDetail = (runId: string | null): AgentRunDebugDetail | null =>
  useAppStore((s) => (runId ? s.agentRunDebugDetailsByRun[runId] ?? null : null))

export const useAgentRunDebugEvents = (runId: string | null): AgentRunDebugEventRecord[] =>
  useAppStore(
    useShallow((s) =>
      runId ? s.agentRunDebugEventsByRun[runId] ?? [] : [],
    ),
  )

export const useTerminalSessionsForRun = (runId: string | null): TerminalSessionRecord[] =>
  useAppStore(
    useShallow((s) =>
      runId ? s.terminalSessionsByRun[runId] ?? [] : [],
    ),
  )

export const useTerminalEventsBySession = (): Record<string, TerminalEventRecord[]> =>
  useAppStore(useShallow((s) => s.terminalEventsBySession))

/** 该会话当前所有待回答的 ask_user（agent 通过结构化问答让用户选）。 */
export const usePendingQuestions = (conversationId: string | null): PendingQuestion[] =>
  useAppStore(
    useShallow((s) =>
      conversationId ? s.pendingQuestionsByConv[conversationId] ?? [] : [],
    ),
  )

/** 该会话的未读消息数。0 = 无未读。 */
export const useUnreadCount = (conversationId: string): number =>
  useAppStore((s) => s.unreadByConv[conversationId] ?? 0)

/** 累计该会话所有 run 的 token 用量 + 上次 run 的 input prompt 长度（用于 ctx 仪表）+ per-agent 拆分。 */
export interface ConversationUsageTotal {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  totalTokens: number
  /** 最近一次有 usage 的 run 的 input prompt token 数（context window 仪表用） */
  lastInputTokens: number
  /** key = agentId，value = 该 agent 的累计 input+output tokens */
  byAgent: Record<string, number>
  /** key = modelId，value = 累计 input+output tokens */
  byModel: Record<string, number>
  /** 累计了多少个有 usage 的 run（用于显示 "N 次响应"） */
  runCount: number
}

export const useConversationUsageTotal = (conversationId: string | null): ConversationUsageTotal => {
  // 三个数据源：
  //   runs map —— streaming 时实时填，含 lastInputTokens / model / agentId（最准）
  //   messages map —— 从 DB 加载（刷新页面后唯一可用）
  //   agents map —— 取 model 兜底（messages 不存 model）
  // 用 useMemo 派生统计，避免在 store selector 里返回新对象引用导致 useShallow 死循环。
  const runs = useAppStore((s) => (conversationId ? s.runsByConv[conversationId] : undefined))
  const messageIds = useAppStore((s) =>
    conversationId ? s.messageIdsByConv[conversationId] : undefined,
  )
  const messages = useAppStore((s) => s.messages)
  const agents = useAppStore((s) => s.agents)
  return useMemo(() => {
    const result: ConversationUsageTotal = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      lastInputTokens: 0,
      byAgent: {},
      byModel: {},
      runCount: 0,
    }
    // 优先用 runs（实时性 + model 字段最准）；空则从 messages 兜底（刷新页面后唯一可用的源）
    let hasRunUsage = false
    if (runs) {
      let latestRunWithUsage = -1
      for (const run of Object.values(runs)) {
        const u = run.usage
        if (!u) continue
        hasRunUsage = true
        result.inputTokens += u.inputTokens
        result.outputTokens += u.outputTokens
        result.cacheCreationTokens += u.cacheCreationTokens
        result.cacheReadTokens += u.cacheReadTokens
        result.runCount++
        const sub = u.inputTokens + u.outputTokens
        result.byAgent[run.agentId] = (result.byAgent[run.agentId] ?? 0) + sub
        if (u.model) result.byModel[u.model] = (result.byModel[u.model] ?? 0) + sub
        if (run.startedAt > latestRunWithUsage) {
          latestRunWithUsage = run.startedAt
          result.lastInputTokens = u.lastInputTokens ?? u.inputTokens
        }
      }
    }

    if (!hasRunUsage && messageIds) {
      // 走 messages 兜底：按 run_id 去重统计 runCount；按 message 累加 token；
      // model 通过 agent.modelId 推断（messages 不存 model，跑过的模型若已切换无法准确还原）
      const seenRuns = new Set<string>()
      let latestMsgCreatedAt = -1
      for (const mid of messageIds) {
        const m = messages[mid]
        if (!m || !m.usage || m.role !== 'agent') continue
        const u = m.usage
        result.inputTokens += u.inputTokens
        result.outputTokens += u.outputTokens
        result.cacheReadTokens += u.cacheReadTokens
        if (m.runId && !seenRuns.has(m.runId)) {
          seenRuns.add(m.runId)
          result.runCount++
        }
        const sub = u.inputTokens + u.outputTokens
        if (m.agentId) {
          result.byAgent[m.agentId] = (result.byAgent[m.agentId] ?? 0) + sub
          const modelId = agents[m.agentId]?.modelId
          if (modelId) result.byModel[modelId] = (result.byModel[modelId] ?? 0) + sub
        }
        if (m.createdAt > latestMsgCreatedAt) {
          latestMsgCreatedAt = m.createdAt
          result.lastInputTokens = u.inputTokens
        }
      }
    }

    result.totalTokens =
      result.inputTokens + result.outputTokens + result.cacheCreationTokens + result.cacheReadTokens
    return result
  }, [runs, messageIds, messages, agents])
}
