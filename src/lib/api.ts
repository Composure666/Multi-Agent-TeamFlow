import type {
  AgentRow,
  AppSettingsRow,
  ArtifactRow,
  AttachmentRow,
  ConversationWithMeta,
  ContextSummaryRow,
  ExperienceKind,
  ExperienceRow,
  MessageRow,
  WorkspaceMemoryRow,
} from '@/db/schema'
import type {
  AgentRunDebugEventRecord,
  AgentRunDebugDetail,
  AgentRunDebugListItem,
  AskUserAnswer,
  AppNotification,
  AppNotificationCategory,
  DeployCandidateRecord,
  DeployStatusRecord,
  PendingBashCommand,
  PendingDispatchPlan,
  PendingMcpToolApproval,
  PendingQuestion,
  PendingWrite,
  TerminalEventRecord,
  TerminalSessionRecord,
} from '@/shared/types'
import type { AgentDraftRequest, AgentDraftResponse } from '@/shared/agent-builder-config'
import type { PromptEnhanceContext, PromptEnhanceResponse } from '@/shared/prompt-enhance'
import type { AgentModality } from '@/lib/llm-shared'

export interface ArtifactListItem {
  id: string
  conversationId: string
  conversationTitle: string | null
  type: string
  title: string
  version: number
  parentArtifactId: string | null
  createdByAgentId: string
  createdAt: number
  imageUrl?: string
  /** 图集张数：一次任务连出多张图会被合并成一个产物，这里是被合并的张数。 */
  imageCount?: number
  description?: string
  pptCover?: {
    title?: string
    subtitle?: string
    bullets?: string[]
    primaryColor?: string
    bgColor?: string
  }
}

export type AutomationStatus = 'enabled' | 'running' | 'draft' | 'paused'
export type AutomationRunStatus = 'success' | 'failed' | 'running'
export type AutomationIconKey = 'newspaper' | 'languages' | 'calendar_clock' | 'video' | 'history'
export type AutomationScheduleType = 'manual' | 'interval' | 'daily' | 'weekly'
export type AutomationRunTrigger = 'manual' | 'schedule'
export type AutomationRunLogLevel = 'info' | 'warn' | 'error'

export interface AutomationListItem {
  id: string
  title: string
  description: string
  category: string
  cadence: string
  latestRunAt: number | null
  status: AutomationStatus
  iconKey: AutomationIconKey
  prompt: string
  agentId: string | null
  conversationId: string | null
  workspaceId: string | null
  scheduleType: AutomationScheduleType
  scheduleConfig: unknown
  nextRunAt: number | null
  lastError: string | null
}

export interface AutomationRunLogItem {
  id: string
  runId: string
  level: AutomationRunLogLevel
  message: string
  metadata: string | null
  createdAt: number
}

export interface AutomationRunListItem {
  id: string
  automationId: string
  title: string
  category: string
  status: AutomationRunStatus
  trigger: AutomationRunTrigger
  agentRunId: string | null
  conversationId: string | null
  durationMs: number | null
  startedAt: number
  finishedAt: number | null
  error: string | null
}

export interface AutomationRunDetailItem extends AutomationRunListItem {
  agentRunId: string | null
  conversationId: string | null
  attempt: number
  logs: AutomationRunLogItem[]
}

export interface AutomationStats {
  enabledCount: number
  todayRunCount: number
  successRate: number
  pendingCount: number
  failCount: number
  previousRunCount: number
  previousSuccessRate: number
  previousFailCount: number
}

export interface AutomationTrendPoint {
  label: string
  value: number
  completed: number
}

export const AUTOMATION_TREND_RANGES = [7, 30, 90] as const

export type AutomationTrendRange = (typeof AUTOMATION_TREND_RANGES)[number]

export interface AutomationDashboard {
  stats: AutomationStats
  automations: AutomationListItem[]
  recentRuns: AutomationRunListItem[]
  trend: AutomationTrendPoint[]
  trendRange: AutomationTrendRange
}

async function json<T>(req: Promise<Response>): Promise<T> {
  const res = await req
  if (!res.ok) {
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('text/html')) {
      // Next.js 默认 404/500 页面 —— 通常是路由未注册或 Turbopack 编译问题
      const is404 = res.status === 404
      throw new Error(
        `HTTP ${res.status}: ${is404 ? 'API route not found (Next.js fallback page)' : 'Server error page'}. ` +
        `URL=${res.url}. This often means the route module failed to compile in Turbopack — try restarting the dev server or clearing .next.`,
      )
    }
    if (contentType.includes('application/json')) {
      const json = await res.json().catch(() => null)
      const message = (json as Record<string, unknown> | null)?.error ?? (json as Record<string, unknown> | null)?.message
      throw new Error(`HTTP ${res.status}: ${String(message ?? res.statusText)}`)
    }
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200) || res.statusText}`)
  }
  return res.json() as Promise<T>
}

// ─── Agents ─────────────────────────────────────
export async function fetchAgents(): Promise<AgentRow[]> {
  const { agents } = await json<{ agents: AgentRow[] }>(fetch('/api/agents'))
  return agents
}

export interface CreateAgentBody {
  name: string
  avatar: string
  description: string
  capabilities: string[]
  systemPrompt: string
  /** 默认 'custom'。SDK adapter 使用各自内置工具集 */
  adapterName?: 'custom' | 'claude-code' | 'codex' | 'image-gen'
  /** custom: required；SDK adapter: 忽略 */
  modelProvider?: 'anthropic' | 'openai' | 'deepseek' | 'volcano-ark' | 'openai-compatible'
  /** custom: required；SDK adapter: 可选，默认 SDK 默认模型 */
  modelId?: string
  toolNames: string[]
  mcpServerIds?: string[]
  skillIds?: string[]
  supportsVision?: boolean
  /** 模态分类，参与创建时的模型自动匹配；缺省由服务端兜底为 text */
  modality?: AgentModality
  apiKey?: string
  /** 自定义 API base URL。Claude/Codex 对 endpoint 协议兼容性要求不同；空走默认 */
  apiBaseUrl?: string
}

export async function createAgent(body: CreateAgentBody): Promise<AgentRow> {
  const { agent } = await json<{ agent: AgentRow }>(
    fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return agent
}

export async function createAgentDraft(body: AgentDraftRequest): Promise<AgentDraftResponse> {
  return json<AgentDraftResponse>(
    fetch('/api/agents/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export type UpdateAgentBody = Partial<
  Omit<CreateAgentBody, 'avatar' | 'apiKey' | 'apiBaseUrl' | 'modelId'>
> & {
  // SDK adapter 可用 null 清空，表示走 SDK 默认模型；custom 仍必须有非空 modelId
  modelId?: string | null
  // 显式 null 表示清除自定义 key；undefined 表示不改
  apiKey?: string | null
  // 同上
  apiBaseUrl?: string | null
}

export async function updateAgent(agentId: string, patch: UpdateAgentBody): Promise<AgentRow> {
  const { agent } = await json<{ agent: AgentRow }>(
    fetch(`/api/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
  return agent
}

export async function deleteAgent(agentId: string): Promise<void> {
  await json<{ ok: true }>(fetch(`/api/agents/${agentId}`, { method: 'DELETE' }))
}

export interface McpServerListItem {
  id: string
  name: string
  transport: 'stdio'
  command: string
  args: string[]
  env: Record<string, string>
  trust: 'always' | 'ask'
  enabled: boolean
  lastCheckedAt: number | null
  lastCheckStatus: 'ok' | 'failed' | null
  lastCheckMessage: string | null
  lastToolCount: number | null
  createdAt: number
  updatedAt: number
}

export interface SaveMcpServerBody {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  trust?: 'always' | 'ask'
  enabled?: boolean
}

export async function fetchMcpServers(): Promise<McpServerListItem[]> {
  const { servers } = await json<{ servers: McpServerListItem[] }>(fetch('/api/mcp-servers'))
  return servers
}

export async function createMcpServer(body: SaveMcpServerBody): Promise<McpServerListItem> {
  const { server } = await json<{ server: McpServerListItem }>(
    fetch('/api/mcp-servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return server
}

export async function updateMcpServer(
  serverId: string,
  patch: Partial<SaveMcpServerBody>,
): Promise<McpServerListItem> {
  const { server } = await json<{ server: McpServerListItem }>(
    fetch(`/api/mcp-servers/${serverId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
  return server
}

export async function deleteMcpServer(serverId: string): Promise<void> {
  await json<{ ok: true }>(fetch(`/api/mcp-servers/${serverId}`, { method: 'DELETE' }))
}

export interface McpConnectionTestResult {
  status: 'ok' | 'failed'
  message: string
  checkedAt: number
  tools: Array<{ name: string; description?: string }>
}

export async function testMcpServer(serverId: string): Promise<McpConnectionTestResult> {
  const { result } = await json<{ result: McpConnectionTestResult }>(
    fetch(`/api/mcp-servers/${serverId}/test`, { method: 'POST' }),
  )
  return result
}

export interface SkillListItem {
  id: string
  name: string
  description: string
  content: string | null
  sourcePath: string
  tags: string[]
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export type ToolSearchType = 'all' | 'skill' | 'mcp_server'
export type ToolSearchSource = 'github'

export interface SearchAgentToolsParams {
  keyword?: string
  q?: string
  type?: ToolSearchType
  source?: ToolSearchSource
  page?: number
  pageSize?: number
}

export interface ToolSearchResult {
  id: string
  name: string
  description: string
  type: Exclude<ToolSearchType, 'all'>
  kind: Exclude<ToolSearchType, 'all'>
  source: ToolSearchSource
  githubUrl: string | null
  installUrl: string | null
  manifestUrl: string | null
  tags: string[]
  status: 'remote'
  compatibility: Record<string, 'supported' | 'unsupported'>
}

export interface ToolSearchResponse {
  results: ToolSearchResult[]
  page: number
  pageSize: number
  total: number | null
  nextPage: number | null
  sourceStatus: Record<ToolSearchSource, 'ok' | 'rate_limited' | 'unauthorized' | 'failed'>
}

export interface ConfigureAgentToolBody {
  action: 'attach' | 'detach'
  kind?: Exclude<ToolSearchType, 'all'>
  type?: Exclude<ToolSearchType, 'all'>
  source?: 'local' | ToolSearchSource
  id?: string
  installUrl?: string | null
  manifestUrl?: string | null
  githubUrl?: string | null
}

export async function fetchSkills(): Promise<SkillListItem[]> {
  const { skills } = await json<{ skills: SkillListItem[] }>(fetch('/api/skills'))
  return skills
}

export async function updateSkill(skillId: string, patch: { enabled?: boolean }): Promise<SkillListItem> {
  const { skill } = await json<{ skill: SkillListItem }>(
    fetch(`/api/skills/${skillId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
  return skill
}

export async function refreshSkills(): Promise<SkillListItem[]> {
  const { skills } = await json<{ skills: SkillListItem[] }>(fetch('/api/skills/refresh', { method: 'POST' }))
  return skills
}

export async function searchAgentTools(params: SearchAgentToolsParams | string): Promise<ToolSearchResponse> {
  const query = typeof params === 'string' ? { keyword: params } : params
  const searchParams = new URLSearchParams()
  const keyword = (query.keyword ?? query.q ?? '').trim()
  if (keyword) searchParams.set('keyword', keyword)
  if (query.type) searchParams.set('type', query.type)
  searchParams.set('source', query.source ?? 'github')
  if (query.page) searchParams.set('page', String(query.page))
  if (query.pageSize) searchParams.set('pageSize', String(query.pageSize))
  return json<ToolSearchResponse>(fetch(`/api/search/tools?${searchParams.toString()}`))
}

export interface ConfigureAgentToolResult {
  agent: AgentRow
  configured?: {
    id: string
    type: Exclude<ToolSearchType, 'all'>
    source: 'local' | ToolSearchSource
    imported: boolean
  }
}

export async function configureAgentToolResult(
  agentId: string,
  body: ConfigureAgentToolBody,
): Promise<ConfigureAgentToolResult> {
  return json<ConfigureAgentToolResult>(
    fetch(`/api/agents/${agentId}/tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function configureAgentTool(
  agentId: string,
  body: ConfigureAgentToolBody,
): Promise<AgentRow> {
  const { agent } = await configureAgentToolResult(agentId, body)
  return agent
}

export interface WorkspaceMemoryBody {
  title: string
  content: string
  pinned?: boolean
}

export async function fetchWorkspaceMemories(conversationId: string): Promise<WorkspaceMemoryRow[]> {
  const { memories } = await json<{ memories: WorkspaceMemoryRow[] }>(
    fetch(`/api/conversations/${conversationId}/workspace-memory`),
  )
  return memories
}

export async function createWorkspaceMemory(
  conversationId: string,
  body: WorkspaceMemoryBody,
): Promise<WorkspaceMemoryRow> {
  const { memory } = await json<{ memory: WorkspaceMemoryRow }>(
    fetch(`/api/conversations/${conversationId}/workspace-memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return memory
}

export async function updateWorkspaceMemory(
  conversationId: string,
  memoryId: string,
  patch: Partial<WorkspaceMemoryBody>,
): Promise<WorkspaceMemoryRow> {
  const { memory } = await json<{ memory: WorkspaceMemoryRow }>(
    fetch(`/api/conversations/${conversationId}/workspace-memory/${memoryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
  return memory
}

export async function deleteWorkspaceMemory(conversationId: string, memoryId: string): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}/workspace-memory/${memoryId}`, { method: 'DELETE' }),
  )
}

export interface AgentRunDebugListCursor {
  startedAt: number
  runId: string
}

export interface AgentRunDebugListPage {
  runs: AgentRunDebugListItem[]
  hasMore: boolean
  nextCursor: AgentRunDebugListCursor | null
}

export async function fetchAgentRunsPage(
  conversationId: string,
  opts: { limit?: number; before?: AgentRunDebugListCursor | null } = {},
): Promise<AgentRunDebugListPage> {
  const params = new URLSearchParams()
  if (opts.limit) params.set('limit', String(opts.limit))
  if (opts.before) {
    params.set('beforeStartedAt', String(opts.before.startedAt))
    params.set('beforeRunId', opts.before.runId)
  }
  const qs = params.toString()
  return json<AgentRunDebugListPage>(
    fetch(`/api/conversations/${conversationId}/agent-runs${qs ? `?${qs}` : ''}`),
  )
}

export async function fetchAgentRuns(conversationId: string): Promise<AgentRunDebugListItem[]> {
  const runs: AgentRunDebugListItem[] = []
  let before: AgentRunDebugListCursor | null = null
  for (;;) {
    const page = await fetchAgentRunsPage(conversationId, { limit: 100, before })
    runs.push(...page.runs)
    if (!page.hasMore || page.nextCursor === null) return runs
    before = page.nextCursor
  }
}

export async function fetchAgentRunDebugDetail(
  conversationId: string,
  runId: string,
): Promise<AgentRunDebugDetail> {
  const { detail } = await json<{ detail: AgentRunDebugDetail }>(
    fetch(`/api/conversations/${conversationId}/agent-runs/${runId}/debug`),
  )
  return detail
}

export async function fetchAgentRunDebugEvents(
  conversationId: string,
  runId: string,
): Promise<AgentRunDebugEventRecord[]> {
  const { events } = await json<{ events: AgentRunDebugEventRecord[] }>(
    fetch(`/api/conversations/${conversationId}/agent-runs/${runId}/debug-events`),
  )
  return events
}

export async function fetchConversationAgentRunDebugEvents(
  conversationId: string,
): Promise<AgentRunDebugEventRecord[]> {
  const { events } = await json<{ events: AgentRunDebugEventRecord[] }>(
    fetch(`/api/conversations/${conversationId}/agent-run-debug-events`),
  )
  return events
}

export async function fetchTerminalSessionsForRun(
  conversationId: string,
  runId: string,
): Promise<TerminalSessionRecord[]> {
  const { sessions } = await json<{ sessions: TerminalSessionRecord[] }>(
    fetch(`/api/conversations/${conversationId}/agent-runs/${runId}/terminal-sessions`),
  )
  return sessions
}

export async function fetchTerminalEventsForSession(
  conversationId: string,
  sessionId: string,
): Promise<TerminalEventRecord[]> {
  const { events } = await json<{ events: TerminalEventRecord[] }>(
    fetch(`/api/conversations/${conversationId}/terminal-sessions/${sessionId}/events`),
  )
  return events
}

export async function writeTerminalInput(
  conversationId: string,
  sessionId: string,
  input: string,
): Promise<TerminalEventRecord> {
  const { event } = await json<{ event: TerminalEventRecord }>(
    fetch(`/api/conversations/${conversationId}/terminal-sessions/${sessionId}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    }),
  )
  return event
}

/**
 * 提示词增强。
 *
 * `prompt` 只放用户原始输入;会话/附件/协作方等背景走 `context`,由服务端判断是否真的
 * 影响执行 —— 背景不会被复述进最终提示词(详见 `@/server/prompt-enhance`)。
 */
export async function optimizePrompt(
  prompt: string,
  context?: PromptEnhanceContext,
): Promise<PromptEnhanceResponse> {
  return json<PromptEnhanceResponse>(
    fetch('/api/prompt/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, context }),
    }),
  )
}

export async function fetchAutomationDashboard(range?: { days?: number; start?: number; end?: number }): Promise<AutomationDashboard> {
  const params = new URLSearchParams()
  if (range?.days) params.set('days', String(range.days))
  if (range?.start) params.set('start', String(range.start))
  if (range?.end) params.set('end', String(range.end))
  const query = params.toString() ? `?${params.toString()}` : ''
  const { dashboard } = await json<{ dashboard: AutomationDashboard }>(fetch(`/api/automations${query}`))
  return dashboard
}

// ─── Analytics（数据概览：真实运行分析，数据源 agent_runs） ─────────
export type RunAnalyticsStatus = 'success' | 'running' | 'failed' | 'aborted'

export interface RunAnalyticsItem {
  id: string
  conversationId: string
  agentId: string
  agentName: string
  title: string
  category: string
  status: RunAnalyticsStatus
  durationMs: number | null
  startedAt: number
  finishedAt: number | null
  totalTokens: number
  isSubRun: boolean
}

export interface RunAnalyticsTrendPoint {
  label: string
  date: string
  value: number
  completed: number
}

export interface AnalyticsDistributionItem {
  label: string
  value: number
  count: number
}

export interface RunAnalyticsStats {
  total: number
  success: number
  running: number
  failed: number
  aborted: number
  successRate: number
  avgDurationMs: number
  todayCount: number
  allTimeTotal: number
  prevTotal: number
}

export interface RunAnalytics {
  range: { start: number; end: number; days: number }
  items: RunAnalyticsItem[]
  total: number
  truncated: boolean
  stats: RunAnalyticsStats
  trend: RunAnalyticsTrendPoint[]
  agentDistribution: AnalyticsDistributionItem[]
  statusDistribution: AnalyticsDistributionItem[]
}

export async function fetchRunAnalytics(range?: { start?: number; end?: number; days?: number }): Promise<RunAnalytics> {
  const params = new URLSearchParams()
  if (range?.start) params.set('start', String(range.start))
  if (range?.end) params.set('end', String(range.end))
  if (range?.days) params.set('days', String(range.days))
  // 服务端容器通常是 UTC，必须把浏览器时区一起发过去，否则「今天」和按天分桶会差 8 小时
  params.set('tzOffsetMinutes', String(new Date().getTimezoneOffset()))
  const query = params.toString() ? `?${params.toString()}` : ''
  const { analytics } = await json<{ analytics: RunAnalytics }>(fetch(`/api/analytics${query}`))
  return analytics
}

export interface SaveAutomationBody {
  title: string
  description?: string
  category?: string
  status?: Exclude<AutomationStatus, 'running'>
  iconKey?: AutomationIconKey
  prompt: string
  agentId?: string | null
  conversationId?: string | null
  workspaceId?: string | null
  scheduleType: AutomationScheduleType
  scheduleConfig?: unknown
}

export async function createAutomation(body: SaveAutomationBody): Promise<AutomationListItem> {
  const { automation } = await json<{ automation: AutomationListItem }>(
    fetch('/api/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return automation
}

export async function updateAutomation(
  automationId: string,
  body: Partial<SaveAutomationBody>,
): Promise<AutomationListItem> {
  const { automation } = await json<{ automation: AutomationListItem }>(
    fetch(`/api/automations/${automationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return automation
}

export async function deleteAutomation(automationId: string): Promise<void> {
  await json<{ ok: true }>(fetch(`/api/automations/${automationId}`, { method: 'DELETE' }))
}

export async function enableAutomation(automationId: string): Promise<AutomationListItem> {
  const { automation } = await json<{ automation: AutomationListItem }>(
    fetch(`/api/automations/${automationId}/enable`, { method: 'POST' }),
  )
  return automation
}

export async function disableAutomation(automationId: string): Promise<AutomationListItem> {
  const { automation } = await json<{ automation: AutomationListItem }>(
    fetch(`/api/automations/${automationId}/disable`, { method: 'POST' }),
  )
  return automation
}

export async function runAutomationNow(automationId: string): Promise<AutomationRunDetailItem> {
  const { run } = await json<{ run: AutomationRunDetailItem }>(
    fetch(`/api/automations/${automationId}/run`, { method: 'POST' }),
  )
  return run
}

export async function fetchAutomationRuns(automationId: string): Promise<AutomationRunDetailItem[]> {
  const { runs } = await json<{ runs: AutomationRunDetailItem[] }>(
    fetch(`/api/automations/${automationId}/runs`),
  )
  return runs
}

export interface NotificationListResult {
  notifications: AppNotification[]
  nextCursor: number | null
  unreadCount: number
}

export async function fetchNotifications(opts: {
  status?: 'all' | 'unread' | 'read'
  category?: AppNotificationCategory
  limit?: number
  cursor?: number
} = {}): Promise<NotificationListResult> {
  const params = new URLSearchParams()
  if (opts.status) params.set('status', opts.status)
  if (opts.category) params.set('category', opts.category)
  if (opts.limit) params.set('limit', String(opts.limit))
  if (opts.cursor) params.set('cursor', String(opts.cursor))
  const qs = params.toString()
  return json<NotificationListResult>(fetch(`/api/notifications${qs ? `?${qs}` : ''}`))
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const { count } = await json<{ count: number }>(fetch('/api/notifications/unread-count'))
  return count
}

export async function markNotificationRead(notificationId: string): Promise<AppNotification> {
  const { notification } = await json<{ notification: AppNotification }>(
    fetch(`/api/notifications/${notificationId}/read`, { method: 'POST' }),
  )
  return notification
}

export async function markNotificationsRead(body: {
  ids?: string[]
  all?: boolean
  category?: AppNotificationCategory
}): Promise<{ updated: number }> {
  return json<{ updated: number }>(
    fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function deleteNotification(notificationId: string): Promise<void> {
  await json<{ ok: true }>(fetch(`/api/notifications/${notificationId}`, { method: 'DELETE' }))
}

// ─── Conversations ──────────────────────────────
export async function fetchConversations(): Promise<ConversationWithMeta[]> {
  const { conversations } = await json<{ conversations: ConversationWithMeta[] }>(
    fetch('/api/conversations'),
  )
  return conversations
}

export interface CreateConversationBody {
  title?: string
  mode: 'single' | 'group'
  agentIds: string[]
  boundPath?: string
}

export async function createConversation(body: CreateConversationBody): Promise<ConversationWithMeta> {
  const { conversation } = await json<{ conversation: ConversationWithMeta }>(
    fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return conversation
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}`, { method: 'DELETE' }),
  )
}

export async function addAgentsToConversation(
  conversationId: string,
  addAgentIds: string[],
): Promise<ConversationWithMeta> {
  const { conversation } = await json<{ conversation: ConversationWithMeta }>(
    fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addAgentIds }),
    }),
  )
  return conversation
}

export async function renameConversation(
  conversationId: string,
  title: string,
): Promise<ConversationWithMeta> {
  const { conversation } = await json<{ conversation: ConversationWithMeta }>(
    fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }),
  )
  return conversation
}

export async function togglePinConversation(conversationId: string): Promise<ConversationWithMeta> {
  const { conversation } = await json<{ conversation: ConversationWithMeta }>(
    fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ togglePin: true }),
    }),
  )
  return conversation
}

export async function toggleArchiveConversation(
  conversationId: string,
): Promise<ConversationWithMeta> {
  const { conversation } = await json<{ conversation: ConversationWithMeta }>(
    fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toggleArchive: true }),
    }),
  )
  return conversation
}

export async function setFsWriteApprovalMode(
  conversationId: string,
  mode: 'auto' | 'review',
): Promise<ConversationWithMeta> {
  const { conversation } = await json<{ conversation: ConversationWithMeta }>(
    fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fsWriteApprovalMode: mode }),
    }),
  )
  return conversation
}

// ─── Pending writes (fs_write review mode) ─────
export async function fetchPendingWrites(conversationId: string): Promise<PendingWrite[]> {
  const { pendingWrites } = await json<{ pendingWrites: PendingWrite[] }>(
    fetch(`/api/conversations/${conversationId}/pending-writes`),
  )
  return pendingWrites
}

export async function approvePendingWrite(
  conversationId: string,
  pendingId: string,
): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}/pending-writes/${pendingId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    }),
  )
}

export async function rejectPendingWrite(
  conversationId: string,
  pendingId: string,
): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}/pending-writes/${pendingId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' }),
    }),
  )
}

// ─── Pending bash commands ─────
export async function fetchPendingBashCommands(
  conversationId: string,
): Promise<PendingBashCommand[]> {
  const { pendingCommands } = await json<{ pendingCommands: PendingBashCommand[] }>(
    fetch(`/api/conversations/${conversationId}/pending-bash-commands`),
  )
  return pendingCommands
}

export async function approvePendingBashCommand(
  conversationId: string,
  pendingId: string,
): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}/pending-bash-commands/${pendingId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    }),
  )
}

export async function rejectPendingBashCommand(
  conversationId: string,
  pendingId: string,
): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}/pending-bash-commands/${pendingId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' }),
    }),
  )
}

// ─── Pending MCP tool approvals ─────
export async function fetchPendingMcpToolApprovals(
  conversationId: string,
): Promise<PendingMcpToolApproval[]> {
  const { pendingApprovals } = await json<{ pendingApprovals: PendingMcpToolApproval[] }>(
    fetch(`/api/conversations/${conversationId}/pending-mcp-tool-approvals`),
  )
  return pendingApprovals
}

export async function approvePendingMcpToolApproval(
  conversationId: string,
  pendingId: string,
): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}/pending-mcp-tool-approvals/${pendingId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    }),
  )
}

export async function rejectPendingMcpToolApproval(
  conversationId: string,
  pendingId: string,
): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}/pending-mcp-tool-approvals/${pendingId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' }),
    }),
  )
}

// ─── Pending questions (ask_user) ───────────────
export async function fetchPendingQuestions(conversationId: string): Promise<PendingQuestion[]> {
  const { pendingQuestions } = await json<{ pendingQuestions: PendingQuestion[] }>(
    fetch(`/api/conversations/${conversationId}/pending-questions`),
  )
  return pendingQuestions
}

export async function submitQuestionAnswers(
  conversationId: string,
  questionId: string,
  answers: Record<string, AskUserAnswer>,
): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}/pending-questions/${questionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    }),
  )
}

// ─── Messages ───────────────────────────────────
// ─── Pending dispatch plans (Orchestrator plan review) ───
export async function fetchPendingDispatchPlans(
  conversationId: string,
): Promise<PendingDispatchPlan[]> {
  const { pendingDispatchPlans } = await json<{ pendingDispatchPlans: PendingDispatchPlan[] }>(
    fetch(`/api/conversations/${conversationId}/pending-dispatch-plans`),
  )
  return pendingDispatchPlans
}

export async function approvePendingDispatchPlan(
  conversationId: string,
  planId: string,
): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}/pending-dispatch-plans/${planId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    }),
  )
}

export async function reviseDispatchPlan(
  conversationId: string,
  planId: string,
  feedback: string,
): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}/pending-dispatch-plans/${planId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revise', feedback }),
    }),
  )
}

export async function rejectPendingDispatchPlan(
  conversationId: string,
  planId: string,
): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}/pending-dispatch-plans/${planId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' }),
    }),
  )
}

export interface MessagePage {
  messages: MessageRow[]
  hasMore: boolean
  nextBefore: number | null
}

export async function fetchMessagePage(
  conversationId: string,
  opts: { limit?: number; before?: number; aroundMessageId?: string; slim?: boolean } = {},
): Promise<MessagePage> {
  const params = new URLSearchParams()
  if (opts.limit) params.set('limit', String(opts.limit))
  if (opts.before) params.set('before', String(opts.before))
  if (opts.aroundMessageId) params.set('aroundMessageId', opts.aroundMessageId)
  // slim=1：只取「结构 + 预览」，丢掉 tool_result.result / tool_use.args / thinking.content 正文
  if (opts.slim) params.set('slim', '1')
  const qs = params.toString()
  return json<MessagePage>(
    fetch(`/api/conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`),
  )
}

/**
 * 拉取**整段会话历史**（200 条/页，循环到没有更早的为止）。
 *
 * ⚠️ 只在两个地方用，且都不需要工具输出全文：
 *  - run-board 的会话级调试图（只为消息卡片渲染一行预览 + 按 callId 关联工具调用）
 *  - 输入框的 `/export` 斜杠命令（导出 markdown）
 * 所以 run-board 侧传 `slim: true`。实测线上单会话 653 条消息的 parts 合计 3.6MB
 * （其中 55% 是 tool_result.result），slim 后约 0.09MB。
 *
 * 普通消息流**不要**走这里 —— `message-list.tsx` 用 `fetchMessagePage` 按页取，且需要正文。
 */
export async function fetchMessages(
  conversationId: string,
  opts: { slim?: boolean } = {},
): Promise<MessageRow[]> {
  const pageSize = 200
  const all: MessageRow[] = []
  let before: number | undefined
  for (;;) {
    const page = await fetchMessagePage(conversationId, { limit: pageSize, before, slim: opts.slim })
    all.unshift(...page.messages)
    if (!page.hasMore || page.nextBefore === null) return all
    before = page.nextBefore
  }
}

// ─── Search ──────────────────────────────────────
export interface SearchApiResult {
  hits: Array<{
    messageId: string
    conversationId: string
    conversationTitle: string
    role: 'user' | 'agent' | 'system'
    agentId: string | null
    agentName: string | null
    agentAvatar: string | null
    createdAt: number
    snippetHtml: string
  }>
  total: number
  tookMs: number
}

export async function searchMessagesApi(
  query: string,
  opts: { fallback?: 'like'; conversationId?: string; role?: 'user' | 'agent' } = {},
): Promise<SearchApiResult> {
  const params = new URLSearchParams({ q: query })
  if (opts.fallback) params.set('fallback', opts.fallback)
  if (opts.conversationId) params.set('conversationId', opts.conversationId)
  if (opts.role) params.set('role', opts.role)
  const { data } = await json<{ ok: true; data: SearchApiResult }>(
    fetch(`/api/search?${params}`),
  )
  return data
}

export interface ClearConversationHistoryResult {
  conversation: ConversationWithMeta
  deletedMessageCount: number
  deletedRunCount: number
  deletedSummaryCount: number
}

export async function clearConversationHistory(
  conversationId: string,
): Promise<ClearConversationHistoryResult> {
  return json<ClearConversationHistoryResult>(
    fetch(`/api/conversations/${conversationId}/messages`, { method: 'DELETE' }),
  )
}

export interface SendMessageBody {
  content: string
  mentionedAgentIds?: string[]
  parentMessageId?: string
  attachmentIds?: string[]
}

export interface SendMessageResult {
  messageId: string
  runIds: string[]
  messages?: MessageRow[]
  deploy?: DeployConversationResult
}

export async function sendMessage(
  conversationId: string,
  body: SendMessageBody,
): Promise<SendMessageResult> {
  return json<SendMessageResult>(
    fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export type DeployConversationResult =
  | {
      kind: 'no_candidates'
      candidates: []
      message: MessageRow
    }
  | {
      kind: 'candidate_selection'
      candidates: DeployCandidateRecord[]
      message: MessageRow
    }
  | {
      kind: 'deployed'
      deployment: DeployStatusRecord
      message: MessageRow
    }

export async function fetchDeployCandidates(
  conversationId: string,
): Promise<DeployCandidateRecord[]> {
  const { candidates } = await json<{ candidates: DeployCandidateRecord[] }>(
    fetch(`/api/conversations/${conversationId}/deploy`),
  )
  return candidates
}

export async function deployConversationArtifact(
  conversationId: string,
  artifactId?: string,
): Promise<DeployConversationResult> {
  return json<DeployConversationResult>(
    fetch(`/api/conversations/${conversationId}/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(artifactId ? { artifactId } : {}),
    }),
  )
}

// ─── Runs ───────────────────────────────────────
export interface CompactConversationResult {
  summary: ContextSummaryRow
  message: MessageRow
}

export async function compactConversation(
  conversationId: string,
): Promise<CompactConversationResult> {
  return json<CompactConversationResult>(
    fetch(`/api/conversations/${conversationId}/compact`, { method: 'POST' }),
  )
}

export async function abortRun(runId: string): Promise<void> {
  await json<{ ok: true }>(fetch(`/api/runs/${runId}/abort`, { method: 'POST' }))
}

// ─── Messages: withdraw / edit ──────────────────
export interface WithdrawResult {
  deletedMessageIds: string[]
  deletedArtifactIds: string[]
}

export async function withdrawMessage(
  messageId: string,
  conversationId: string,
): Promise<WithdrawResult> {
  return json<WithdrawResult>(
    fetch(`/api/messages/${messageId}/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    }),
  )
}

export interface EditAndResendResult extends WithdrawResult {
  newMessage: MessageRow
  runIds: string[]
}

export interface RegenerateResult extends WithdrawResult {
  triggerMessageId: string
  runIds: string[]
}

export async function regenerateLastResponse(conversationId: string): Promise<RegenerateResult> {
  return json<RegenerateResult>(
    fetch(`/api/conversations/${conversationId}/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    }),
  )
}

export async function editAndResendMessage(
  messageId: string,
  conversationId: string,
  content: string,
): Promise<EditAndResendResult> {
  return json<EditAndResendResult>(
    fetch(`/api/messages/${messageId}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, content }),
    }),
  )
}

export interface ToggleBookmarkResult {
  bookmarkedMessageIds: string[]
  bookmarked: boolean
}

export async function toggleMessageBookmark(
  messageId: string,
  conversationId: string,
): Promise<ToggleBookmarkResult> {
  return json<ToggleBookmarkResult>(
    fetch(`/api/messages/${messageId}/bookmark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    }),
  )
}

export interface TogglePinResult {
  pinnedMessageIds: string[]
  pinned: boolean
}

export async function toggleMessagePin(
  messageId: string,
  conversationId: string,
): Promise<TogglePinResult> {
  return json<TogglePinResult>(
    fetch(`/api/messages/${messageId}/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    }),
  )
}

// ─── Filesystem (DirPicker) ────────────────────
export interface ListDirResult {
  path: string
  parent: string | null
  entries: Array<{ name: string; isDirectory: boolean; path?: string }>
}

export type ServerPlatform = 'posix' | 'windows'

export async function getServerPlatform(): Promise<ServerPlatform> {
  const res = await json<{ platform: ServerPlatform }>(fetch('/api/platform'))
  return res.platform
}

export async function listDirectory(targetPath?: string): Promise<ListDirResult> {
  const qs = targetPath ? `?path=${encodeURIComponent(targetPath)}` : ''
  return json<ListDirResult>(fetch(`/api/fs/listdir${qs}`))
}

// ─── Filesystem (conversation-scoped, 文件浏览器面板用) ────────
export interface WorkspaceListResult {
  relPath: string
  absolutePath: string
  parent: string | null
  entries: Array<{ name: string; isDirectory: boolean; size?: number }>
}

export async function workspaceListDir(
  conversationId: string,
  relPath = '',
): Promise<WorkspaceListResult> {
  const qs = relPath ? `?path=${encodeURIComponent(relPath)}` : ''
  return json<WorkspaceListResult>(fetch(`/api/conversations/${conversationId}/fs/listdir${qs}`))
}

export interface WorkspaceReadResult {
  path: string
  absolutePath: string
  cwd: string
  size: number
  content: string
  truncated: boolean
}

export async function workspaceReadFile(
  conversationId: string,
  relPath: string,
): Promise<WorkspaceReadResult> {
  return json<WorkspaceReadResult>(
    fetch(`/api/conversations/${conversationId}/fs/read?path=${encodeURIComponent(relPath)}`),
  )
}

export interface WorkspaceWriteResult {
  path: string
  absolutePath: string
  cwd: string
  bytes: number
}

export async function workspaceWriteFile(
  conversationId: string,
  relPath: string,
  content: string,
): Promise<WorkspaceWriteResult> {
  return json<WorkspaceWriteResult>(
    fetch(`/api/conversations/${conversationId}/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: relPath, content }),
    }),
  )
}

// ─── Artifacts ─────────────────────────────────
export async function fetchArtifacts(): Promise<ArtifactListItem[]> {
  const { artifacts } = await json<{ artifacts: ArtifactListItem[] }>(fetch('/api/artifacts'))
  return artifacts
}

export async function fetchArtifact(artifactId: string): Promise<ArtifactRow> {
  const { artifact } = await json<{ artifact: ArtifactRow }>(
    fetch(`/api/artifacts/${artifactId}`),
  )
  return artifact
}

export async function fetchArtifactVersions(artifactId: string): Promise<ArtifactRow[]> {
  const { versions } = await json<{ versions: ArtifactRow[] }>(
    fetch(`/api/artifacts/${artifactId}/versions`),
  )
  return versions
}

/** 以 artifactId 为父，提交编辑后的内容为新版本（version+1）；返回新产物行。 */
export async function createArtifactVersion(
  artifactId: string,
  body: { content: unknown; title?: string },
): Promise<ArtifactRow> {
  const { artifact } = await json<{ artifact: ArtifactRow }>(
    fetch(`/api/artifacts/${artifactId}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return artifact
}

export async function deleteArtifact(artifactId: string): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/artifacts/${artifactId}`, { method: 'DELETE' }),
  )
}

// ─── Experiences（Spec 20）───────────────────────────────
export interface FetchExperiencesParams {
  agentId?: string | null
  kind?: ExperienceKind | null
  active?: boolean | null
  source?: 'auto' | 'manual' | null
  q?: string | null
}

export interface FetchExperiencesResult {
  experiences: ExperienceRow[]
  /** experienceId → 累计修订次数（Agent 自动复盘 + 人工编辑） */
  revisionCounts: Record<string, number>
}

export async function fetchExperiences(
  params: FetchExperiencesParams = {},
): Promise<FetchExperiencesResult> {
  const search = new URLSearchParams()
  if (params.agentId) search.set('agentId', params.agentId)
  if (params.kind) search.set('kind', params.kind)
  if (params.active !== null && params.active !== undefined) search.set('active', String(params.active))
  if (params.source) search.set('source', params.source)
  if (params.q) search.set('q', params.q)
  const qs = search.toString()
  const data = await json<{ experiences: ExperienceRow[]; revisionCounts?: Record<string, number> }>(
    fetch(`/api/experiences${qs ? `?${qs}` : ''}`),
  )
  return { experiences: data.experiences, revisionCounts: data.revisionCounts ?? {} }
}

export interface ExperienceStats {
  total: number
  active: number
  drafts: number
  frequentlyUsed: number
  cold: number
  totalUsage: number
  weeklyNew: number[]
  weeklyUsage: number[]
}

export interface ExperienceUsageItem {
  id: string
  experienceId: string
  runId: string
  agentId: string | null
  createdAt: number
}

export async function fetchExperienceStats(): Promise<ExperienceStats> {
  const { stats } = await json<{ stats: ExperienceStats }>(fetch('/api/experiences/stats'))
  return stats
}

export interface ExperienceRevisionItem {
  id: string
  experienceId: string
  runId: string | null
  source: 'auto' | 'manual'
  kind: 'refine' | 'confirm' | 'retire' | 'restore'
  title: string
  trigger: string
  content: string
  tags: string[]
  note: string | null
  createdAt: number
}

export async function fetchExperienceRevisions(
  experienceId: string,
): Promise<ExperienceRevisionItem[]> {
  const { items } = await json<{ items: ExperienceRevisionItem[] }>(
    fetch(`/api/experiences/${experienceId}/revisions`),
  )
  return items
}

export async function rollbackExperienceRevision(
  experienceId: string,
  revisionId: string,
): Promise<ExperienceRow> {
  const { experience } = await json<{ experience: ExperienceRow }>(
    fetch(`/api/experiences/${experienceId}/revisions/${revisionId}`, { method: 'POST' }),
  )
  return experience
}

export async function fetchExperienceUsage(experienceId: string): Promise<ExperienceUsageItem[]> {
  const { items } = await json<{ items: ExperienceUsageItem[] }>(
    fetch(`/api/experiences/${experienceId}/usage`),
  )
  return items
}

export interface CreateExperienceInput {
  kind?: ExperienceKind
  agentId?: string | null
  scope?: 'agent' | 'global'
  conversationId?: string | null
  runId?: string | null
  title: string
  trigger: string
  content: string
  tags?: string[]
}

export async function createExperience(input: CreateExperienceInput): Promise<ExperienceRow> {
  const { experience } = await json<{ experience: ExperienceRow }>(
    fetch('/api/experiences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
  return experience
}

export async function updateExperience(
  experienceId: string,
  patch: {
    kind?: ExperienceKind
    agentId?: string | null
    title?: string
    trigger?: string
    content?: string
    tags?: string[]
    active?: boolean
  },
): Promise<ExperienceRow> {
  const { experience } = await json<{ experience: ExperienceRow }>(
    fetch(`/api/experiences/${experienceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
  return experience
}

export async function deleteExperience(experienceId: string): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/experiences/${experienceId}`, { method: 'DELETE' }),
  )
}

export interface ReflectRunResult {
  saved: number
  experiences: ExperienceRow[]
}

/** 对指定 Run 立即执行反思沉淀（POST /api/runs/[id]/reflect）。 */
export async function triggerExperienceReflection(runId: string): Promise<ReflectRunResult> {
  return json<ReflectRunResult>(fetch(`/api/runs/${runId}/reflect`, { method: 'POST' }))
}

// ─── Experience 参考附件 ─────────────────────────────
export interface ExperienceAttachment {
  id: string
  experienceId: string
  fileName: string
  size: number
  mimeType: string
  createdAt: number
}

export async function fetchExperienceFiles(experienceId: string): Promise<ExperienceAttachment[]> {
  const { items } = await json<{ items: ExperienceAttachment[] }>(
    fetch(`/api/experiences/${experienceId}/attachments`),
  )
  return items
}

export async function uploadExperienceFiles(
  experienceId: string,
  files: File[],
): Promise<ExperienceAttachment[]> {
  const form = new FormData()
  for (const f of files) form.append('file', f)
  const res = await fetch(`/api/experiences/${experienceId}/attachments`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`HTTP ${res.status}: ${body || res.statusText}`)
  }
  const { items } = (await res.json()) as { items: ExperienceAttachment[] }
  return items
}

export async function deleteExperienceFile(experienceId: string, fileId: string): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/experiences/${experienceId}/attachments/${fileId}`, { method: 'DELETE' }),
  )
}

export function experienceFileDownloadUrl(experienceId: string, fileId: string): string {
  return `/api/experiences/${experienceId}/attachments/${fileId}/file`
}

// ─── Attachments ───────────────────────────────
export async function fetchAttachments(conversationId: string): Promise<AttachmentRow[]> {
  const { attachments } = await json<{ attachments: AttachmentRow[] }>(
    fetch(`/api/conversations/${conversationId}/attachments`),
  )
  return attachments
}

export async function uploadAttachment(
  conversationId: string,
  file: File,
): Promise<AttachmentRow> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`/api/conversations/${conversationId}/attachments`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`HTTP ${res.status}: ${body || res.statusText}`)
  }
  const { attachment } = (await res.json()) as { attachment: AttachmentRow }
  return attachment
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  await json<{ ok: true }>(fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' }))
}

export function attachmentDownloadUrl(attachmentId: string): string {
  return `/api/attachments/${attachmentId}`
}

// ─── Usage / Analytics ─────────────────────────────
export interface UsageBucket {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  totalTokens: number
  runs: number
}

export interface UsageSummary {
  today: UsageBucket
  week: UsageBucket
  allTime: UsageBucket
  selected: UsageBucket
  prevSelected: UsageBucket
  topConversations: Array<{
    id: string
    title: string
    totalTokens: number
    runs: number
    updatedAt: number
  }>
  byAgent: Array<{ agentId: string; name: string; totalTokens: number; runs: number }>
  byModel: Array<{ model: string; totalTokens: number; runs: number }>
}

export async function fetchUsageSummary(range?: { start?: number; end?: number }): Promise<UsageSummary> {
  const params = new URLSearchParams()
  if (range?.start) params.set('start', String(range.start))
  if (range?.end) params.set('end', String(range.end))
  const query = params.toString() ? `?${params.toString()}` : ''
  return json<UsageSummary>(fetch(`/api/usage/summary${query}`))
}

// ─── Mobile companion connection hints ─────────────
export interface ConnectionHint {
  kind: 'tailscale' | 'lan' | 'local'
  label: string
  host: string
  url: string
  interfaceName?: string
}

export async function fetchConnectionHints(): Promise<ConnectionHint[]> {
  const { hints } = await json<{ hints: ConnectionHint[] }>(fetch('/api/connection-hints'))
  return hints
}

// ─── App Settings (全局 API key) ───────────────
export async function fetchAppSettings(): Promise<AppSettingsRow> {
  const { settings } = await json<{ settings: AppSettingsRow }>(fetch('/api/settings'))
  return settings
}

export interface AppSettingsPatchBody {
  anthropicApiKey?: string | null
  anthropicBaseUrl?: string | null
  openaiApiKey?: string | null
  deepseekApiKey?: string | null
  arkApiKey?: string | null
  defaultLlmProvider?: string | null
  companionMode?: 'off' | 'lan' | 'tailnet'
  mobileDeviceToken?: string | null
  deploymentPublishEnabled?: boolean
  deploymentPublishDir?: string | null
  deploymentPublicBaseUrl?: string | null
  notificationTaskEnabled?: boolean
  notificationErrorEnabled?: boolean
  notificationSystemEnabled?: boolean
  notificationConfigurationEnabled?: boolean
  notificationToastEnabled?: boolean
  notificationNativeEnabled?: boolean
  notificationUrgentEnabled?: boolean
  experienceExtractionEnabled?: boolean
  ossBucket?: string | null
  ossEndpoint?: string | null
  ossAccessKeyId?: string | null
  ossAccessKeySecret?: string | null
  ossPublicRead?: boolean
  /** 首启使用指南的「不再自动弹出」时间戳 */
  userGuideDismissedAt?: number | null
}

export async function updateAppSettings(patch: AppSettingsPatchBody): Promise<AppSettingsRow> {
  const { settings } = await json<{ settings: AppSettingsRow }>(
    fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
  return settings
}

export async function regenerateMobileDeviceToken(): Promise<AppSettingsRow> {
  const { settings } = await json<{ settings: AppSettingsRow }>(
    fetch('/api/settings/mobile-token', { method: 'POST' }),
  )
  return settings
}

// ─── 阿里云 OSS（图片产物远程存储）──────────────

export type OssConfigSource = 'database' | 'environment' | 'none'

export interface OssSettingsView {
  /** 可编辑字段；两个 AccessKey 是**脱敏串**（`********abcd`），只用于展示「配的是哪一把」 */
  bucket: string
  endpoint: string
  accessKeyId: string
  accessKeySecret: string
  hasAccessKeyId: boolean
  hasAccessKeySecret: boolean
  publicRead: boolean
  /** 四项齐备，图片产物确实会上传 OSS */
  configured: boolean
  /** 生效来源：database（界面配置）/ environment（系统环境变量兜底）/ none */
  source: OssConfigSource
  dbProvided: boolean
  envProvided: boolean
}

export interface OssSettingsPatch {
  /** 不传 = 不改；null / '' = 清空 */
  bucket?: string | null
  endpoint?: string | null
  accessKeyId?: string | null
  accessKeySecret?: string | null
  publicRead?: boolean
}

export async function fetchOssSettings(): Promise<OssSettingsView> {
  const { oss } = await json<{ oss: OssSettingsView }>(fetch('/api/settings/oss'))
  return oss
}

export async function updateOssSettings(patch: OssSettingsPatch): Promise<OssSettingsView> {
  const { oss } = await json<{ oss: OssSettingsView }>(
    fetch('/api/settings/oss', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
  return oss
}

// ─── 开箱状态（首启使用指南用）──────────────────

/**
 * LLM key 的来源层。取值与 `settings-service.LlmKeySource` 对齐
 * （客户端不复用服务端类型，避免把服务端模块拖进浏览器包）。
 */
export type LlmKeySource = 'provider-row' | 'app-settings' | 'environment' | 'none'

export interface SetupStatus {
  llmConfigured: boolean
  llmProvider: 'anthropic' | 'openai' | 'deepseek' | 'ark' | null
  llmSource: LlmKeySource
  ossConfigured: boolean
  ossSource: OssConfigSource
  guideDismissed: boolean
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  const { status } = await json<{ status: SetupStatus }>(fetch('/api/setup-status'))
  return status
}
