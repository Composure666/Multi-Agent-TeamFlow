/**
 * DB 启动期自举：建表 + 自动 seed 内置 agent。
 *
 * 设计意图：
 *  - 打包后桌面版第一次启动时，userData 里只有空 DB 文件，没有任何表 / 数据。
 *    本模块在 client.ts 初始化 drizzle 之前同步建表（CREATE TABLE IF NOT EXISTS）。
 *  - 内置 agent 也在此自动 seed —— 不再需要用户手动 `pnpm db:seed`（packaged 应用里也没有 pnpm 可用）。
 *
 * 全部用 better-sqlite3 原生同步 API：
 *  - CJS 标准下 `client.ts` 模块顶层不能 await；drizzle 的 query API 全是 Promise，没法在 module-init 阶段调
 *  - better-sqlite3 是同步的 native binding，prepare/run 立即返回，对 sub-ms 启动期开销可忽略
 *
 * 幂等：
 *  - CREATE TABLE IF NOT EXISTS 不重复建表
 *  - seed 前先查 is_builtin=1 是否已有记录，已有就跳过
 *
 * 详见 Spec 12 §5 / §6 与 Spec 08。
 */
import type Database from 'better-sqlite3'

import { BUILTIN_AGENTS, UI_DESIGNER_ARTIFACT_PROMPT_HINT } from './builtin-agents'

const FRONTEND_DEPLOYMENT_PROMPT_HINT =
  'deploy_artifact / deploy_workspace 返回的 previewPath 是当前 AgentHub 实例下的相对路径，不要在文字总结里把它改写成公网域名或自造完整 URL；让用户点击部署卡片按钮，或原样引用 previewPath。'
const FRONTEND_LOCAL_WORKSPACE_PROMPT_HINT =
  '当 workspace_info mode=local 且用户要求创建 / 修改 / 初始化 / 调试前端项目、源码文件、依赖或构建配置时，优先使用 fs_read / fs_write / bash 直接操作本地文件并运行验证；不要用 write_artifact 代替应该落盘的源码。构建出 dist/build/out 等静态目录后，可用 deploy_workspace 生成部署预览卡。只有用户明确要求网页产物、可预览原型、artifact 或独立 demo 时，才用 write_artifact + deploy_artifact。'
const REVIEWER_LOCAL_WORKSPACE_PROMPT_HINT =
  '本地代码审查先用 fs_read 查看关键文件，必要时用 bash 运行检查命令；不要只根据文件名、任务摘要或 artifact 占位做判断。'
const BUILTIN_TOOL_UPGRADES = new Map(
  BUILTIN_AGENTS.map((agent) => [agent.id, agent.toolNames] as const),
)

const AUTOMATION_SEED = [
  {
    id: 'auto_daily_ai_news',
    title: '每日 AI 新闻推送',
    description: '关注当天 AI 领域的重要动态，自动整理并推送摘要。',
    category: '内容推送',
    cadence: '每天 08:30',
    status: 'enabled',
    iconKey: 'newspaper',
    prompt: '请整理今天 AI 领域的重要动态，输出 5 条以内摘要，包含来源、影响和后续关注点。',
    scheduleType: 'daily',
    scheduleConfig: { timeOfDay: '08:30' },
  },
  {
    id: 'auto_daily_english_words',
    title: '每日 5 个英语单词',
    description: '每天推荐 5 个高频实用英语单词，包含释义与例句。',
    category: '学习提醒',
    cadence: '每天 07:45',
    status: 'running',
    iconKey: 'languages',
    prompt: '请推荐 5 个高频实用英语单词，为每个单词提供中文释义、英文例句和记忆提示。',
    scheduleType: 'daily',
    scheduleConfig: { timeOfDay: '07:45' },
  },
  {
    id: 'auto_weekly_work_report',
    title: '每周工作周报',
    description: '每周五汇总仓库 PR、Issue 与任务进展，生成工作周报。',
    category: '项目报告',
    cadence: '周五 18:00',
    status: 'enabled',
    iconKey: 'calendar_clock',
    prompt: '请汇总本周项目进展，整理已完成工作、风险问题和下周计划，输出一份简洁周报。',
    scheduleType: 'weekly',
    scheduleConfig: { dayOfWeek: 5, timeOfDay: '18:00' },
  },
  {
    id: 'auto_classic_movie',
    title: '经典电影推荐',
    description: '推荐一部高分经典电影，并附带简短推荐理由。',
    category: '兴趣推荐',
    cadence: '每天 20:00',
    status: 'enabled',
    iconKey: 'video',
    prompt: '请推荐一部高分经典电影，说明推荐理由、适合人群和一句话看点。',
    scheduleType: 'daily',
    scheduleConfig: { timeOfDay: '20:00' },
  },
  {
    id: 'auto_today_history',
    title: '历史上的今天',
    description: '从科技、电影、文化等领域挑选一件历史事件进行介绍。',
    category: '内容推送',
    cadence: '每天 09:00',
    status: 'draft',
    iconKey: 'history',
    prompt: '请介绍历史上的今天发生的一件科技、电影或文化事件，包含背景、过程和影响。',
    scheduleType: 'manual',
    scheduleConfig: null,
  },
] as const

const DAY_MS = 24 * 60 * 60 * 1000

const DDL: string[] = [
  // ─── agents ────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT NOT NULL,
    description TEXT NOT NULL,
    capabilities TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    adapter_name TEXT NOT NULL,
    model_provider TEXT,
    model_id TEXT,
    api_key TEXT,
    api_base_url TEXT,
    tool_names TEXT NOT NULL,
    mcp_server_ids TEXT NOT NULL DEFAULT '[]',
    is_builtin INTEGER NOT NULL DEFAULT 0,
    is_orchestrator INTEGER NOT NULL DEFAULT 0,
    supports_vision INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,

  // ─── conversations ─────────────────────────────
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    mode TEXT NOT NULL,
    agent_ids TEXT NOT NULL,
    pinned_message_ids TEXT NOT NULL DEFAULT '[]',
    bookmarked_message_ids TEXT NOT NULL DEFAULT '[]',
    archived INTEGER NOT NULL DEFAULT 0,
    pinned_at INTEGER,
    fs_write_approval_mode TEXT NOT NULL DEFAULT 'review',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at)`,

  // ─── messages ──────────────────────────────────
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    agent_id TEXT REFERENCES agents(id),
    parts TEXT NOT NULL,
    status TEXT NOT NULL,
    parent_message_id TEXT,
    mentioned_agent_ids TEXT NOT NULL DEFAULT '[]',
    run_id TEXT,
    usage TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at)`,

  // ─── artifacts ─────────────────────────────────
  `CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    parent_artifact_id TEXT,
    created_by_agent_id TEXT NOT NULL REFERENCES agents(id),
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_artifacts_conv ON artifacts(conversation_id)`,

  // ─── workspaces ────────────────────────────────
  `CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
    root_path TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'sandbox',
    bound_path TEXT,
    created_at INTEGER NOT NULL
  )`,

  // ─── attachments ───────────────────────────────
  `CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_conv ON attachments(conversation_id)`,

  // ─── agent_runs ────────────────────────────────
  `CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    trigger_message_id TEXT,
    status TEXT NOT NULL,
    error TEXT,
    parent_run_id TEXT,
    usage TEXT,
    started_at INTEGER NOT NULL,
    finished_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_runs_parent ON agent_runs(parent_run_id)`,

  // ─── agent_run_debug_snapshots ─────────────────
  `CREATE TABLE IF NOT EXISTS agent_run_debug_snapshots (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    snapshot TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_run_debug_run ON agent_run_debug_snapshots(run_id)`,
  `CREATE INDEX IF NOT EXISTS idx_run_debug_conv_created ON agent_run_debug_snapshots(conversation_id, created_at)`,

  // ─── automations ───────────────────────────────
  `CREATE TABLE IF NOT EXISTS automations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    cadence TEXT NOT NULL,
    status TEXT NOT NULL,
    icon_key TEXT NOT NULL,
    prompt TEXT NOT NULL DEFAULT '',
    agent_id TEXT REFERENCES agents(id),
    conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
    schedule_type TEXT NOT NULL DEFAULT 'manual',
    schedule_config TEXT,
    next_run_at INTEGER,
    latest_run_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_automations_status ON automations(status)`,
  `CREATE INDEX IF NOT EXISTS idx_automations_updated ON automations(updated_at)`,

  `CREATE TABLE IF NOT EXISTS automation_runs (
    id TEXT PRIMARY KEY,
    automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    trigger TEXT NOT NULL DEFAULT 'manual',
    agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    attempt INTEGER NOT NULL DEFAULT 1,
    duration_ms INTEGER,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    error TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_automation_runs_automation_started ON automation_runs(automation_id, started_at)`,
  `CREATE INDEX IF NOT EXISTS idx_automation_runs_started ON automation_runs(started_at)`,
  `CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON automation_runs(status)`,

  `CREATE TABLE IF NOT EXISTS automation_run_logs (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_automation_run_logs_run_created ON automation_run_logs(run_id, created_at)`,

  // ─── notifications ─────────────────────────────
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT,
    level TEXT NOT NULL,
    source TEXT NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    target_type TEXT,
    target_payload TEXT,
    toast INTEGER NOT NULL DEFAULT 1,
    native INTEGER NOT NULL DEFAULT 0,
    urgent INTEGER NOT NULL DEFAULT 0,
    read_at INTEGER,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(read_at, deleted_at, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(category, created_at)`,

  // ─── conversation_context_summaries ─────────────────────────
  `CREATE TABLE IF NOT EXISTS conversation_context_summaries (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    covered_until_message_id TEXT NOT NULL,
    covered_until_created_at INTEGER NOT NULL,
    source_message_count INTEGER NOT NULL,
    token_estimate INTEGER NOT NULL,
    model_provider TEXT,
    model_id TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_context_summaries_conv_created ON conversation_context_summaries(conversation_id, created_at)`,

  // ─── workspace_memories ────────────────────────
  `CREATE TABLE IF NOT EXISTS workspace_memories (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'user',
    created_by_agent_id TEXT REFERENCES agents(id),
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_workspace_memories_conv_updated ON workspace_memories(conversation_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_workspace_memories_conv_pinned ON workspace_memories(conversation_id, pinned, updated_at)`,

  // ─── mcp_servers ───────────────────────────────
  `CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    transport TEXT NOT NULL DEFAULT 'stdio',
    command TEXT NOT NULL,
    args TEXT NOT NULL DEFAULT '[]',
    env TEXT NOT NULL DEFAULT '{}',
    trust TEXT NOT NULL DEFAULT 'ask',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers(enabled)`,

  // ─── app_settings ──────────────────────────────
  `CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY,
    anthropic_api_key TEXT,
    anthropic_base_url TEXT,
    openai_api_key TEXT,
    deepseek_api_key TEXT,
    ark_api_key TEXT,
    companion_mode TEXT NOT NULL DEFAULT 'off',
    mobile_device_token TEXT,
    deployment_publish_enabled INTEGER NOT NULL DEFAULT 0,
    deployment_publish_dir TEXT,
    deployment_public_base_url TEXT,
    notification_task_enabled INTEGER NOT NULL DEFAULT 1,
    notification_error_enabled INTEGER NOT NULL DEFAULT 1,
    notification_system_enabled INTEGER NOT NULL DEFAULT 1,
    notification_configuration_enabled INTEGER NOT NULL DEFAULT 1,
    notification_toast_enabled INTEGER NOT NULL DEFAULT 1,
    notification_native_enabled INTEGER NOT NULL DEFAULT 1,
    notification_urgent_enabled INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
  )`,
]

/** 建表 / 建索引（幂等）。 */
function ensureSchema(sqlite: Database.Database): void {
  for (const stmt of DDL) {
    sqlite.exec(stmt)
  }
  safeAlter(sqlite, `ALTER TABLE agents ADD COLUMN mcp_server_ids TEXT NOT NULL DEFAULT '[]'`)
  safeAlter(sqlite, `ALTER TABLE app_settings ADD COLUMN companion_mode TEXT NOT NULL DEFAULT 'off'`)
  safeAlter(sqlite, `ALTER TABLE app_settings ADD COLUMN mobile_device_token TEXT`)
  safeAlter(sqlite, `ALTER TABLE app_settings ADD COLUMN deployment_publish_enabled INTEGER NOT NULL DEFAULT 0`)
  safeAlter(sqlite, `ALTER TABLE app_settings ADD COLUMN deployment_publish_dir TEXT`)
  safeAlter(sqlite, `ALTER TABLE app_settings ADD COLUMN deployment_public_base_url TEXT`)
  safeAlter(sqlite, `ALTER TABLE app_settings ADD COLUMN notification_task_enabled INTEGER NOT NULL DEFAULT 1`)
  safeAlter(sqlite, `ALTER TABLE app_settings ADD COLUMN notification_error_enabled INTEGER NOT NULL DEFAULT 1`)
  safeAlter(sqlite, `ALTER TABLE app_settings ADD COLUMN notification_system_enabled INTEGER NOT NULL DEFAULT 1`)
  safeAlter(sqlite, `ALTER TABLE app_settings ADD COLUMN notification_configuration_enabled INTEGER NOT NULL DEFAULT 1`)
  safeAlter(sqlite, `ALTER TABLE app_settings ADD COLUMN notification_toast_enabled INTEGER NOT NULL DEFAULT 1`)
  safeAlter(sqlite, `ALTER TABLE app_settings ADD COLUMN notification_native_enabled INTEGER NOT NULL DEFAULT 1`)
  safeAlter(sqlite, `ALTER TABLE app_settings ADD COLUMN notification_urgent_enabled INTEGER NOT NULL DEFAULT 1`)
  safeAlter(sqlite, `ALTER TABLE automations ADD COLUMN prompt TEXT NOT NULL DEFAULT ''`)
  safeAlter(sqlite, `ALTER TABLE automations ADD COLUMN agent_id TEXT REFERENCES agents(id)`)
  safeAlter(sqlite, `ALTER TABLE automations ADD COLUMN conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL`)
  safeAlter(sqlite, `ALTER TABLE automations ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL`)
  safeAlter(sqlite, `ALTER TABLE automations ADD COLUMN schedule_type TEXT NOT NULL DEFAULT 'manual'`)
  safeAlter(sqlite, `ALTER TABLE automations ADD COLUMN schedule_config TEXT`)
  safeAlter(sqlite, `ALTER TABLE automations ADD COLUMN next_run_at INTEGER`)
  safeAlter(sqlite, `ALTER TABLE automations ADD COLUMN last_error TEXT`)
  safeAlter(sqlite, `ALTER TABLE automation_runs ADD COLUMN trigger TEXT NOT NULL DEFAULT 'manual'`)
  safeAlter(sqlite, `ALTER TABLE automation_runs ADD COLUMN agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL`)
  safeAlter(sqlite, `ALTER TABLE automation_runs ADD COLUMN conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL`)
  safeAlter(sqlite, `ALTER TABLE automation_runs ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1`)
  safeAlter(sqlite, `ALTER TABLE automation_runs ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0`)
  safeAlter(sqlite, `ALTER TABLE automation_runs ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0`)
  sqlite.exec(`UPDATE automation_runs SET created_at = started_at WHERE created_at = 0`)
  sqlite.exec(`UPDATE automation_runs SET updated_at = COALESCE(finished_at, started_at) WHERE updated_at = 0`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_automations_next_run ON automations(status, next_run_at)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_automation_run_logs_run_created ON automation_run_logs(run_id, created_at)`)
}

function safeAlter(sqlite: Database.Database, stmt: string): void {
  try {
    sqlite.exec(stmt)
  } catch (err) {
    if (err instanceof Error && err.message.includes('duplicate column name')) return
    throw err
  }
}

/** 已有任意 builtin agent 就跳过；否则一次插入全部。 */
function ensureBuiltinAgents(sqlite: Database.Database): void {
  const row = sqlite
    .prepare('SELECT 1 AS one FROM agents WHERE is_builtin = 1 LIMIT 1')
    .get()
  if (row) return

  const insert = sqlite.prepare(`
    INSERT INTO agents (
      id, name, avatar, description, capabilities, system_prompt,
      adapter_name, model_provider, model_id, api_key, api_base_url,
      tool_names, mcp_server_ids, is_builtin, is_orchestrator, supports_vision, created_at
    ) VALUES (
      @id, @name, @avatar, @description, @capabilities, @system_prompt,
      @adapter_name, @model_provider, @model_id, @api_key, @api_base_url,
      @tool_names, @mcp_server_ids, @is_builtin, @is_orchestrator, @supports_vision, @created_at
    )
  `)

  const tx = sqlite.transaction((agents: typeof BUILTIN_AGENTS) => {
    for (const a of agents) {
      insert.run({
        id: a.id,
        name: a.name,
        avatar: a.avatar,
        description: a.description,
        capabilities: JSON.stringify(a.capabilities),
        system_prompt: a.systemPrompt,
        adapter_name: a.adapterName,
        model_provider: a.modelProvider ?? null,
        model_id: a.modelId ?? null,
        api_key: a.apiKey ?? null,
        api_base_url: a.apiBaseUrl ?? null,
        tool_names: JSON.stringify(a.toolNames),
        mcp_server_ids: '[]',
        is_builtin: a.isBuiltin ? 1 : 0,
        is_orchestrator: a.isOrchestrator ? 1 : 0,
        supports_vision: a.supportsVision ? 1 : 0,
        created_at: a.createdAt,
      })
    }
  })

  tx(BUILTIN_AGENTS)
}

function upgradeBuiltinAgents(sqlite: Database.Database): void {
  const rows = sqlite
    .prepare('SELECT id, tool_names, system_prompt FROM agents WHERE is_builtin = 1')
    .all() as { id: string; tool_names: string; system_prompt: string }[]

  const update = sqlite.prepare(
    'UPDATE agents SET tool_names = ?, system_prompt = ? WHERE id = ? AND is_builtin = 1',
  )

  for (const row of rows) {
    let changed = false
    let toolNames: string[]
    try {
      const parsed = JSON.parse(row.tool_names) as unknown
      toolNames = Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : []
    } catch {
      toolNames = []
    }

    for (const toolName of BUILTIN_TOOL_UPGRADES.get(row.id) ?? []) {
      if (toolNames.includes(toolName)) continue
      if (toolName === 'deploy_artifact') {
        const insertAfter = toolNames.indexOf('write_artifact')
        if (insertAfter >= 0) toolNames.splice(insertAfter + 1, 0, toolName)
        else toolNames.push(toolName)
      } else {
        toolNames.push(toolName)
      }
      changed = true
    }

    let systemPrompt = row.system_prompt
    if (row.id === 'ag_frontend' && !systemPrompt.includes('deploy_artifact')) {
      systemPrompt +=
        '\n\n完成 web_app 产物后必须调用 deploy_artifact，让用户在消息里拿到部署状态卡和可打开的本地预览路径。'
      changed = true
    }
    if (
      row.id === 'ag_frontend' &&
      !systemPrompt.includes('不要在文字总结里把它改写成公网域名')
    ) {
      systemPrompt += `\n\n${FRONTEND_DEPLOYMENT_PROMPT_HINT}`
      changed = true
    }
    if (
      row.id === 'ag_frontend' &&
      (!systemPrompt.includes('不要用 write_artifact 代替应该落盘的源码') ||
        !systemPrompt.includes('deploy_workspace'))
    ) {
      systemPrompt += `\n\n${FRONTEND_LOCAL_WORKSPACE_PROMPT_HINT}`
      changed = true
    }
    if (row.id === 'ag_reviewer' && !systemPrompt.includes('本地代码审查先用 fs_read')) {
      systemPrompt += `\n\n${REVIEWER_LOCAL_WORKSPACE_PROMPT_HINT}`
      changed = true
    }
    if (row.id === 'ag_designer' && !systemPrompt.includes('禁止 write_artifact({})')) {
      systemPrompt += `\n\n${UI_DESIGNER_ARTIFACT_PROMPT_HINT}`
      changed = true
    }

    if (changed) update.run(JSON.stringify(toolNames), systemPrompt, row.id)
  }
}

function ensureDemoAutomations(sqlite: Database.Database): void {
  const row = sqlite
    .prepare('SELECT 1 AS one FROM automations LIMIT 1')
    .get()
  if (row) {
    backfillDemoAutomationPrompts(sqlite)
    return
  }

  const now = Date.now()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const startOfToday = todayStart.getTime()

  const latestRuns: Record<string, number | null> = {
    auto_daily_ai_news: startOfToday + 8 * 60 * 60 * 1000 + 30 * 60 * 1000,
    auto_daily_english_words: startOfToday + 7 * 60 * 60 * 1000 + 45 * 60 * 1000,
    auto_weekly_work_report: startOfToday - 3 * DAY_MS + 18 * 60 * 60 * 1000,
    auto_classic_movie: startOfToday - DAY_MS + 20 * 60 * 60 * 1000,
    auto_today_history: null,
  }

  const insertAutomation = sqlite.prepare(`
    INSERT INTO automations (
      id, title, description, category, cadence, status, icon_key,
      prompt, schedule_type, schedule_config, next_run_at,
      latest_run_at, created_at, updated_at
    ) VALUES (
      @id, @title, @description, @category, @cadence, @status, @icon_key,
      @prompt, @schedule_type, @schedule_config, @next_run_at,
      @latest_run_at, @created_at, @updated_at
    )
  `)
  const insertRun = sqlite.prepare(`
    INSERT INTO automation_runs (
      id, automation_id, status, trigger, attempt, duration_ms,
      started_at, finished_at, error, created_at, updated_at
    ) VALUES (
      @id, @automation_id, @status, @trigger, @attempt, @duration_ms,
      @started_at, @finished_at, @error, @created_at, @updated_at
    )
  `)

  const tx = sqlite.transaction(() => {
    for (const item of AUTOMATION_SEED) {
      insertAutomation.run({
        id: item.id,
        title: item.title,
        description: item.description,
        category: item.category,
        cadence: item.cadence,
        status: item.status,
        icon_key: item.iconKey,
        prompt: item.prompt,
        schedule_type: item.scheduleType,
        schedule_config: item.scheduleConfig ? JSON.stringify(item.scheduleConfig) : null,
        next_run_at: item.status === 'enabled' ? latestRuns[item.id] ? latestRuns[item.id]! + DAY_MS : startOfToday + DAY_MS : null,
        latest_run_at: latestRuns[item.id],
        created_at: now - 14 * DAY_MS,
        updated_at: latestRuns[item.id] ?? now - 2 * DAY_MS,
      })
    }

    const runRows = [
      ['arun_ai_news_today', 'auto_daily_ai_news', 'success', 36_000, latestRuns.auto_daily_ai_news],
      ['arun_english_today', 'auto_daily_english_words', 'running', 12_000, latestRuns.auto_daily_english_words],
      ['arun_report_recent', 'auto_weekly_work_report', 'success', 138_000, latestRuns.auto_weekly_work_report],
      ['arun_movie_yesterday', 'auto_classic_movie', 'failed', 8_000, latestRuns.auto_classic_movie],
      ['arun_history_today', 'auto_today_history', 'success', 24_000, startOfToday + 9 * 60 * 60 * 1000],
      ['arun_ai_news_d1', 'auto_daily_ai_news', 'success', 32_000, startOfToday - DAY_MS + 8 * 60 * 60 * 1000],
      ['arun_english_d1', 'auto_daily_english_words', 'success', 18_000, startOfToday - DAY_MS + 7 * 60 * 60 * 1000],
      ['arun_ai_news_d2', 'auto_daily_ai_news', 'success', 35_000, startOfToday - 2 * DAY_MS + 8 * 60 * 60 * 1000],
      ['arun_movie_d2', 'auto_classic_movie', 'success', 42_000, startOfToday - 2 * DAY_MS + 20 * 60 * 60 * 1000],
      ['arun_history_d3', 'auto_today_history', 'success', 26_000, startOfToday - 3 * DAY_MS + 9 * 60 * 60 * 1000],
      ['arun_english_d4', 'auto_daily_english_words', 'success', 17_000, startOfToday - 4 * DAY_MS + 7 * 60 * 60 * 1000],
      ['arun_ai_news_d5', 'auto_daily_ai_news', 'success', 34_000, startOfToday - 5 * DAY_MS + 8 * 60 * 60 * 1000],
      ['arun_movie_d6', 'auto_classic_movie', 'success', 39_000, startOfToday - 6 * DAY_MS + 20 * 60 * 60 * 1000],
    ] as const

    for (const [id, automationId, status, durationMs, startedAt] of runRows) {
      if (startedAt === null) continue
      const finishedAt = status === 'running' ? null : startedAt + durationMs
      insertRun.run({
        id,
        automation_id: automationId,
        status,
        trigger: 'schedule',
        attempt: 1,
        duration_ms: durationMs,
        started_at: startedAt,
        finished_at: finishedAt,
        error: status === 'failed' ? '示例运行失败：输入源暂不可用' : null,
        created_at: startedAt,
        updated_at: finishedAt ?? startedAt,
      })
    }
  })

  tx()
  backfillDemoAutomationPrompts(sqlite)
}

function backfillDemoAutomationPrompts(sqlite: Database.Database): void {
  const update = sqlite.prepare(`
    UPDATE automations
    SET prompt = @prompt, schedule_type = @schedule_type, schedule_config = @schedule_config, updated_at = @updated_at
    WHERE id = @id AND (prompt IS NULL OR trim(prompt) = '')
  `)
  const now = Date.now()

  const tx = sqlite.transaction(() => {
    for (const item of AUTOMATION_SEED) {
      update.run({
        id: item.id,
        prompt: item.prompt,
        schedule_type: item.scheduleType,
        schedule_config: item.scheduleConfig ? JSON.stringify(item.scheduleConfig) : null,
        updated_at: now,
      })
    }
  })

  tx()
}

export function bootstrapDatabase(sqlite: Database.Database): void {
  ensureSchema(sqlite)
  ensureBuiltinAgents(sqlite)
  upgradeBuiltinAgents(sqlite)
  ensureDemoAutomations(sqlite)
}
