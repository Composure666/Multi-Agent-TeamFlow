/**
 * Drizzle schema — 与 specs/01-core-entities.md 对应。
 *
 * 修改本文件后必须运行 `pnpm db:push` 同步到 SQLite。
 */

import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type {
  AppNotificationCategory,
  AppNotificationLevel,
  AppNotificationPriority,
  AppNotificationSource,
  AppNotificationTarget,
  AppNotificationTargetType,
  ArtifactContent,
  ArtifactType,
  AdapterName,
  MessagePart,
  ModelProvider,
  AgentRunDebugSnapshot,
} from '@/shared/types'

// ─── Agents ──────────────────────────────────────────────────
export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  avatar: text('avatar').notNull(),
  description: text('description').notNull(),
  capabilities: text('capabilities', { mode: 'json' }).$type<string[]>().notNull(),

  systemPrompt: text('system_prompt').notNull(),
  adapterName: text('adapter_name').$type<AdapterName>().notNull(),

  modelProvider: text('model_provider').$type<ModelProvider>(),
  modelId: text('model_id'),
  /**
   * 该 agent 单独的 API key。优先级高于 app_settings / env var。
   * Codex adapter 会把最终 key 注入隔离 CODEX_HOME 下的 SDK runtime。
   */
  apiKey: text('api_key'),

  /**
   * 该 agent 单独的 API base URL。
   * NULL 表示走 adapter 默认 endpoint；Claude Code 还可走 app_settings.anthropicBaseUrl。
   * 配合 apiKey 一起用：base URL 非空时，SDK adapter 会把 apiKey 作为对应 token 传入。
   * Codex 只支持 Codex/Responses 兼容 endpoint，Chat Completions-only provider 需走 custom。
   */
  apiBaseUrl: text('api_base_url'),

  toolNames: text('tool_names', { mode: 'json' }).$type<string[]>().notNull(),
  mcpServerIds: text('mcp_server_ids', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  skillIds: text('skill_ids', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),

  isBuiltin: integer('is_builtin', { mode: 'boolean' }).notNull().default(false),
  isOrchestrator: integer('is_orchestrator', { mode: 'boolean' }).notNull().default(false),
  supportsVision: integer('supports_vision', { mode: 'boolean' }).notNull().default(false),

  createdAt: integer('created_at').notNull(),
})

// ─── Conversations ───────────────────────────────────────────
export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    mode: text('mode', { enum: ['single', 'group'] }).notNull(),
    agentIds: text('agent_ids', { mode: 'json' }).$type<string[]>().notNull(),
    /** 注入 LLM 长期上下文的重要消息（agent-runner 用，UI 暂未暴露入口）。 */
    pinnedMessageIds: text('pinned_message_ids', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    /** 用户的 UI 书签 —— 仅用于 outline 导航定位 / 高亮，不影响 LLM 上下文。 */
    bookmarkedMessageIds: text('bookmarked_message_ids', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    /** 置顶时间戳；NULL 表示未置顶。排序时 pinned 永远在前，相互按 pinnedAt desc。 */
    pinnedAt: integer('pinned_at'),

    /**
     * Agent 通过 fs_write 改文件时的审批策略：
     * 'review' — 写入前推送 fs_write.pending，让前端弹审批 dialog（默认）
     * 'auto'   — 直接写
     * 仅影响 agent；用户手动在 FileTab 编辑保存不走审批。
     */
    fsWriteApprovalMode: text('fs_write_approval_mode', { enum: ['auto', 'review'] })
      .notNull()
      .default('review'),

    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('idx_conv_updated').on(t.updatedAt)],
)

// ─── Messages ────────────────────────────────────────────────
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),

    role: text('role', { enum: ['user', 'agent', 'system'] }).notNull(),
    agentId: text('agent_id').references(() => agents.id),

    parts: text('parts', { mode: 'json' }).$type<MessagePart[]>().notNull(),

    status: text('status', { enum: ['streaming', 'complete', 'error', 'aborted'] }).notNull(),
    parentMessageId: text('parent_message_id'),
    mentionedAgentIds: text('mentioned_agent_ids', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),

    runId: text('run_id'),

    /** 这条消息（单 LLM 响应）的 token 用量。null 表示 user 消息 / 不上报的 mock / 旧数据 */
    usage: text('usage', { mode: 'json' }).$type<MessageUsage>(),

    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('idx_messages_conv_created').on(t.conversationId, t.createdAt)],
)

/** Per-message token usage —— 比 RunUsage 略简，单条 LLM 响应级别。 */
export interface MessageUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
}

// ─── Artifacts ───────────────────────────────────────────────
export const artifacts = sqliteTable(
  'artifacts',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),

    type: text('type').$type<ArtifactType>().notNull(),
    title: text('title').notNull(),
    content: text('content', { mode: 'json' }).$type<ArtifactContent>().notNull(),

    version: integer('version').notNull().default(1),
    parentArtifactId: text('parent_artifact_id'),

    createdByAgentId: text('created_by_agent_id')
      .notNull()
      .references(() => agents.id),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('idx_artifacts_conv').on(t.conversationId)],
)

// ─── Workspaces ──────────────────────────────────────────────
export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .unique()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  rootPath: text('root_path').notNull(),
  /**
   * 'sandbox' — 隔离目录（.agenthub-data/workspaces/<convId>），默认
   * 'local'   — 绑定用户机器上的真实目录
   */
  mode: text('mode', { enum: ['sandbox', 'local'] }).notNull().default('sandbox'),
  /** mode='local' 时填，绝对路径；sandbox 时为 null */
  boundPath: text('bound_path'),
  createdAt: integer('created_at').notNull(),
})

// ─── Attachments (会话文件库) ─────────────────────────────────
export const attachments = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),

    kind: text('kind', { enum: ['image', 'file'] }).notNull(),
    fileName: text('file_name').notNull(),
    filePath: text('file_path').notNull(),    // 相对 workspace.rootPath
    size: integer('size').notNull(),
    mimeType: text('mime_type').notNull(),

    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('idx_attachments_conv').on(t.conversationId)],
)

// ─── AgentRuns ───────────────────────────────────────────────
export const agentRuns = sqliteTable(
  'agent_runs',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
    triggerMessageId: text('trigger_message_id'),

    status: text('status', { enum: ['queued', 'running', 'complete', 'failed', 'aborted'] }).notNull(),
    error: text('error'),

    parentRunId: text('parent_run_id'),

    /** Token 使用量。run 完成时由 adapter 报告并由 AgentRunner 落库。null = 该 run 未上报（如 mock / 失败）。 */
    usage: text('usage', { mode: 'json' }).$type<RunUsage>(),

    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
  },
  (t) => [index('idx_runs_parent').on(t.parentRunId)],
)

// ─── Agent run debug snapshots ─────────────────────────────
export const agentRunDebugSnapshots = sqliteTable(
  'agent_run_debug_snapshots',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
    snapshot: text('snapshot', { mode: 'json' }).$type<AgentRunDebugSnapshot>().notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_run_debug_run').on(t.runId),
    index('idx_run_debug_conv_created').on(t.conversationId, t.createdAt),
  ],
)

// ─── Automations ─────────────────────────────────────────────
export type AutomationStatus = 'enabled' | 'running' | 'draft' | 'paused'
export type AutomationRunStatus = 'success' | 'failed' | 'running'
export type AutomationIconKey = 'newspaper' | 'languages' | 'calendar_clock' | 'video' | 'history'
export type AutomationScheduleType = 'manual' | 'interval' | 'daily' | 'weekly'
export type AutomationRunTrigger = 'manual' | 'schedule'
export type AutomationRunLogLevel = 'info' | 'warn' | 'error'

export const automations = sqliteTable(
  'automations',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull(),
    cadence: text('cadence').notNull(),
    status: text('status').$type<AutomationStatus>().notNull(),
    iconKey: text('icon_key').$type<AutomationIconKey>().notNull(),
    prompt: text('prompt').notNull().default(''),
    agentId: text('agent_id').references(() => agents.id),
    conversationId: text('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    scheduleType: text('schedule_type').$type<AutomationScheduleType>().notNull().default('manual'),
    scheduleConfig: text('schedule_config'),
    nextRunAt: integer('next_run_at'),
    latestRunAt: integer('latest_run_at'),
    lastError: text('last_error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('idx_automations_status').on(t.status),
    index('idx_automations_next_run').on(t.status, t.nextRunAt),
    index('idx_automations_updated').on(t.updatedAt),
  ],
)

export const automationRuns = sqliteTable(
  'automation_runs',
  {
    id: text('id').primaryKey(),
    automationId: text('automation_id')
      .notNull()
      .references(() => automations.id, { onDelete: 'cascade' }),
    status: text('status').$type<AutomationRunStatus>().notNull(),
    trigger: text('trigger').$type<AutomationRunTrigger>().notNull().default('manual'),
    agentRunId: text('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    conversationId: text('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    attempt: integer('attempt').notNull().default(1),
    durationMs: integer('duration_ms'),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
    error: text('error'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index('idx_automation_runs_automation_started').on(t.automationId, t.startedAt),
    index('idx_automation_runs_started').on(t.startedAt),
    index('idx_automation_runs_status').on(t.status),
  ],
)

export const automationRunLogs = sqliteTable(
  'automation_run_logs',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => automationRuns.id, { onDelete: 'cascade' }),
    level: text('level').$type<AutomationRunLogLevel>().notNull(),
    message: text('message').notNull(),
    metadata: text('metadata'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('idx_automation_run_logs_run_created').on(t.runId, t.createdAt)],
)

export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    body: text('body'),
    level: text('level').$type<AppNotificationLevel>().notNull(),
    source: text('source').$type<AppNotificationSource>().notNull(),
    category: text('category').$type<AppNotificationCategory>().notNull(),
    priority: text('priority').$type<AppNotificationPriority>().notNull(),
    targetType: text('target_type').$type<AppNotificationTargetType>(),
    targetPayload: text('target_payload', { mode: 'json' }).$type<AppNotificationTarget>(),
    toast: integer('toast', { mode: 'boolean' }).notNull().default(true),
    native: integer('native', { mode: 'boolean' }).notNull().default(false),
    urgent: integer('urgent', { mode: 'boolean' }).notNull().default(false),
    readAt: integer('read_at'),
    deletedAt: integer('deleted_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('idx_notifications_created').on(t.createdAt),
    index('idx_notifications_unread').on(t.readAt, t.deletedAt, t.createdAt),
    index('idx_notifications_category').on(t.category, t.createdAt),
  ],
)

/** RunUsage —— 一次 run 累计的 token 用量。所有字段 0+ 整数；不返回的字段 0 不是 null（聚合好处理）。 */
export interface RunUsage {
  inputTokens: number
  outputTokens: number
  /** Anthropic prompt caching: 写入缓存的 tokens（贵） */
  cacheCreationTokens: number
  /** Anthropic prompt caching: 命中缓存的 tokens（便宜）；DeepSeek 的 prompt_cache_hit_tokens 也映射到这里 */
  cacheReadTokens: number
  /** 用于上下文窗口仪表的最近一次「input prompt 长度」（不是累计），方便 UI 显示 ctx X/200k */
  lastInputTokens?: number
  /** 实际使用的模型 id；不同 run 可能不同（agent 配置改过 / 第三方网关动态路由），用来归类 */
  model?: string
}

// ─── Conversation context summaries ────────────────────────────────────────
export const contextSummaries = sqliteTable(
  'conversation_context_summaries',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    summary: text('summary').notNull(),
    coveredUntilMessageId: text('covered_until_message_id').notNull(),
    coveredUntilCreatedAt: integer('covered_until_created_at').notNull(),
    sourceMessageCount: integer('source_message_count').notNull(),
    tokenEstimate: integer('token_estimate').notNull(),
    modelProvider: text('model_provider').$type<ModelProvider>(),
    modelId: text('model_id'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('idx_context_summaries_conv_created').on(t.conversationId, t.createdAt)],
)

export type WorkspaceMemorySource = 'user' | 'agent' | 'system'

// ─── Workspace Memory ────────────────────────────────────────
export const workspaceMemories = sqliteTable(
  'workspace_memories',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    content: text('content').notNull(),
    source: text('source', { enum: ['user', 'agent', 'system'] })
      .$type<WorkspaceMemorySource>()
      .notNull()
      .default('user'),
    createdByAgentId: text('created_by_agent_id').references(() => agents.id),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('idx_workspace_memories_conv_updated').on(t.conversationId, t.updatedAt),
    index('idx_workspace_memories_conv_pinned').on(t.conversationId, t.pinned, t.updatedAt),
  ],
)

export type McpCheckStatus = 'ok' | 'failed'

// ─── External MCP Servers ───────────────────────────────────
export const mcpServers = sqliteTable(
  'mcp_servers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    transport: text('transport', { enum: ['stdio'] }).notNull().default('stdio'),
    command: text('command').notNull(),
    args: text('args', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    env: text('env', { mode: 'json' }).$type<Record<string, string>>().notNull().default(sql`'{}'`),
    trust: text('trust', { enum: ['always', 'ask'] }).notNull().default('ask'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    lastCheckedAt: integer('last_checked_at'),
    lastCheckStatus: text('last_check_status').$type<McpCheckStatus>(),
    lastCheckMessage: text('last_check_message'),
    lastToolCount: integer('last_tool_count'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('idx_mcp_servers_enabled').on(t.enabled)],
)

// ─── Skills ─────────────────────────────────────────────────
export const skills = sqliteTable(
  'skills',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    description: text('description').notNull(),
    content: text('content'),
    sourcePath: text('source_path').notNull(),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('idx_skills_enabled').on(t.enabled)],
)

// ─── AppSettings (全局 API key / endpoint) ──────────────────
/**
 * 全局应用设置。单行表（PK 固定 'singleton'），存用户在「设置」面板填写的
 * API key / base URL。优先级高于 process.env，让用户不必编辑 .env.local。
 *
 * 桌面版 Electron 模式下也是这张表（不引入 keychain / safeStorage 等额外存储）。
 */
export const appSettings = sqliteTable('app_settings', {
  id: text('id').primaryKey(),                      // 永远 = 'singleton'
  anthropicApiKey: text('anthropic_api_key'),       // ANTHROPIC_API_KEY 等价
  anthropicBaseUrl: text('anthropic_base_url'),     // 第三方网关（anyrouter 等）；非空时 anthropicApiKey 作 AUTH_TOKEN
  openaiApiKey: text('openai_api_key'),
  deepseekApiKey: text('deepseek_api_key'),
  arkApiKey: text('ark_api_key'),
  companionMode: text('companion_mode', { enum: ['off', 'lan', 'tailnet'] }).notNull().default('off'),
  mobileDeviceToken: text('mobile_device_token'),
  deploymentPublishEnabled: integer('deployment_publish_enabled', { mode: 'boolean' })
    .notNull()
    .default(false),
  deploymentPublishDir: text('deployment_publish_dir'),
  deploymentPublicBaseUrl: text('deployment_public_base_url'),
  notificationTaskEnabled: integer('notification_task_enabled', { mode: 'boolean' }).notNull().default(true),
  notificationErrorEnabled: integer('notification_error_enabled', { mode: 'boolean' }).notNull().default(true),
  notificationSystemEnabled: integer('notification_system_enabled', { mode: 'boolean' }).notNull().default(true),
  notificationConfigurationEnabled: integer('notification_configuration_enabled', { mode: 'boolean' }).notNull().default(true),
  notificationToastEnabled: integer('notification_toast_enabled', { mode: 'boolean' }).notNull().default(true),
  notificationNativeEnabled: integer('notification_native_enabled', { mode: 'boolean' }).notNull().default(true),
  notificationUrgentEnabled: integer('notification_urgent_enabled', { mode: 'boolean' }).notNull().default(true),
  updatedAt: integer('updated_at').notNull(),
})

export type WorkspaceMemoryRow = typeof workspaceMemories.$inferSelect
export type WorkspaceMemoryInsert = typeof workspaceMemories.$inferInsert

export type AgentRunDebugSnapshotRow = typeof agentRunDebugSnapshots.$inferSelect
export type AgentRunDebugSnapshotInsert = typeof agentRunDebugSnapshots.$inferInsert

export type McpServerRow = typeof mcpServers.$inferSelect
export type McpServerInsert = typeof mcpServers.$inferInsert

export type SkillRow = typeof skills.$inferSelect
export type SkillInsert = typeof skills.$inferInsert

export type AppSettingsRow = typeof appSettings.$inferSelect
export type AppSettingsInsert = typeof appSettings.$inferInsert

// ─── 类型导出（推断行类型）─────────────────────────────────
export type AgentRow = typeof agents.$inferSelect
export type AgentInsert = typeof agents.$inferInsert

export type ConversationRow = typeof conversations.$inferSelect
export type ConversationInsert = typeof conversations.$inferInsert

/**
 * Conversation 行 + 关联 workspace 的 mode / boundPath（前端需要在多处显示
 * 「本地工作目录」标识，每次 lazy fetch workspace 太啰嗦，listConversations
 * 一次 JOIN 出来）。
 */
export interface ConversationWithMeta extends ConversationRow {
  workspaceMode: 'sandbox' | 'local'
  workspaceBoundPath: string | null
}

export type MessageRow = typeof messages.$inferSelect
export type MessageInsert = typeof messages.$inferInsert

export type ArtifactRow = typeof artifacts.$inferSelect
export type ArtifactInsert = typeof artifacts.$inferInsert

export type WorkspaceRow = typeof workspaces.$inferSelect
export type WorkspaceInsert = typeof workspaces.$inferInsert

export type AttachmentRow = typeof attachments.$inferSelect
export type AttachmentInsert = typeof attachments.$inferInsert

export type AgentRunRow = typeof agentRuns.$inferSelect
export type AgentRunInsert = typeof agentRuns.$inferInsert

export type AutomationRow = typeof automations.$inferSelect
export type AutomationInsert = typeof automations.$inferInsert

export type AutomationRunRow = typeof automationRuns.$inferSelect
export type AutomationRunLogRow = typeof automationRunLogs.$inferSelect
export type AutomationRunLogInsert = typeof automationRunLogs.$inferInsert

export type NotificationRow = typeof notifications.$inferSelect
export type NotificationInsert = typeof notifications.$inferInsert

export type ContextSummaryRow = typeof contextSummaries.$inferSelect
export type ContextSummaryInsert = typeof contextSummaries.$inferInsert
