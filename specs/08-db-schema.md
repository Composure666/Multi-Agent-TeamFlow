# Spec 08 — 数据库 Schema

> Drizzle ORM + SQLite。本 spec 描述核心业务表、自动化表、上下文基础设施表、外部 MCP 表、Workspace Memory 表、Agent Run 调试快照表与全局设置表的字段、索引、外键级联策略，是 Spec 01/16/17 实体及自动化支撑实体的物理映射。**修改字段需先讨论。**
>
> 7 张「核心业务表」（agents / conversations / messages / artifacts / workspaces / attachments / agent_runs）映射 Spec 01 的核心实体；`automations` / `automation_runs` 是自动化能力支撑表；`conversation_context_summaries` 是上下文压缩基础设施表；`workspace_memories` 是当前 conversation/workspace 的长期备注表；`agent_run_debug_snapshots` 是 run 调试快照表；`app_settings` 是单行配置表，不对应实体。

源文件：`src/db/schema.ts`

---

## 设计原则

1. **SQLite 本地文件数据库**，单进程读写，文件位于 `.agenthub-data/agenthub.db`（gitignored）
2. **timestamps 用 `INTEGER` 存 unix ms**（不用 ISO 字符串，省存储 + 比较快）
3. **结构化列用 JSON 文本**（drizzle 的 `text(..., { mode: 'json' })`）。SQLite 不支持原生 JSON 列约束，依赖应用层 zod / 类型校验
4. **boolean 用 `INTEGER 0/1`**（drizzle `mode: 'boolean'`）
5. **外键 + cascade**：会话是 aggregate root，删除时级联清掉 messages / artifacts / workspaces / attachments / agent_runs / conversation_context_summaries
6. **不引入复合主键 / 多列唯一约束**（除 workspaces 的 unique conversationId），关系通过 ID 字段维护

---

## 1. agents

```ts
agents {
  id              text PK           // ag_<nanoid>
  name            text NOT NULL
  avatar          text NOT NULL     // emoji 字面量 or URL
  description     text NOT NULL
  capabilities    text JSON         // string[]
  system_prompt   text NOT NULL
  adapter_name    text NOT NULL     // 'claude-code'|'codex'|'custom'|'mock'
  model_provider  text              // 仅 adapter_name='custom' 时填
  model_id        text              // 同上
  api_key         text              // 该 agent 单独的 key；NULL 走 env
  api_base_url    text              // 该 agent 单独的 endpoint；NULL 走 SDK 默认
  tool_names      text JSON         // string[]，引用 Spec 07
  mcp_server_ids  text JSON         // string[]，引用 mcp_servers.id，默认 []
  skill_ids       text JSON         // string[]，引用 skills.id，默认 []
  is_builtin      int  bool default 0
  is_orchestrator int  bool default 0
  supports_vision int  bool default 0
  created_at      int  NOT NULL
}
```

**约束**：
- `adapter_name='custom'` 时 `model_provider` + `model_id` 必填；`adapter_name='claude-code' | 'codex'` 时 `model_provider=NULL`，`model_id` 可选
- `is_builtin=1` 的 agent 可修改、不可删除（service 层 enforce）
- `api_key` 优先级高于 env var；按 provider / adapter 路由：`deepseek→DEEPSEEK_API_KEY` / `openai→OPENAI_API_KEY` / `volcano-ark→ARK_API_KEY` / `anthropic→ANTHROPIC_API_KEY` / `codex→CODEX_API_KEY 或 OPENAI_API_KEY` / `openai-compatible→per-agent only`
- `api_base_url` 非空时（Claude Code adapter），`api_key` 作为 `ANTHROPIC_AUTH_TOKEN` 传 SDK；`ANTHROPIC_BASE_URL` 设为 `api_base_url`；同时清空 `ANTHROPIC_API_KEY` 防覆盖（详见 Spec 05 ClaudeCodeAdapter）
- `api_base_url` 非空时（Codex adapter），作为 `@openai/codex-sdk` 的 `baseUrl` 传入；`api_key` 作为 SDK `apiKey`（内部 `CODEX_API_KEY`）传入；endpoint 必须支持 Codex/Responses，DeepSeek 等 Chat Completions-only endpoint 走 Custom adapter
- `model_provider='openai-compatible'` 时（Custom adapter），`api_key` 与 `api_base_url` 必填；`api_base_url` 作为 OpenAI SDK `baseURL` 传入，endpoint 必须支持 Chat Completions

**索引**：无（agent 数量小，全表扫描可接受）

---

## 2. conversations

```ts
conversations {
  id                       text PK           // conv_<nanoid>
  title                    text NOT NULL
  mode                     text NOT NULL     // 'single'|'group'
  agent_ids                text JSON         // string[]
  pinned_message_ids       text JSON         // string[]，default '[]'
  archived                 int  bool default 0
  fs_write_approval_mode   text NOT NULL default 'review'  // 'auto'|'review'，agent fs_write 审批策略
  created_at               int  NOT NULL
  updated_at               int  NOT NULL
}
INDEX idx_conv_updated ON (updated_at)
```

**约束**：
- `mode='single'` 时 `agent_ids.length === 1`，`group` 时 `>= 2`
- 群聊里 `is_orchestrator=1` 的 agent 最多 1 个（service 层 enforce）
- `fs_write_approval_mode`：详见 Spec 07「fs_write 审批模式」。人手编辑文件不走审批，只控制 agent
- `pinned_message_ids` 上限 5（`PIN_LIMIT_PER_CONVERSATION`，service 层 enforce）；toggle 时**不**更新 `updated_at`（pin 不算「会话活跃」）。UI 入口见 Spec 09

**索引说明**：`idx_conv_updated` 用于侧边栏「按最近活跃排序」列表。

---

## 3. messages

```ts
messages {
  id                  text PK           // msg_<nanoid> / msg_err_<nanoid>
  conversation_id     text NOT NULL  FK→conversations.id  ON DELETE CASCADE
  role                text NOT NULL     // 'user'|'agent'|'system'
  agent_id            text  FK→agents.id  (no cascade)
  parts               text JSON         // MessagePart[]，见 Spec 03
  status              text NOT NULL     // 'streaming'|'complete'|'error'|'aborted'
  parent_message_id   text              // 引用回复目标（同会话内自由引用，不建外键以容忍删除）
  mentioned_agent_ids text JSON         // string[]，default '[]'
  run_id              text              // 关联 agent_runs.id（不建外键，agent run 删除不影响消息保留）
  created_at          int  NOT NULL
}
INDEX idx_messages_conv_created ON (conversation_id, created_at)
```

**约束**：
- `role='agent'` 时 `agent_id` 必填
- `parts` 是数组，类型见 Spec 03（每种 part 的字段）

**特殊 ID 命名**：错误降级消息 ID 用 `msg_err_<nanoid>` 前缀（由 `AgentRunner.emitErrorVisualisation` 生成），便于日志区分。

**索引说明**：`idx_messages_conv_created` 是 hot path —— `MessageList` 拉取一个会话的全部消息按时间排。

---

## 4. artifacts

```ts
artifacts {
  id                  text PK           // art_<nanoid>
  conversation_id     text NOT NULL  FK→conversations.id  ON DELETE CASCADE
  type                text NOT NULL     // 'web_app'|'code_file'|'diff'|'document'|'image'|'ppt'|'project'
  title               text NOT NULL
  content             text JSON NOT NULL // ArtifactContent，见 Spec 04
  version             int  NOT NULL default 1
  parent_artifact_id  text              // 版本链（v2 引用 v1），不建外键
  created_by_agent_id text NOT NULL FK→agents.id
  created_at          int  NOT NULL
}
INDEX idx_artifacts_conv ON (conversation_id)
```

**索引说明**：`ArtifactLibrary` 列表 + 单会话 artifact 卡片渲染都走这个索引。

---

## 5. workspaces

```ts
workspaces {
  id              text PK              // ws_<nanoid>
  conversation_id text NOT NULL UNIQUE FK→conversations.id  ON DELETE CASCADE
  root_path       text NOT NULL        // 绝对路径，物理位于 .agenthub-data/workspaces/<conversationId>/
  mode            text NOT NULL default 'sandbox'  // 'sandbox' | 'local'
  bound_path      text                 // mode='local' 时填，绝对路径；sandbox 时为 null
  created_at      int  NOT NULL
}
```

**1:1 与 conversations**：`UNIQUE(conversation_id)` 保证。

**mode 语义**（详见 Spec 01 + Spec 07）：
- `sandbox`：bash / fs_read / fs_write 的 cwd 用 `root_path`（隔离目录），强制 100MB / 1000 文件配额
- `local`：cwd 用 `bound_path`（用户本机真实目录），不强制配额

**物理目录**：DB 行删除时 cascade 由 SQLite 处理；`root_path` 目录由 `conversation-service.deleteConversation` 手动 `rmSync(...)` 清除（容错：失败仅 warn）。`bound_path` 不删（那是用户的真实项目）。

---

## 6. attachments

```ts
attachments {
  id              text PK              // att_<nanoid>
  conversation_id text NOT NULL FK→conversations.id  ON DELETE CASCADE
  kind            text NOT NULL        // 'image'|'file'
  file_name       text NOT NULL
  file_path       text NOT NULL        // 相对 workspace.root_path，例如 'attachments/<id>-<filename>'
  size            int  NOT NULL
  mime_type       text NOT NULL
  created_at      int  NOT NULL
}
INDEX idx_attachments_conv ON (conversation_id)
```

**约束**：
- `file_path` 始终在 `workspace.rootPath` 子树内（防越权，由上传 handler enforce）
- 单会话上限：100MB / 1000 文件（详见 CLAUDE.md §5.3）

**与 Message 的关系**：发消息时把附件 ID 传给 `sendMessage`，service 把每个附件转成对应的 `image_attachment` / `file_attachment` MessagePart 塞到 message.parts 里（见 Spec 03）。附件本身不删除，可被多条消息引用。

---

## 7. agent_runs

```ts
agent_runs {
  id                  text PK           // run_<nanoid>
  conversation_id     text NOT NULL FK→conversations.id  ON DELETE CASCADE
  agent_id            text NOT NULL FK→agents.id
  trigger_message_id  text              // 可空：错误降级 run 没有触发消息
  status              text NOT NULL     // 'queued'|'running'|'complete'|'failed'|'aborted'
  error               text              // failed 时存错误概要
  parent_run_id       text              // Orchestrator 派出的子 run 指向父 run
  usage               text JSON         // RunUsage：{ inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, lastInputTokens?, model? }；null = 该 run 未上报（mock / 中途失败）
  started_at          int  NOT NULL
  finished_at         int               // null = 仍在 running
}
INDEX idx_runs_parent ON (parent_run_id)
```

**索引说明**：`idx_runs_parent` 用于 DispatchPlanCard 聚合子 run 状态（按 parent_run_id 拿子 run 列表）。

**生命周期**：`queued → running → (complete|failed|aborted)`，单向流转，service 层 enforce 不允许回退。

---

## 8. agent_run_debug_snapshots

```ts
agent_run_debug_snapshots {
  id              text PK           // rdbg_<nanoid>
  run_id          text NOT NULL FK→agent_runs.id ON DELETE CASCADE
  conversation_id text NOT NULL FK→conversations.id ON DELETE CASCADE
  agent_id        text NOT NULL FK→agents.id
  snapshot        text JSON NOT NULL // AgentRunDebugSnapshot，见 Spec 17
  created_at      int NOT NULL
}
UNIQUE INDEX idx_run_debug_run ON (run_id)
INDEX idx_run_debug_conv_created ON (conversation_id, created_at)
```

**约束**：
- 只保存运行时 metadata / 统计，不保存 API key、auth token、MCP resolved env value、完整 prompt 文本或附件内容。
- `run_id` 按 run 唯一；服务层写入时发现已有 snapshot 直接返回已有行。
- 删除 conversation 或 agent_run 时级联删除 debug snapshot。

**索引说明**：`idx_run_debug_run` 用于 run detail 查询；`idx_run_debug_conv_created` 用于会话调试面板列表辅助查询。

---

## 9. automations

```ts
automations {
  id              text PK           // auto_<nanoid> 或内置 seed id
  title           text NOT NULL
  description     text NOT NULL
  category        text NOT NULL
  cadence         text NOT NULL     // 展示用触发规则文案，由 schedule 字段派生
  status          text NOT NULL     // 'enabled'|'running'|'draft'|'paused'
  icon_key        text NOT NULL     // 'newspaper'|'languages'|'calendar_clock'|'video'|'history'
  prompt          text NOT NULL default ''
  agent_id        text FK→agents.id
  conversation_id text FK→conversations.id ON DELETE SET NULL
  workspace_id    text FK→workspaces.id ON DELETE SET NULL
  schedule_type   text NOT NULL default 'manual' // 'manual'|'interval'|'daily'|'weekly'
  schedule_config text              // JSON，由应用层 zod 按 schedule_type 校验
  next_run_at     int               // enabled 且 due 时由 scheduler 扫描
  latest_run_at   int               // 最近一次运行完成时间；null = 尚未运行
  last_error      text              // 最近一次失败概要
  created_at      int NOT NULL
  updated_at      int NOT NULL
}
INDEX idx_automations_status ON (status)
INDEX idx_automations_next_run ON (status, next_run_at)
INDEX idx_automations_updated ON (updated_at)
```

**语义**：自动化任务定义。`cadence` 只用于 UI 展示；调度以 `schedule_type`、`schedule_config`、`next_run_at` 为准。`agent_id` / `conversation_id` 允许为空；保存或运行时由 `AutomationService` 自动选择默认 Agent、创建同名会话并回写绑定。

**约束**：
- `status='draft'` 表示待配置，不进入自动触发。
- `status='paused'` 表示暂停，不进入自动触发。
- `status='enabled'` 且 `next_run_at <= now` 才会被本地 scheduler 扫描。
- `status='running'` 仅兼容早期看板语义；新执行状态以 `automation_runs.status` 为准。

---

## 9. automation_runs

```ts
automation_runs {
  id              text PK           // arun_<nanoid> 或内置 seed id
  automation_id   text NOT NULL FK→automations.id ON DELETE CASCADE
  status          text NOT NULL     // 'success'|'failed'|'running'
  trigger         text NOT NULL default 'manual' // 'manual'|'schedule'
  agent_run_id    text FK→agent_runs.id ON DELETE SET NULL
  conversation_id text FK→conversations.id ON DELETE SET NULL
  attempt         int NOT NULL default 1
  duration_ms     int               // running 时可为当前耗时或 null
  started_at      int NOT NULL
  finished_at     int               // null = 仍在 running
  error           text              // failed 时存错误概要
  created_at      int NOT NULL
  updated_at      int NOT NULL
}
INDEX idx_automation_runs_automation_started ON (automation_id, started_at)
INDEX idx_automation_runs_started ON (started_at)
INDEX idx_automation_runs_status ON (status)
```

**语义**：自动化任务运行记录。它记录自动化层面的运行状态，并可关联由 Conversation/AgentRunner 创建的 `agent_runs`。

**生命周期**：`running → success | failed`。同一 automation 同时只允许一个 `running` run。

---

## 10. automation_run_logs

```ts
automation_run_logs {
  id          text PK           // alog_<nanoid>
  run_id      text NOT NULL FK→automation_runs.id ON DELETE CASCADE
  level       text NOT NULL     // 'info'|'warn'|'error'
  message     text NOT NULL
  metadata    text              // JSON 文本，存触发来源、messageId、runIds、错误摘要等
  created_at  int NOT NULL
}
INDEX idx_automation_run_logs_run_created ON (run_id, created_at)
```

**语义**：自动化运行日志，用于前端运行历史详情和异常排查。日志随 run 级联删除。

---

## 11. conversation_context_summaries

```ts
conversation_context_summaries {
  id                       text PK           // ctx_<nanoid>
  conversation_id          text NOT NULL FK→conversations.id ON DELETE CASCADE
  summary                  text NOT NULL     // 压缩后的长期上下文摘要
  covered_until_message_id text NOT NULL     // 摘要覆盖到的最后一条 message
  covered_until_created_at int  NOT NULL     // 对应 message.created_at，查询候选消息时用
  source_message_count     int  NOT NULL     // 本次参与压缩的 message 数
  token_estimate           int  NOT NULL     // summary 粗略 token 估算
  model_provider           text              // 生成摘要的 provider；启发式 fallback 时为 NULL
  model_id                 text              // 生成摘要的模型；启发式 fallback 时为 NULL
  created_at               int  NOT NULL
}
INDEX idx_context_summaries_conv_created ON (conversation_id, created_at)
```

**语义**：该表是上下文基础设施，不是聊天记录。用户聊天原文仍完整保留在 `messages` 表；summary 只在 LLM 上下文注入时消费。多次 compact 时保留历史 summary 行，读取时默认只取同一 conversation 最新一条。

**覆盖范围**：`covered_until_created_at` 之前且非 pinned 的普通历史可由 summary 代表；pinned messages 仍按 Spec 13 永远注入原文占位版本。

**为什么不放进 messages**：summary 不是用户/agent 发言，混进聊天消息会污染会话时间线、撤回/编辑语义和未读逻辑。UI 需要反馈时由 service 额外写一条 `role='system'` 的提示消息，但真实可消费摘要仍以本表为准。

---

## 12. mcp_servers

```ts
mcp_servers {
  id                  text PK              // mcp_<nanoid>
  name                text UNIQUE NOT NULL // [a-z0-9_]+，禁止 agenthub
  transport           text NOT NULL default 'stdio'
  command             text NOT NULL        // stdio server command，不拼 shell 字符串
  args                text JSON default []  // string[]
  env                 text JSON default {}  // Record<string,string>，列表 API 脱敏
  trust               text NOT NULL default 'ask' // 'ask'|'always'
  enabled             int bool default 1
  last_checked_at     int                  // 最近一次测试连接时间
  last_check_status   text                 // 'ok'|'failed'
  last_check_message  text                 // 最近一次测试摘要，不含 secret
  last_tool_count     int                  // 最近一次 listTools 工具数量
  created_at          int NOT NULL
  updated_at          int NOT NULL
}
INDEX idx_mcp_servers_enabled ON (enabled)
```

**约束**：
- 首版只支持 `transport='stdio'`，SSE / HTTP / OAuth 延后。
- `name='agenthub'` 保留给内部 AgentHub MCP server，外部配置不可覆盖。
- 外部 MCP server 不进入 `toolRegistry`；Agent 通过 `agents.mcp_server_ids` 显式 opt-in。
- 从 GitHub 搜索结果导入 MCP 时，服务端必须先拉取并校验 manifest，再创建或更新本地 `mcp_servers` row；导入过程不得执行或自动测试远程 command。
- `env` 可使用 `${ENV_NAME}` 占位，运行时只解析被引用的环境变量；列表、搜索、debug 与测试接口不返回明文 secret。
- 健康字段只保存连接测试摘要；不持久化工具 schema、工具调用参数、工具输出或 resolved env。

---

## 13. skills

```ts
skills {
  id           text PK              // skill_<nanoid> 或稳定本地 id
  name         text UNIQUE NOT NULL
  description  text NOT NULL
  source_path  text NOT NULL        // 本地路径，或 GitHub 导入来源标识 github://...
  tags         text JSON default []  // string[]
  enabled      int bool default 1
  created_at   int NOT NULL
  updated_at   int NOT NULL
}
INDEX idx_skills_enabled ON (enabled)
```

**语义**：Skills 是本地可发现或从 GitHub 导入的能力模板/指导说明。Agent 通过 `agents.skill_ids` 显式 opt-in；运行时由 AgentRunner 将已启用 Skills 作为独立 prompt section 注入，不作为可执行代码，不绕过工具协议。

**约束**：
- 本地 Skills 由项目 `skills/` 目录扫描；远程 Skills 只能通过 GitHub 搜索结果导入。
- `source_path` 对本地 Skill 必须位于允许的 skills 目录或经过服务层校验的本地路径；对 GitHub Skill 可保存 `github://...` 来源标识或 GitHub URL。
- 本地扫描不得读取 `.env.local`、密钥文件或 workspace 外敏感目录；GitHub 导入只允许 HTTPS GitHub hosts。
- 列表与搜索接口只返回 metadata，不返回 secret 文件内容或 GitHub token。
- 删除或禁用 Skill 后，AgentRunner 不再注入该 Skill；已有 `agents.skill_ids` 中的无效 id 在运行时忽略。

---

## 14. workspace_memories

```ts
workspace_memories {
  id                  text PK           // mem_<nanoid>
  conversation_id     text NOT NULL FK→conversations.id ON DELETE CASCADE
  title               text NOT NULL
  content             text NOT NULL
  source              text NOT NULL default 'user' // 'user'|'agent'|'system'
  created_by_agent_id text FK→agents.id
  pinned              int bool NOT NULL default 0
  created_at          int NOT NULL
  updated_at          int NOT NULL
}
INDEX idx_workspace_memories_conv_updated ON (conversation_id, updated_at)
INDEX idx_workspace_memories_conv_pinned ON (conversation_id, pinned, updated_at)
```

**语义**：Workspace Memory 是当前 conversation/workspace 的长期项目备注，供后续普通 Agent run 作为有界 `<workspace_memory>` system prompt 块注入。它不是聊天记录，不进入 `messages`，也不参与 conversation compaction。

**约束**：
- 随 conversation 删除级联删除；不跨 conversation 共享，不做全局用户记忆。
- Phase 7 只允许 UI/API 创建 `source='user'` 的 memory；`agent` / `system` 预留。
- `title` 最长 80 字符，`content` 最长 4000 字符，单 conversation 最多 50 条（service 层 enforce）。
- Prompt 注入由 `workspace-memory-service.buildWorkspaceMemoryBlock` 有界构建：pinned 优先，其次 `updated_at DESC`，最多 12 条，约 2000 token 预算。
- Memory 修改后清理 Claude Code / Codex session，避免旧 SDK session 继续使用过期 system prompt。

**索引说明**：`idx_workspace_memories_conv_updated` 用于列表按更新时间展示；`idx_workspace_memories_conv_pinned` 用于 prompt 注入时 pinned 优先排序。

---

## 15. app_settings

```ts
app_settings {
  id                  text PK             // 固定 'singleton'，单行表
  anthropic_api_key   text                // Anthropic / Claude Code 用
  anthropic_base_url  text                // 第三方网关（anyrouter 等）；非空时 anthropic_api_key 作 AUTH_TOKEN
  openai_api_key      text                // OpenAI provider
  deepseek_api_key    text                // DeepSeek provider
  ark_api_key         text                // 火山方舟 provider
  companion_mode      text NOT NULL       // 'off' | 'lan' | 'tailnet'，默认 'off'
  mobile_device_token text                // 移动端 P0 设备 token；后续替换为 device_sessions
  deployment_publish_enabled int NOT NULL // boolean，默认 false
  deployment_publish_dir     text         // 外部静态发布目录，绝对路径
  deployment_public_base_url text         // 外部静态服务公开根 URL
  updated_at          int  NOT NULL
}
```

**为什么单行表**：本地单用户场景，全局只有一份 API 配置。建表是为了让用户走 UI 改而不是编辑 `.env.local`；用 KV 表会让每个 key 一行查询，反而麻烦。`id='singleton'` 是约定常量（`src/server/settings-service.ts:SINGLETON_ID`），insert / upsert 都走它。

**约束**：
- 所有字段可空。空 / 空串归一为 `NULL`（`settings-service.normalize` 处理）
- 与 `agents.api_key` / `agents.api_base_url` 不冲突：per-agent 字段优先级最高，本表是「全局兜底」
- **不**外键关联 agents（provider 与 agent 是多对多关系，agent 通过 `model_provider` / `adapter_name` 选 key）
- `deployment_publish_enabled=true` 只有在 `deployment_publish_dir` 与 `deployment_public_base_url` 均非空时才会让 `deploy_artifact` / `deploy_workspace` 尝试外部静态发布；否则仍只生成本地静态部署。

**Key 解析优先级**（详见 Spec 05「API key fallback」与 `agent-runner.ts:buildAdapterInput`）：

```
1. agents.api_key           — per-agent override（最高）
2. app_settings.<provider>  — 用户在设置面板自填
3. process.env.<PROVIDER>   — .env.local 兜底
4. ~/.claude/.credentials.json — 仅 Claude Code adapter 的 OAuth fallback；Codex adapter 默认使用 AgentHub 隔离的 `<dataDir>/codex-home`，不读取用户本机 `~/.codex`
```

`anthropic_base_url` 的解析同链：`agents.api_base_url` → `app_settings.anthropic_base_url` → `process.env.ANTHROPIC_BASE_URL` → SDK 默认。Codex 不读全局 base URL，只接受 per-agent `agents.api_base_url` 或 SDK 默认 endpoint，避免 CC Switch / 本机 `~/.codex` 配置影响 AgentHub。Custom `openai-compatible` 也不读全局 base URL，必须由 agent 自己携带 `api_base_url`。

**索引**：无（单行查询不需要）。

**桌面版（Electron）兼容**：本表是「全局 key」的唯一持久化点，**不**引入 keychain / safeStorage 等第三方存储，详见 CLAUDE.md §5.4 与 Spec 11。Electron 下 DB 文件位置改为 `app.getPath('userData')`，本表语义不变。

---

## Cascade 关系图

```
conversations  ─── CASCADE ──┬─► messages
                             ├─► artifacts
                             ├─► workspaces  (1:1)
                             ├─► attachments
                             ├─► agent_runs
                             ├─► conversation_context_summaries
                             └─► workspace_memories

automations ─── CASCADE ───────► automation_runs

agents ──(no cascade)──── messages.agent_id
                          artifacts.created_by_agent_id
                          agent_runs.agent_id

app_settings ──(独立，无外键)── 单行表，与任何业务表都无 FK 关系
```

**为什么 agents 不 cascade**：删除 agent 不应抹掉历史消息/产物（用户期望「已停用 agent」的灰态保留记录）。前端展示时检测 `agentId` 找不到 → 渲染 stub。

---

## JSON 列规范

所有 `text JSON` 列存的是 **trusted internal data**，由服务端写入，前端读出。不存任意用户输入；用户输入（message content / agent description）走单独的 text 列。

| 列 | 类型 | 说明 |
|---|---|---|
| `agents.capabilities` | `string[]` | 能力标签 |
| `agents.tool_names` | `string[]` | 引用 Spec 07 的工具名 |
| `conversations.agent_ids` | `string[]` | 参与的 agent |
| `conversations.pinned_message_ids` | `string[]` | 用户 pin 的消息 |
| `messages.parts` | `MessagePart[]` | 见 Spec 03 |
| `messages.mentioned_agent_ids` | `string[]` | @ 的 agent |
| `artifacts.content` | `ArtifactContent` | 见 Spec 04，按 type 分发的可辨联合 |
| `workspace_memories` | 无 JSON 列 | Memory title/content 是普通 text，由 service 校验长度与转义 |

**修改 JSON 列结构时**：旧数据按旧 schema 解析仍合法（向后兼容），否则需要写 migration 脚本（见下节）。

---

## 迁移规范

**开发期**：直接 `pnpm db:push` 让 drizzle-kit 推 schema 到 SQLite。**注意**：drizzle-kit 对带 FK 的列类型变更有时会失败（SQLite 限制），此时写一次性 ALTER TABLE 脚本，命名格式 `src/db/migrate-<topic>.ts`（如 `migrate-add-read-attachment.ts`），用 `tsx src/db/migrate-xxx.ts` 跑。这些脚本跑完不删除（留作历史 + 用 `IF NOT EXISTS` 可重入）。

**生产期**：暂无（项目为本地运行）。如未来要 ship 给用户，应改用 drizzle-kit 的 generate + journal 模式。

---

## ID 前缀对照表

| 实体 | 前缀 | 例 |
|---|---|---|
| Agent | `ag_` | `ag_uQp4Vs8z` |
| Conversation | `conv_` | `conv_KbN6xq2L` |
| Message | `msg_` / `msg_err_` | `msg_xY3w...` |
| Artifact | `art_` | `art_OPbgvF9x` |
| Workspace | `ws_` | `ws_h7Ld...` |
| Attachment | `att_` | `att_qWeR...` |
| AgentRun | `run_` | `run_xT9m...` |
| ContextSummary | `ctx_` | `ctx_mN4p...` |
| WorkspaceMemory | `mem_` | `mem_s7Kp...` |
| AgentRunDebugSnapshot | `rdbg_` | `rdbg_aB3c...` |
| Automation | `auto_` | `auto_xY8k...` |
| AutomationRun | `arun_` | `arun_pQ2s...` |
| ToolCall (内存中) | `call_` | `call_aBc...` |
| AppSettings | `'singleton'` | 不用 nanoid，固定字面量 |

ID 生成器统一在 `src/server/ids.ts`，nanoid 长度 12，URL-safe alphabet。`app_settings.id` 不走 nanoid，由 `settings-service.SINGLETON_ID` 直接写入。
