# Skill：新增经验资产能力（Experience Assets）

> **目的**：实现 `specs/20-experience-assets.md` 的「经验沉淀 / 反思 / 按需注入」闭环——run 收尾后自动提炼可复用做法，后续 run 检索命中才注入 system prompt。
> **契约文档**：`specs/20-experience-assets.md`（设计提案，先读完再动手；本配方是它的实现步骤）。
> *行号基线：commit `cf6e3c8`。对不上时按符号名搜索。*

---

## 何时用 / 何时不用

- ✅ 开始实现 Spec 20 的 P0（表 + 提取 + 注入 + 资产 Tab）或后续阶段（P1 手动沉淀 / P2 画像、导出）。
- ❌ 想改 workspace memory / context summary / skills 的行为——那是 Spec 16 / 13 / 18 的地盘，本配方不覆盖。
- ❌ 想让 agent 有一个「调用经验」的新工具——**不新增工具**，沉淀由服务层 + UI 触发（Spec 20 §2 非目标）。

---

## 前置阅读

1. `specs/20-experience-assets.md` —— 数据模型、边界、注入点、分期（本配方的唯一事实源）。
2. `src/server/workspace-memory-service.ts` —— **服务层模板**：CRUD + `buildWorkspaceMemoryBlock` + normalize + escapeXml。
3. `src/db/migrate-add-message-search.ts` —— **FTS 迁移模板**：虚拟表 + 3 触发器 + backfill + CLI 入口。
4. `src/server/search-service.ts` —— FTS 查询写法：`messages_fts` + `bm25` + `snippet` + `maybeQuote`（`:42` 起的引用规则）。
5. `src/server/agent-runner.ts` —— 注入点（`buildAdapterInput`，约 `:2530`）与收尾钩子（`finalizeOk`，约 `:2262`；`finalize` 在 `:1980`）。
6. `src/app/api/conversations/[id]/workspace-memory/route.ts` —— **API 路由模板**。
7. `src/components/sidebar.tsx`（`Mode` 联合 `:37`、TabButton `:612`）与 `src/stores/app-store.ts`（`workspaceMemoriesByConv` 模式，Spec 16 §6）。

---

## 你要满足的契约（Spec 20 摘要）

- **表 `experiences`**：字段、索引、约束见 Spec 20 §4。**关键**：`conversation_id` 是 `ON DELETE SET NULL`（会话删了经验要留），不是 CASCADE——**别抄 workspace_memories 的级联**。
- **FTS**：`experiences_fts`（title/trigger/tags/content），镜像 messages_fts 的三触发器 + backfill 模式。
- **提取**：`finalizeOk` 后异步、有门槛、失败仅 warn；LLM 输出 zod 校验 + 长度钳制；不喂 thinking / tool_result / secret。
- **注入**：`<relevant_experiences>` 块插在 `<workspace_memory>` 之后、skills 之前；无命中**不输出空块**；`overridePrompt` 子任务不注入；预算 ≤ 1500 token / ≤ 6 条。
- **契约零破坏**：不新增 StreamEvent；注入痕迹写 debug snapshot。

---

## 步骤

### 1. schema：加 `experiences` 表

`src/db/schema.ts`，在 `workspaceMemories`（`:499`）之后、`mcpServers`（`:526`）之前加 `sqliteTable('experiences', ...)`：

```ts
export const experiences = sqliteTable('experiences', {
  id: text('id').primaryKey(),                    // exp_<nanoid>
  kind: text('kind').notNull(),                   // 'experience'|'reflection'|'profile_fact'
  agentId: text('agent_id').references(() => agents.id),
  scope: text('scope').notNull().default('agent'),// 'agent'|'global'
  conversationId: text('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  runId: text('run_id'),
  title: text('title').notNull(),
  trigger: text('trigger').notNull(),
  content: text('content').notNull(),
  tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
  source: text('source').notNull().default('auto'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  usageCount: integer('usage_count').notNull().default(0),
  lastUsedAt: integer('last_used_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  index('idx_experiences_agent_active').on(t.agentId, t.active, t.updatedAt),
  index('idx_experiences_conv').on(t.conversationId),
])
```

同文件底部类型区（`:667` 附近，`WorkspaceMemoryRow` 旁边）加：

```ts
export type ExperienceRow = typeof experiences.$inferSelect
export type ExperienceInsert = typeof experiences.$inferInsert
```

`src/server/ids.ts`：抄 `newWorkspaceMemoryId` 加 `newExperienceId()`（前缀 `exp_`，nanoid 12）。

跑 `pnpm db:push` 推表；FTS 另走第 2 步脚本。

### 2. FTS 迁移脚本（抄 `migrate-add-message-search.ts`）

新建 `src/db/migrate-add-experiences-fts.ts`，逐句对照：

- `CREATE VIRTUAL TABLE IF NOT EXISTS experiences_fts USING fts5(title, trigger, tags, content, tokenize='trigram')`
- `experiences_fts_ai` / `_au` / `_ad` 三触发器：insert/update 时把 `title + trigger + tags + content` 拼进 `experiences_fts`（update 先删后插），delete 删行。**注意**：update 触发器要处理 `active` 变化——停用条目从索引删掉（`DELETE ... WHERE rowid=old.rowid` 分支）。
- 末尾 `INSERT OR IGNORE ... SELECT` backfill + `require.main === module` CLI 入口。

执行：`tsx src/db/migrate-add-experiences-fts.ts`（幂等，可重入）。

### 3. service：`src/server/experience-service.ts`（抄 workspace-memory-service.ts）

按「CRUD → buildExperienceBlock → extractFromRun」三段写：

**CRUD**（`listExperiences(agentId?, kind?)` / `createExperience` / `updateExperience` / `deleteExperience`）：常量（`MAX_EXPERIENCE_TRIGGER_CHARS=200`、`MAX_EXPERIENCE_CONTENT_CHARS=8000`、`EXPERIENCE_PROMPT_MAX_ENTRIES=6`、`EXPERIENCE_PROMPT_TOKEN_BUDGET=1500`）、`normalizeTitle/Trigger/Content`（trim + 长度钳制）、`escapeXml`——全部照抄 workspace-memory-service.ts 的同名函数。

**`buildExperienceBlock(agentId, taskText, options)`**：
1. 关键词 = `taskText` 切词（空白 + 中英标点切分，去空 token），拼 FTS query——**逐词走 `search-service.ts:maybeQuote`**（`:42` 起的引用规则：`*` 透传、`(` 透传报错、`-` 加双引号），防 MATCH 语法错 / 注入。
2. `SELECT ... FROM experiences_fts JOIN experiences e ON e.rowid = experiences_fts.rowid WHERE experiences_fts MATCH ? AND e.active = 1 AND (e.agent_id = ? OR e.scope = 'global') ORDER BY bm25(experiences_fts) LIMIT 6`（抄 `search-service.ts:85-96` 的 join + bm25 写法）。
3. 无命中返回 `{ block: null, injectedIds: [] }`；命中按 `content.length` 累计，超 `tokenBudget*4` 字符从尾部裁（抄 `buildWorkspaceMemoryBlock` 的 `charBudget` 裁剪逻辑 `:122-141`）。
4. 输出 `<relevant_experiences><experience id title trigger>content</experience>...</relevant_experiences>`（XML escape）。
5. 异步 `usage_count+1` / `last_used_at=now`（fire-and-forget，`.catch(()=>{})`）。

**`extractFromRun(runId, args)`**：
1. 门槛判断：run `status='complete'`；且 tool 数 ≥ 3 / 有 artifact / 是聚合 run；且 `app_settings.experience_extraction_enabled !== false`（读法抄 settings-service 的 getter）。
2. **bounded 输入**：`messages` 按 `run_id` 取该 run 的消息 parts → 折叠公开文本（text/code/artifact_ref 占位，**丢 thinking/tool_use/tool_result**，规则抄 `conversation-context.ts` 的折叠）+ 收集 tool_use 名序列 + artifact title/type（从 `artifact_ref` part 的 id join `artifacts` 表）。
3. 调 LLM（走 provider 封装，默认 agent 的 model；带 AbortSignal）：输出必须是 JSON 数组 `{ kind, title, trigger, content, tags }[]`，**zod 校验**（kind 枚举、title ≤ 80、trigger ≤ 200、content ≤ 8000），不合规整条丢。
4. 查重：trigger/title 归一化（小写 + 去空白）与已有 active 条目比对，重复跳过或 append 来源 run。
5. **失败静默**：整个函数 try/catch 只 `console.warn`，绝不 throw（对齐 `agent-runner.ts:2547` 的容错模式）。

### 4. 收尾钩子：`agent-runner.ts:finalizeOk`（`:2262`）

在 `finalize(runId, args, 'complete', result)` 之前加**异步 fire-and-forget**：

```ts
void experienceService.extractFromRun(runId, args).catch((err) => {
  console.warn('[agent-runner] extractFromRun failed; continuing', err)
})
```

只挂 `finalizeOk`（complete 路径），不挂 `finalize`（aborted/failed 不沉淀）。

### 5. 注入：`agent-runner.ts:buildAdapterInput`（`:2530`）

在 `createPromptSection('workspace_memory', memoryBlock)`（约 `:2554`）之后、skills（约 `:2573`）之前插入：

```ts
if (!args.overridePrompt && !args.overrideSystemPrompt) {
  const expBlock = await buildExperienceBlock(agent.id, currentUserText, {
    tokenBudget: EXPERIENCE_PROMPT_TOKEN_BUDGET,
  }).catch((err) => {
    console.warn('[agent-runner] buildExperienceBlock failed; continuing without experiences', err)
    return { block: null, injectedIds: [] }
  })
  if (expBlock.block) {
    systemPromptSections.push(createPromptSection('relevant_experiences', expBlock.block))
    injectedExperienceIds = expBlock.injectedIds
  }
}
```

- 注入范围守卫：**必须**包在 `!args.overridePrompt && !args.overrideSystemPrompt` 里（Spec 06 隔离；对照 workspace memory / skills 在 `:2557` 的同一守卫）。
- `currentUserText` = 当前触发消息的 text（args 里已有的触发消息内容，别去重查 DB）。
- `injectedExperienceIds` 进返回值（供第 6 步）。

### 6. debug snapshot：注入痕迹（约 `:2706`）

`AgentRunDebugSnapshot` 加 `experiencesInjected: string[]`（在 `workspaceMemoryInjected` / `skills` 旁边），把第 5 步的 `injectedExperienceIds` 填进去。**不动 `agent_runs` 表**（Spec 20 §9）。

### 7. API 路由（抄 workspace-memory 路由）

| 文件 | 方法 | 说明 |
|---|---|---|
| `src/app/api/experiences/route.ts` | GET（`?agentId=&kind=&q=&active=`） / POST | 列表 / 检索 / 手动创建（`source='manual'`，zod 校验） |
| `src/app/api/experiences/[id]/route.ts` | PATCH / DELETE | 编辑 / 删除（硬删前确认） |
| `src/app/api/experiences/stats/route.ts` | GET | 统计（总数 / 常用 / 冷资产 / 草稿） |
| `src/app/api/runs/[id]/reflect/route.ts` | POST | 手动触发提取（复用 service） |

> **注意**：App Router 静态段优先于动态段——`experiences/stats/route.ts` 不会被 `experiences/[id]` 吞掉，两个文件可以共存；但别把 stats 写成 `[id]` 里的分支。

### 8. 前端：侧栏「资产」Tab

- `src/components/sidebar.tsx`：`type Mode`（`:37`）加 `'experiences'`；`:194-222` 的 Tab 区加一个 `<TabButton self="experiences" ...>`（抄现有三个 TabButton）。
- 新建 `src/components/experience-library.tsx`：列表 + 筛选（agent/kind）+ 行内编辑（shadcn dialog + CodeMirror，复用 artifact 面板编辑组件）+ 停用/启用/删除 + 统计区。数据进 `app-store.ts`（`experiencesByAgent` / `upsertExperience` / `removeExperience`，镜像 Spec 16 §6 的 `workspaceMemoriesByConv` 模式）。
- API 层：`src/app/api` 对应 fetch helper（照抄现有 workspace-memory 的 fetch 写法）。

### 9. 单测

新建 `src/server/experience-service.test.ts`，覆盖**纯函数**（对齐现有测试风格，如 `workspace-memory-service.test.ts`）：

- `buildExperienceBlock`：命中/未命中（无空块）/ 预算裁剪 / `maybeQuote` 引用规则（含 `-`、`*` 用例）。
- `extractFromRun` 输出：zod 拒非法（超长 / 非 JSON / 错 kind）、长度钳制。
- 查重：重复触发不产生重复行。

### 10. 文档同步

按 Spec 20 §11 逐项：`specs/08-db-schema.md`（新表 + ID 表加 `exp_`）、`specs/01-core-entities.md`（ID 命名表）、`specs/13-conversation-context.md` 与 `specs/16-workspace-memory.md`（边界注记）、`specs/17-agent-run-debugging.md`（`experiencesInjected`）、`CLAUDE.md §8` 索引、`OVERVIEW.md` 功能矩阵。

---

## 常见坑

1. **级联方向抄反**：`experiences.conversation_id` 必须 `ON DELETE SET NULL`。抄 workspace_memories 的 CASCADE 会让「会话一删、经验全没」——那这个能力就退化成单会话备注了（Spec 20 §3）。
2. **FTS 查询不套 `maybeQuote`**：`MATCH` 直接拼任务文本会出 FTS5 语法错（`(`、`-`、引号都是 FTS5 特殊字符），还可能是注入面。逐词过 `search-service.ts:maybeQuote`（`:42`）。
3. **提取喂了完整 tool 输出**：会烧 token + 把 secret / 大产物灌进 LLM。只喂「公开折叠层」（text + artifact 占位 + tool 名序列），规则对齐 `conversation-context.ts` 的折叠哲学（Spec 13 / 20 §10）。
4. **LLM 提取输出不校验就落库**：输出是跨进程不可信输入，必须 zod + 长度钳制（CLAUDE.md §4.4）；坏行整条丢，不半条入库。
5. **注入越过了 Spec 06 隔离**：`overridePrompt` 子任务**不注入**。漏掉这个守卫，Orchestrator 子任务会看到主任务的全局经验，破坏隔离上下文（对照 `:2557`）。
6. **没有命中也输出空块**：`block === null` 时不要 push section；空 `<relevant_experiences>` 块浪费 token 还干扰模型（对齐 workspace memory 约定，`workspace-memory-service.ts:127/149`）。
7. **新加 StreamEvent**：Spec 20 §9 明确 v1 不加事件、注入痕迹走 debug snapshot。加事件 = 改 `specs/02` 契约，需要先讨论。
8. **extractFromRun 同步阻塞收尾**：必须 `void ...catch()` fire-and-forget；反射调用失败绝不能拖垮或污染 run 结果。

---

## 提交自检（对齐 CLAUDE.md §6.5）

- [ ] `pnpm typecheck` / `pnpm lint` 过
- [ ] `experiences` 表已 `pnpm db:push`；FTS 脚本已跑且幂等（重跑不报错、不重复行）
- [ ] `conversation_id` 是 SET NULL；删会话后经验仍在、可检索（验证清单首项）
- [ ] `buildExperienceBlock` 命中/未命中/裁剪有单测；`maybeQuote` 规则有覆盖
- [ ] 提取输出 zod 校验 + 长度钳制有单测；失败静默不 throw
- [ ] `overridePrompt` 子任务不注入（有验证）；无命中不输出空块
- [ ] 未新增 StreamEvent；`experiencesInjected` 只进 debug snapshot
- [ ] `specs/08`、`specs/01`（ID 表）、`specs/13/16/17`、`CLAUDE.md §8`、`OVERVIEW.md` 已同步（按 Spec 20 §11）
- [ ] 没有遗留 `console.log` / TODO / 注释代码

---

## 实施记录（P0，2026-09-13）

状态：**P0 已实现并验证**。代码落地于 `src/server/experience-service.ts`、`src/app/api/experiences/*`、`src/app/api/runs/[id]/reflect`、`src/components/experience-library.tsx`、sidebar「资产」Tab；bootstrap/schema/agent-runner/settings-service/shared-types/lib-api 相应改动；单测 `src/server/experience-service.test.ts`（14 例全过）。

与配方的实际偏差（重做时注意）：

1. **`pnpm db:push` 在给 app_settings 加列时失败**（drizzle-kit 0.31 把带 DEFAULT 的新列塞进旧表 SELECT，报 `no such column`）。实际改走 `src/db/migrate-add-experiences.ts`（原生 SQL 增量迁移，幂等）+ `src/db/migrate-add-experiences-fts.ts`。**bootstrap.ts 也已补** experiences 表 / app_settings 列 / experiences_fts + 三触发器，新库开箱即用，无需手跑迁移。
2. **`experiences_fts` 同时建在 bootstrap**（镜像 messages_fts 未进 bootstrap 的差异）——`buildExperienceBlock` 对缺 FTS 的库会静默降级 LIKE，故两者均可工作。
3. **注入点双守卫同时用 `overridePrompt` 与 `overrideSystemPrompt`**（配方坑 5 只提了 overridePrompt）。
4. **`finalizeOk` 改为 async**：先 `await finalize(...)` 再 fire `extractFromRun`，消除 run.status 读取竞争。
5. **LIKE 兜底转义 `%`/`_`/`\`**（`escapeLikePattern` + `ESCAPE '\'`），避免任务文本通配符扩大匹配。
6. **AppRouter 路由**：`api/experiences/stats` 与 `api/experiences/[id]` 并存，静态段优先，无冲突。

验证结果：typecheck ✓ / lint ✓ / 全量测试 485 过（仅 `conversation-workspace.test.ts` 1 例既有失败，与本次无关，基线即失败）/ 端到端冒烟 ✓（建 → FTS 命中 → 未命中 null → 预算裁剪 → usage_count 递增 → 停用后不再命中 → 清理）。

### P1（2026-09-13，同一轮）

1. **设置面板提取开关**：`settings-dialog.tsx` 通知 tab 新增「经验资产」区（`experienceExtractionEnabled` CheckboxRow，默认 true，保存走既有 patch）。需要同步的 4 处：`SettingsForm` 类型 / `rowToForm` / form 初始值 / patch 构建，外加 `lib/api.ts` 的 `AppSettingsPatchBody` 加可选字段。
2. **手动沉淀入口**：`agent-run-debug-board.tsx` header 工具栏加「沉淀经验」按钮 → `lib/api.ts:triggerExperienceReflection` → `POST /api/runs/[id]/reflect`，成功/失败走 `addNotification`（与 rerun 一致）。
3. **按 Agent 分组（画像聚合最小版）**：`experience-library.tsx` 加「分组」toggle，按 `agentId` 分组渲染（组头 = agent 名 + 条数，`agentId=null` 归「全局」）；sidebar 传入 `Object.values(agents)`（注意 agents store 是 `Record` 非数组）。

**Windows 编辑环境坑（本轮新增）**：Edit 工具在**混合行尾文件**（Edit 插入段为 LF、原文件 CRLF）上，多行锚点 `OLD_STRING_NOT_FOUND` 是常态，单行锚点也可能因**缩进数错误**失败——先 Read 实际行再锚；大块 JSX 重组用 node 脚本 + `\r?\n` 正则，改完必须 `pnpm typecheck`（tsc 对未闭合 JSX 的报错点在根标签，需用 `transpileModule`/标签计数定位真正缺闭合的位置）。
