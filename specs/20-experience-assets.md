# Spec 20 — 经验资产（Experience Assets）

> 把「跑完的任务」变成可复用的资产：run 收尾后自动反思并沉淀做法 / 画像，后续 run 按需检索注入，让多 Agent 协作「越跑越懂你」。
>
> **状态：设计提案（未实现）。** 设计思路参考 EvoFlow「资产中心」（画像 / 记忆 / 经验 / 反思 / 统计 / 导出）的产品化做法；EvoFlow 为 PolyForm 非商业许可（源码可见、非 OSI 开源），本 spec **只借鉴设计、不拷贝代码**。所有落点对齐 Multi-Agent TeamFlow 现有五层架构与既有机制（workspace_memories / context_summaries / skills / agent_run_debug_*），避免重复造轮子。

源文件（待建）：`src/server/experience-service.ts` · 改动 `src/server/agent-runner.ts` · `src/db/schema.ts` · `src/server/search-service.ts`（FTS 参照）

---

## 1. 现状与动机

| Adapter | 跨 run 上下文 | 长期记忆 | 可复用做法沉淀 |
|---|---|---|---|
| `custom` | ✅ `buildHistoryFor`（Spec 13） | ✅ workspace_memories / summary | ❌ |
| `claude-code` | ✅ SDK session resume | ✅ 同左（system prompt 注入） | ❌ |
| `codex` | ✅ SDK thread resume | ✅ 同左 | ❌ |

**现状缺口**：项目已有「对话记忆」（summary + pinned，Spec 13）和「项目备注」（workspace_memories，Spec 16），但**没有「学习层」**——每次 run 的成败经验、可复用做法、agent 的画像都随 run 结束而消失。Orchestrator 每次规划都从零开始，同样的坑会反复踩。

**动机**：
1. run 收尾后自动反思，把「这次怎么做的、踩了什么坑」沉淀为结构化经验；
2. 后续 run 按任务关键词检索相关经验并注入 system prompt，规划 / 执行直接受益；
3. 经验可校对（编辑 / 停用 / 删除）、可统计（常用 / 冷资产），用户始终掌控。

---

## 2. 目标 / 非目标

**目标**
- run 收尾后自动反思（有门槛、有开关），沉淀为经验；用户也可手动沉淀。
- 后续普通 run 的 system prompt 注入**有界 `<relevant_experiences>`**（按任务关键词检索命中）。
- 经验**跨会话保留**、按 agent 归属（agent 视角隔离），可校对与停用。
- 复用项目既有 FTS5 基础设施（`messages_fts` + `bm25`），**不引入 embedding / vector DB**。

**非目标（首版）**
- 不做语义向量检索 / RAG（对齐 Spec 16「不做 RAG」取向；语义检索作为 P2 可选）。
- 不做自动跨会话记忆（那是 summary 的活，Spec 13 已定义）。
- 不新增 Agent 可调用的 `remember_*` / `reflect_*` 工具——沉淀由服务层与 UI 触发，不占用 agent 工具面。
- 不把经验写入 workspace 文件（不占沙箱配额、不污染 boundPath）。
- 不新增 StreamEvent（提取发生在 run 收尾后，异步落库；UI 靠资产 Tab refetch，见 §9）。
- 不把经验放进 `buildHistoryFor` / `PromptContextSnapshot`（同 Workspace Memory 边界，Spec 13 §Workspace Memory 边界 / Spec 16 §4）。

---

## 3. 与既有机制的边界

| 机制 | 范围 | 谁写 | 注入方式 | 与经验资产的分工 |
|---|---|---|---|---|
| `conversation_context_summaries`（Spec 13） | 单会话 | 压缩服务 | summary 进 history | 「发生过什么」→ 压缩摘要 |
| `workspace_memories`（Spec 16） | 单会话 | 用户（v1） | `<workspace_memory>` 每次注入 | 「用户维护的项目备注」 |
| `skills`（Spec 18） | 全局/Agent | 用户导入 | `<skills>` 每次注入 | 「用户挑选的规则包」 |
| `agent_run_debug_*`（Spec 17/19） | 单 run | 调试服务 | 不注入 | 反思的**原料来源**之一 |
| `experiences`（本 spec） | **跨会话**、per-agent | 服务层自动 + 用户手动 | 按任务关键词**检索命中**才注入 | 「从 run 里提炼的可复用做法 / 反思 / 画像」 |

**关键差异（vs workspace_memories）**：
- 范围：memory 随 conversation 级联删除；经验**不随会话删除**（`conversation_id` 置 NULL），因为经验的价值在于跨会话复用。
- 写入方：memory 以用户维护为主；经验以**自动提取**为主、用户校对为辅。
- 注入：memory 每次全量注入（有界）；经验**按关键词检索命中**才注入（数量更少、相关性更高，省 token）。

---

## 4. 数据模型

```ts
experiences {
  id              text PK           // exp_<nanoid>
  kind            text NOT NULL     // 'experience' | 'reflection' | 'profile_fact'
  agent_id        text FK→agents.id // 归属 agent（agent 视角隔离）；scope='global' 时 NULL
  scope           text NOT NULL default 'agent' // 'agent' | 'global'（全局经验）
  conversation_id text FK→conversations.id ON DELETE SET NULL  // 来源会话；删除会话后经验保留
  run_id          text              // 来源 run（不建外键，同 messages.run_id 模式）
  title           text NOT NULL
  trigger         text NOT NULL     // 「何时适用」一句话，检索与注入筛选的主字段
  content         text NOT NULL     // markdown 正文
  tags            text JSON default []  // string[]
  source          text NOT NULL default 'auto' // 'auto' | 'manual'
  active          int bool NOT NULL default 1
  usage_count     int NOT NULL default 0
  last_used_at    int
  created_at      int NOT NULL
  updated_at      int NOT NULL
}
INDEX idx_experiences_agent_active ON (agent_id, active, updated_at)
INDEX idx_experiences_conv ON (conversation_id)
```

**FTS5**：镜像 `messages_fts` 的既有做法（`src/server/search-service.ts` 的 `messages_fts` + `bm25` + `snippet` + `maybeQuote` 引用写法），新建 `experiences_fts`（external content 指向本表，触发器维护），索引 `title` / `trigger` / `tags` / `content`。建表与触发器走一次性迁移脚本 `src/db/migrate-add-experiences.ts`（参照 `messages-fts-triggers` 的既有建表方式；新表 + FTS 用 `pnpm db:push` + 脚本组合，规范见 Spec 08「迁移规范」）。

**约束**（`experience-service` 执行）：
- `trigger.trim()` 必填，最长 200 字符；`content.trim()` 必填，最长 8000 字符；`tags` 最多 10 个、单 tag ≤ 32 字符。
- 单 agent 最多 200 条 `active=1` 经验（超出时新沉淀进入 `active=0` 草稿并提示校对，防无限膨胀）。
- 删除 conversation → 经验保留（`conversation_id` 置 NULL）；删除 agent → 经验保留（同 `messages.agent_id` 无级联模式，前端渲染「已停用 Agent」灰态）。
- `conversation_id` 有值且会话被删时，仍可通过 `run_id` / 文本检索，不作为隔离边界。

**`agents` 增列**：`experience_ids: json string[]`（默认 `[]`）——Phase 2「导出应用到其他 Agent」时回写（v1 不建列，避免一次无必要的 migration）。

---

## 5. 沉淀（提取）时机

### 5.1 自动 post-run 反思（P0）

钩子：`agent-runner.ts:finalizeOk`（约 `:2262`，`finalize` 在 `:1980` 统一收尾）。run 置 `complete` 后**异步**调用 `experience-service.extractFromRun(runId, args)`，不阻塞返回、失败仅 warn（对齐 `buildWorkspaceMemoryBlock` 的容错哲学，`agent-runner.ts:2547`）。

**触发门槛**（控制 token 成本，全部满足才跑）：
- `status === 'complete'`；
- 且满足任一：tool 调用数 ≥ 3 / 本次 run 产出 artifact / 是 Orchestrator 聚合 run（`parentRunId` 有子 run）；
- 且 `app_settings.experience_extraction_enabled !== false`（默认开，设置面板可关）。

**提取输入（bounded）**：只喂「公开折叠层」——
- run 的公开文本（同 Spec 13 折叠规则：丢 thinking / tool_use / tool_result）；
- artifact 的 `title` + `type`（不内联全文）；
- tool 名序列（如 `[plan_tasks, fs_write, bash]`）；
- run 级 usage / 状态。

预算上限约 4000 token 输入；输出为结构化 JSON（候选 0..3 条 `{ kind, title, trigger, content, tags }`）。**LLM 输出是不可信输入**：zod 校验 + 长度钳制（title ≤ 80、trigger ≤ 200、content ≤ 8000），不合规整条丢弃。

**查重 / 合并**：落库前对候选做 trigger/title 归一化（小写 + 去空白 + 前缀匹配），命中已有 `active=1` 条目则跳过或更新 `content`（追加一行来源 run），不无限堆重复条目。

**模型**：默认复用该 agent 的 `modelProvider` / `modelId`；可配 `app_settings.experience_extraction_model` 覆盖（默认空 = 跟随 agent）。

### 5.2 手动沉淀（P1）

- 消息操作菜单新增「沉淀为经验」（复用现有消息操作 UI 位，如 pin / 收藏位）：取该消息及其所在 run 的公开文本作为提取输入，产出候选后弹资产编辑框让用户校对再落库（`source='manual'`）。
- 斜杠命令 `/learn`（复用现有斜杠命令浮层）：对最近一条 agent 消息执行同一流程。

### 5.3 会话归档批量提取（P2，可选）

归档前扫描该会话全部 complete run，批量提取一次（开关默认关）。

---

## 6. 检索与注入

### 6.1 `buildExperienceBlock`

```ts
async function buildExperienceBlock(
  agentId: string,
  taskText: string,        // 当前触发消息文本 + 会话标题
  options?: { tokenBudget?: number; maxItems?: number },
): Promise<{ block: string | null; injectedIds: string[] }>
```

流程：
1. 关键词 = `taskText` 分词（中英文空白 + 标点切分，去停用词），拼 FTS5 query（复用 `search-service.ts` 的 `maybeQuote` 引用规则，`:42`）。
2. `experiences_fts MATCH ?` + `JOIN experiences`，过滤 `active=1` 且 `(agent_id = ? OR scope='global')`，`ORDER BY bm25(experiences_fts)`，`LIMIT 6`。
3. 无命中返回 `null`（**不输出空块**，对齐 workspace memory 约定）。
4. 命中项按 token 预算裁剪（默认 ≤ 1500 token），超预算从尾部丢弃。
5. 异步批量 `usage_count + 1`、`last_used_at = now`（fire-and-forget，失败忽略）。
6. 返回 `block`（XML escape 后的 `<experience>` 条目）+ `injectedIds`（供 debug / 引用标签用）。

### 6.2 注入位置与预算

`agent-runner.ts:buildAdapterInput`（约 `:2530`）在 `createPromptSection('workspace_memory', memoryBlock)`（约 `:2554`）之后、skills 之前插入：

```ts
const expBlock = await buildExperienceBlock(agent.id, taskText).catch((err) => {
  console.warn('[agent-runner] buildExperienceBlock failed; continuing without experiences', err)
  return { block: null, injectedIds: [] }
})
if (expBlock.block) {
  systemPromptSections.push(createPromptSection('relevant_experiences', expBlock.block))
}
```

- 顺序：`<workspace_info>` → `<workspace_memory>` → `<relevant_experiences>` → `<skills>` → `agent.systemPrompt` → 群聊说明。经验是「怎么做」的参考，放在技能前、角色描述前。
- 预算：经验块计入现有 `promptEstimate`（`estimateTokens` 之后），超预算时从命中列表尾部裁剪（§6.1 第 4 步）。
- **注入范围**：只对普通 run 注入；`overridePrompt` / `overrideSystemPrompt` 子任务默认**不注入**（保持 Spec 06 子任务隔离，对齐 workspace memory / skills 的同一约定，`agent-runner.ts:2557`）。
- Orchestrator 的 planning run 是普通 run 路径 → 自动获得相关经验；`plan_tasks` 生成子任务描述时携带经验标题作为 hints 属于 P2。

### 6.3 SDK adapter（claude-code / codex）

不消费 `AdapterInput.history`，但 system prompt 由 `buildAdapterInput` 统一拼装（workspace memory / skills 已走此路径，`agent-runner.ts:2547/2573`）→ 经验块**同路径生效**，无需 adapter 特判。注入的经验在 SDK session resume 后不会自动过期（与新 session 同生命周期），与 memory 修改后清 session 的约定一致。

---

## 7. API

镜像 workspace-memory 的 REST 风格（Spec 16 §5）：

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/experiences?agentId=&kind=&q=&active=` | 列表 / 检索（FTS 命中 + 元信息，含 usage_count / last_used_at） |
| `POST` | `/api/experiences` | 手动创建（zod 校验；`source='manual'`） |
| `PATCH` | `/api/experiences/:id` | 编辑 `title / trigger / content / tags / active` |
| `DELETE` | `/api/experiences/:id` | 删除（软删 = `active=0`；硬删需确认） |
| `POST` | `/api/runs/:id/reflect` | 手动触发该 run 的提取（复用 §5.1 流程） |
| `GET` | `/api/experiences/stats` | 统计：总数 / 常用（usage_count ≥ 5）/ 冷资产（30 天未用）/ 草稿数 |

---

## 8. 前端

- **侧栏新增「资产」Tab**（对齐现有 会话 / 产物库 / Agents / 分析 的 Tab 结构）：按 agent / kind 筛选，列表展示 title / trigger / 来源 / usage，行内操作：编辑（title / trigger / content / tags）、停用/启用、删除。统计区展示常用与冷资产。
- 编辑用现有 shadcn dialog + CodeMirror（复用 artifact 面板内编辑组件），明确提示「经验会注入后续 Agent 运行，可随时停用」。
- 消息操作菜单「沉淀为经验」（P1）与 `/learn`（P1）。
- 消息气泡「引用了经验 X」的引用标签（P2，消费 §6.1 的 `injectedIds`）。

---

## 9. 事件与契约

- **v1 不新增 StreamEvent**：提取在 run 收尾后异步发生，不进入 SSE 主链路，不破坏 `specs/02` 契约；资产 Tab 用 REST refetch。
- **注入痕迹**：把 `injectedIds` 写进现有 debug snapshot（Spec 17 的 `AgentRunDebugSnapshot` 加 `experiencesInjected: string[]`，`agent-runner.ts:2706` 一带的 debug snapshot 组装处），**不动 `agent_runs` 表结构**（省一次 migration），供 P2 引用标签与调试回放。

---

## 10. 安全 / 隐私

- 经验内容存 SQLite（`.agenthub-data/agenthub.db`），**不写 workspace 文件**（不占沙箱配额、不进 boundPath）。
- 提取输入只喂公开折叠文本 + artifact 元信息，**不喂** thinking / tool_result / secret / MCP env（对齐 Spec 13 折叠哲学与 Spec 17「不保存完整 prompt / tool 输出」约束）。
- 注入内容为纯文本、XML escape，语义同 skills「不作为可执行代码、不授予工具权限」（对齐 Spec 18 约束）。
- LLM 提取输出必须 zod 校验 + 长度钳制；失败静默（仅 warn），不影响 run 结果。

---

## 11. 影响面 / 需同步的 spec

- `08-db-schema` — 新表 `experiences` + FTS 脚本 + ID 前缀表加 `exp_`（需 `pnpm db:push` + `migrate-add-experiences.ts`）
- `01-core-entities` — ID 命名规范表加 `exp_`（经验资产是支撑实体，不入核心实体清单，同 workspace_memories 先例）
- `13-conversation-context` — 边界注记：experiences 不进入 `buildHistoryFor` / `PromptContextSnapshot`
- `16-workspace-memory` — §3 边界对照表同步
- `06-orchestrator-flow` — P2：planning run 经验注入与子任务 hints
- `17-agent-run-debugging` / `19-agent-run-debugger-upgrade` — debug snapshot 加 `experiencesInjected`
- `09-frontend-architecture` — 侧栏「资产」Tab 与 store（镜像 workspaceMemoriesByConv 的模式）
- `CLAUDE.md §8` — 索引加本 spec；`OVERVIEW.md` — 功能矩阵补「经验资产」
- **新增配方** `skills/add-experience.md`（实现时按 `add-*.md` 骨架：何时用 → 前置阅读 → 契约 → 编号步骤附 file:line → 常见坑 → 提交自检）

---

## 12. 分期建议

| 阶段 | 内容 | 成本 |
|---|---|---|
| **P0** | 表 + migration + FTS；`experience-service`（CRUD + 检索 + `buildExperienceBlock`）；`buildAdapterInput` 注入 + `finalizeOk` 自动提取（带门槛与开关）；侧栏「资产」Tab；单测（检索评分 / 预算裁剪 / 提取输出 zod） | 中 |
| **P1** | 消息菜单 / `/learn` 手动沉淀；查重合并完善；冷资产统计；debug snapshot 注入痕迹；归档批量提取（开关） | 中 |
| **P2** | `profile_fact` 画像聚合页；反思日志；引用标签；导出 / 应用到其他 Agent（`agents.experience_ids`）；语义检索（可选） | 高 |

> 即「先让 run 自动沉淀 + 按需注入（便宜、闭环完整），再补手动入口与画像 / 导出（贵、增量价值）」。

---

## 13. 决策记录（待确认，实现前讨论）

1. **存储** → 新表 `experiences`，不塞 `workspace_memories`：两者范围（跨会话 vs 单会话）与写入方（自动 vs 用户）语义不同，混用会让「用户备注」被自动内容污染。
2. **检索** → v1 复用 FTS5 + `bm25`（项目已有 `messages_fts` 先例），不做 embedding / vector：本地单用户、经验量级小（每 agent 数十条），向量检索 ROI 低；语义检索留 P2 可选。
3. **注入范围** → 普通 run 注入、`overridePrompt` 子任务不注入（对齐 Spec 06 隔离 + workspace memory / skills 同一约定）；Orchestrator planning run 走普通路径自然获得。
4. **自动提取门槛** → 门槛 + `app_settings` 开关，默认开但只对「有料」的 run 生效（tool 数 / artifact / 聚合 run），避免每轮对话都烧一次反思 token。
5. **会话删除** → 经验保留（`conversation_id` SET NULL）：经验的价值在跨会话，随会话级联删除就退化成 workspace memory 了。
6. **引用标签** → 放 P2：需要消费 `injectedIds` 且改动消息渲染链路，先让沉淀 / 注入闭环跑通。

---

## 14. 验证清单

- [ ] 完成一次「多工具 + 产出 artifact」的 run 后，`experiences` 表出现 0..3 条 `source='auto'` 经验，title / trigger / content 长度合规
- [ ] 同一 run 重复触发 `POST /api/runs/:id/reflect` 不产生重复条目（查重生效）
- [ ] 新 run 的 system prompt 中：任务关键词命中时出现 `<relevant_experiences>`，未命中时无空块
- [ ] `overridePrompt` 子任务（Orchestrator 分派）不注入经验块
- [ ] 删除 conversation 后其来源经验仍在（`conversation_id` 为 NULL），可正常检索
- [ ] 停用（`active=0`）后不再被注入；再次启用后恢复
- [ ] `usage_count` / `last_used_at` 随注入递增；`/api/experiences/stats` 冷资产统计正确
- [ ] 提取 LLM 输出非法（超长 / 非 JSON / 错字段）时整条丢弃，run 不受影响
- [ ] 注入经验后 SDK adapter（claude-code / codex）下一轮 run 行为符合预期（无 session 过期问题）
- [ ] `pnpm typecheck` / `pnpm lint` / 相关单测通过
