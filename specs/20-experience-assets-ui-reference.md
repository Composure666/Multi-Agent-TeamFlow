# 经验资产 — UI 页面规格参考（Spec 20 配套）

> 本文档是经验资产功能的
> **前端页面实现规格**
> ，供其他 AI / 开发者参考制作同类页面。
> 设计提案见
> [specs/20-experience-assets.md](./20-experience-assets.md)
> ，实现配方见
> [skills/add-experience.md](../skills/add-experience.md)
> 。



***

## 1. 功能定位

经验资产是 Agent 运行后**自动 / 手动沉淀的可复用知识**，按触发条件注入后续 Agent 任务的系统提示，实现 "越用越聪明"。

UI 层包含三个触点：



| 触点        | 位置                 | 作用                          |
| --------- | ------------------ | --------------------------- |
| **资产库主页** | 侧栏 → 资产            | 浏览、搜索、筛选、新建、编辑、删除、启用 / 停用经验 |
| **设置开关**  | 设置 → 通知 tab → 经验资产 | 控制 run 收尾后是否自动反思沉淀          |
| **调试面板**  | 运行展板 → Run 详情      | 手动沉淀按钮 + 经验注入条数指标           |



***

## 2. 页面入口与路由接入

### 2.1 侧栏导航项

文件：`src/components/workbench-navigation.ts`



```
{ id: 'experiences', label: '资产', icon: BookOpen, group: 'workspace',

\&#x20; description: '沉淀与复用 Agent 运行经验' }
```



* 位置：在「产物库」和「自动化」之间

* 图标：`BookOpen`（lucide-react）

* 分组：`workspace`（与 Agent 库、能力中心、产物库同组）

### 2.2 视图类型

文件：`src/stores/app-store.ts`



```
export type AppWorkbenchView =

\&#x20; \\| 'new-task' | 'conversations' | 'agents' | 'capability-center'

\&#x20; \\| 'artifacts' | 'experiences' | 'automation' | 'run-board'

\&#x20; \\| 'analytics' | 'information-center'
```

### 2.3 视图渲染分发

文件：`src/components/app-workbench.tsx`



```
import { ExperienceLibrary } from '@/components/experience-library'

// 在 WorkbenchViewRouter 的 renderers 中：

experiences: () => (

\&#x20; \\\<ExperienceLibrary agents={agents.map((a) => ({ id: a.id, name: a.name }))} />

),
```



* `agents` 来自 `useAgentList()`，用于把 `agentId` 解析为 Agent 名称显示

* `agents` prop 是可选的（默认 `[]`），不传时 agent 名显示「未知 Agent」



***

## 3. 主页面结构（ExperienceLibrary）

文件：`src/components/experience-library.tsx`（`'use client'` 组件，约 480 行）

### 3.1 组件签名



```
export function ExperienceLibrary({ agents = \\\[] }: {

\&#x20; agents?: { id: string; name: string }\\\[]

})
```

### 3.2 整体布局



```
\\\<div className="flex h-full min-h-0 flex-col">

\&#x20; ├── 统计条（shrink-0）

\&#x20; ├── 搜索+筛选+操作条（shrink-0）

\&#x20; ├── 列表区（min-h-0 flex-1，ScrollArea）

\&#x20; ├── 新建/编辑 Dialog

\&#x20; └── 删除确认 Dialog

\\\</div>
```

关键：父容器必须是 `h-full` + `flex flex-col`，列表区用 `min-h-0 flex-1` 保证滚动正常。



***

### 3.3 统计条（顶部）



```
┌─────────────────────────────────────────────────┐

│ 📖 经验资产                    共 N 条 · 累计使用 M 次 │

│ 活跃 X   常用 Y   冷资产 Z（琥珀色）   草稿 W        │

└─────────────────────────────────────────────────┘
```



* 容器：`shrink-0 space-y-1 border-b px-3 py-2 text-[11px] text-muted-foreground`

* 第一行：左侧 `BookOpen` 图标 + "经验资产"；右侧总数 + 累计使用次数

* 第二行：四个指标横排，`冷资产` 用 `text-amber-500/80` 高亮

* 数据来源：`GET /api/experiences/stats` → `ExperienceStats`



```
interface ExperienceStats {

\&#x20; total: number; active: number; drafts: number

\&#x20; frequentlyUsed: number; cold: number; totalUsage: number

}
```



***

### 3.4 搜索 + 筛选 + 操作条



```
┌──────────────────────────────────────────────────────┐

│ 🔍 搜索经验（标题 / 触发条件 / 内容）                    │

│ \\\[全部] \\\[经验] \\\[反思] \\\[画像]    \\\[👥 分组] \\\[＋ 新建]     │

└──────────────────────────────────────────────────────┘
```

#### 搜索框



* 组件：`Input` + 左侧绝对定位 `Search` 图标（`pl-7`）

* 占位：`搜索经验（标题 / 触发条件 / 内容）`

* 行为：`onChange` 更新 `query` state；`Enter` 触发 `refresh()`

* 搜索是**前端过滤**（在已加载的 `items` 上 filter 标题 + 触发条件 + 内容 + 标签），不是服务端搜索（服务端 `q` 参数用于 FTS5，当前 UI 未传）

#### 分类筛选（kind filter）



* 四个按钮：`全部` / `经验` / `反思` / `画像`

* 选中态：`variant="secondary"`；未选中：`variant="ghost"`

* 尺寸：`h-6 px-2 text-[11px]`

* 点击后 `setKindFilter(kind)`，触发 `useEffect` 重新拉取列表（传 `kind` 参数到 API）

#### 分组切换



* 按钮：`Users` 图标 + "分组"，`title="按 Agent 分组展示（画像聚合）"`

* 选中态 `variant="secondary"`，toggle `groupByAgent` state

* 开启后列表按 `agentId` 分组，每组显示 Agent 名 + 条数

#### 新建按钮



* `variant="outline"`，`Plus` 图标 + "新建"

* 点击 `openCreate()` → 打开新建 Dialog



***

### 3.5 列表区

容器：`ScrollArea`（`min-h-0 flex-1`），内部 `space-y-1 p-2`

#### 三种状态



| 状态     | 条件                                          | 渲染                                 |
| ------ | ------------------------------------------- | ---------------------------------- |
| 加载中    | `loading === true`                          | 居中 `Loader2` 旋转图标                  |
| 空（无数据） | `items.length === 0`                        | 居中文字：`还没有经验资产。运行几个任务后会自动沉淀，或手动新建。` |
| 空（无匹配） | `items.length > 0 && filtered.length === 0` | 居中文字：`无匹配结果`                       |
| 有数据    | `filtered.length > 0`                       | 列表项（普通或分组）                         |

#### 普通模式



```
{filtered.map(renderItem)}
```

#### 分组模式（groupByAgent === true）



```
┌─ 🤖 Agent名称                    N 条 ─┐

│  \\\[经验卡片]                              │

│  \\\[经验卡片]                              │

├─ 🤖 全局（agentId === null）         M 条 ─┤

│  \\\[经验卡片]                              │

└──────────────────────────────────────────┘
```



* 分组 key：`agentId ?? '__global__'`

* Agent 名解析：`agents.find(a => a.id === id)?.name ?? '未知 Agent'`；`agentId === null` 显示「全局」

* 排序：按每组条数降序

* 组头：`Bot` 图标 + Agent 名（左），条数（右），`text-[10px] text-muted-foreground`



***

### 3.6 列表项结构（renderItem）



```
┌──────────────────────────────────────────────────────┐

│ \\\[经验] 标题文字……                          \\\[停用]\\\[编辑]\\\[删除] │

│ 触发条件文字（truncate）                                │

│ 经验正文……（line-clamp-2，whitespace-pre-wrap）         │

│ \\\[标签1] \\\[标签2] \\\[标签3] \\\[标签4]                        │

│ 使用 N 次 · 最近 HH:MM · 自动/手动                      │

└──────────────────────────────────────────────────────┘
```

#### 头部行



* 左侧：`Badge`（kind 标签，颜色见 §6.2）+ 标题（`truncate text-xs font-medium`）+ 草稿标记（`active===false` 时显示琥珀色「草稿」）

* 右侧：操作按钮组（`opacity-0 group-hover:opacity-100`，hover 才显示）

#### 操作按钮（三个，均 `size-6` 图标按钮）



| 按钮      | 图标                  | 行为                                                    | 颜色                                             |
| ------- | ------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| 启用 / 停用 | `BookOpen`          | `toggleActive(item)` → PATCH `{active: !item.active}` | 启用时 `text-blue-500`，停用 `text-muted-foreground` |
| 编辑      | `Plus`（`rotate-45`） | `openEdit(item)` → 打开编辑 Dialog                        | 默认                                             |
| 删除      | `Trash2`            | `setDeleteTargetId(item.id)` → 打开删除确认 Dialog          | `text-destructive`                             |

#### 内容区



* 触发条件：`truncate text-[11px] text-muted-foreground`（单行截断）

* 正文：`line-clamp-2 whitespace-pre-wrap text-[11px]`（最多 2 行，保留换行）

* 标签：最多显示 4 个（`slice(0, 4)`），`rounded bg-muted px-1 text-[10px]`

#### 底部元信息



* `使用 {usageCount} 次 · {最近时间 or 未使用} · {自动 or 手动}`

* 时间格式：今天显示 `HH:MM`，否则 `M/D`（`formatTime()` 工具函数）

* `text-[10px] text-muted-foreground`

#### 停用态样式



* `active === false` 时整个卡片 `opacity-60`



***

### 3.7 新建 / 编辑 Dialog

组件：`Dialog` + `DialogContent`（`sm:max-w-md`）

#### 标题与描述



| 模式     | DialogTitle | DialogDescription                      |
| ------ | ----------- | -------------------------------------- |
| create | 手动沉淀经验      | 手动录入一条可复用的经验，将按触发条件注入后续 Agent 任务的系统提示。 |
| edit   | 编辑经验        | 修改经验内容与启用状态。                           |

#### 表单字段



| 字段      | 组件                   | 占位 / 说明                                                | 校验                                     |
| ------- | -------------------- | ------------------------------------------------------ | -------------------------------------- |
| kind    | 三个按钮切换（经验 / 反思 / 画像） | `variant={edit.kind===kind ? 'secondary' : 'outline'}` | 默认 `experience`                        |
| title   | `Input`              | `标题（≤80 字）`                                            | 必填，≤80                                 |
| trigger | `Input`              | `触发条件：何时适用（≤200 字）`                                    | 必填，≤200                                |
| content | `Textarea`（rows=6）   | `经验正文（≤8000 字）`                                        | 必填，≤8000                               |
| tags    | `Input`              | `标签，逗号分隔`                                              | 支持中英文逗号，split 后 trim，最多 10 个，每个 ≤32 字符 |
| active  | checkbox（仅 edit 模式）  | `启用（注入 Agent 上下文）`                                     | create 时默认 true，不显示                    |

#### 底部按钮



* 取消：`variant="ghost"` → `setEdit(null)`

* 保存：`disabled={saving \|\| !title.trim() \|\| !trigger.trim() \|\| !content.trim()}`


  * 保存中显示 `Loader2` 旋转

  * create → `POST /api/experiences`；edit → `PATCH /api/experiences/{id}`

  * 成功后关闭 Dialog + `refresh()`

#### EditState 类型



```
interface EditState {

\&#x20; mode: 'edit' | 'create'

\&#x20; id: string | null

\&#x20; kind: ExperienceKind

\&#x20; title: string

\&#x20; trigger: string

\&#x20; content: string

\&#x20; tags: string        // 注意：表单内是逗号分隔字符串，保存时 split

\&#x20; active: boolean

\&#x20; agentId: string | null

}
```



***

### 3.8 删除确认 Dialog



* `DialogContent`（`sm:max-w-sm`）

* 标题：`删除经验？`

* 描述：`「{title}」将被永久删除，无法恢复。`

* 按钮：取消（ghost）+ 删除（`variant="destructive"`，删除中显示 Loader2）

* 行为：`DELETE /api/experiences/{id}` → 成功后从本地 `items` 中 filter 移除（不重新拉取）



***

## 4. 数据模型

### 4.1 DB 表（experiences）

文件：`src/db/schema.ts`



| 字段             | 类型              | 约束                                       | 说明                                           |
| -------------- | --------------- | ---------------------------------------- | -------------------------------------------- |
| id             | text            | PK                                       | `exp_` 前缀                                    |
| kind           | text enum       | notNull                                  | `experience` / `reflection` / `profile_fact` |
| agentId        | text            | FK → agents.id, nullable                 | 所属 Agent；null 为全局                            |
| scope          | text enum       | notNull, default 'agent'                 | `agent` / `global`                           |
| conversationId | text            | FK → conversations.id, onDelete set null | 来源会话                                         |
| runId          | text            | nullable                                 | 来源 Run                                       |
| title          | text            | notNull                                  | 标题，≤80                                       |
| trigger        | text            | notNull                                  | 触发条件，≤200                                    |
| content        | text            | notNull                                  | 正文，≤8000                                     |
| tags           | text (json)     | notNull, default `'[]'`                  | 字符串数组，≤10 个，每个 ≤32                           |
| source         | text enum       | notNull, default 'auto'                  | `auto`（自动沉淀）/ `manual`（手动）                   |
| active         | integer boolean | notNull, default true                    | 是否启用（启用才注入）                                  |
| usageCount     | integer         | notNull, default 0                       | 累计注入次数                                       |
| lastUsedAt     | integer         | nullable                                 | 最近注入时间戳（ms）                                  |
| createdAt      | integer         | notNull                                  | 创建时间戳（ms）                                    |
| updatedAt      | integer         | notNull                                  | 更新时间戳（ms）                                    |

索引：



* `idx_experiences_agent_active` on `(agentId, active, updatedAt)`

* `idx_experiences_conv` on `(conversationId)`

FTS5 全文索引：`experiences_fts`（trigram 分词器，覆盖 title/trigger/content/tags）

### 4.2 类型导出



```
export type ExperienceKind = 'experience' | 'reflection' | 'profile\\\_fact'

export type ExperienceRow = typeof experiences.\\\$inferSelect

export type ExperienceInsert = typeof experiences.\\\$inferInsert
```



***

## 5. API 契约

### 5.1 REST 路由总览



| 方法     | 路径                       | 说明                              |
| ------ | ------------------------ | ------------------------------- |
| GET    | `/api/experiences`       | 列表（支持 agentId/kind/active/q 过滤） |
| POST   | `/api/experiences`       | 新建（手动沉淀）                        |
| GET    | `/api/experiences/stats` | 统计                              |
| PATCH  | `/api/experiences/[id]`  | 更新（部分字段）                        |
| DELETE | `/api/experiences/[id]`  | 删除                              |
| POST   | `/api/runs/[id]/reflect` | 对指定 Run 立即执行反思沉淀                |

### 5.2 GET /api/experiences

Query 参数（均可选）：



* `agentId`：string

* `kind`：`experience` / `reflection` / `profile_fact`

* `active`：`true` / `false`

* `q`：string（FTS5 全文搜索）

响应：



```
{ "experiences": \\\[ ExperienceRow, ... ] }
```

### 5.3 POST /api/experiences

请求体（zod strict 校验）：



```
{

\&#x20; kind?: 'experience' | 'reflection' | 'profile\\\_fact'  // 默认 experience

\&#x20; agentId?: string | null

\&#x20; scope?: 'agent' | 'global'

\&#x20; conversationId?: string | null

\&#x20; runId?: string | null

\&#x20; title: string      // min 1, max 80

\&#x20; trigger: string    // min 1, max 200

\&#x20; content: string    // min 1, max 8000

\&#x20; tags?: string\\\[]    // max 10, 每个 max 32

}
```



* `source` 固定为 `'manual'`（服务端写入，不接受客户端传入）

* 成功：`201 { experience: ExperienceRow }`

* 校验失败：`400 { error: 'Invalid body', issues: [...] }`

### 5.4 GET /api/experiences/stats

响应：



```
{ "stats": { "total": N, "active": N, "drafts": N, "frequentlyUsed": N, "cold": N, "totalUsage": N } }
```

统计口径：



* `drafts`：`active === false`

* `frequentlyUsed`：`usageCount >= 3` 且 `lastUsedAt` 在 30 天内

* `cold`：`lastUsedAt` 超过 30 天或为 null（`COLD_ASSET_DAYS = 30`）

### 5.5 PATCH /api/experiences/\[id]

请求体（zod strict，所有字段可选）：



```
{ title?: string; trigger?: string; content?: string; tags?: string\\\[]; active?: boolean }
```



* 成功：`{ experience: ExperienceRow }`

* 不存在：`404 { error: ... }`

### 5.6 DELETE /api/experiences/\[id]



* 成功：`{ ok: true }`

* 不存在：`404`

### 5.7 POST /api/runs/\[id]/reflect

手动对指定 Run 执行反思提取。



* 成功：`{ saved: number, experiences: ExperienceRow[] }`

* 门槛：需开关开启、run 已完成、非 mock agent、有 LLM 可用



***

## 6. 前端 API 封装

文件：`src/lib/api.ts`（`// ─── Experiences（Spec 20）───` 段，约 1369-1455 行）



```
// 列表

fetchExperiences(params?: { agentId?, kind?, active?, q? }): Promise\\\<ExperienceRow\\\[]>

// 统计

fetchExperienceStats(): Promise\\\<ExperienceStats>

// 新建

createExperience(input: CreateExperienceInput): Promise\\\<ExperienceRow>

// 更新

updateExperience(id, patch: { title?, trigger?, content?, tags?, active? }): Promise\\\<ExperienceRow>

// 删除

deleteExperience(id): Promise\\\<void>

// 手动沉淀（对 Run 反思）

triggerExperienceReflection(runId): Promise<{ saved: number; experiences: ExperienceRow\\\[] }>
```

所有函数内部使用 `json<T>(fetch(...))` 工具函数统一处理响应解析。



***

## 7. 状态管理

ExperienceLibrary **不使用全局 store**，所有状态在组件内用 `useState` 管理：



| state          | 类型                        | 说明                |
| -------------- | ------------------------- | ----------------- |
| items          | `ExperienceRow[]`         | 经验列表（API 返回的全量）   |
| stats          | `ExperienceStats`         | 统计                |
| loading        | `boolean`                 | 列表加载中             |
| query          | `string`                  | 搜索框输入（前端过滤）       |
| kindFilter     | `'all' \| ExperienceKind` | 分类筛选（触发 API 重新拉取） |
| groupByAgent   | `boolean`                 | 是否按 Agent 分组      |
| edit           | `EditState \| null`       | 新建 / 编辑 Dialog 状态 |
| saving         | `boolean`                 | 保存中               |
| deleteTargetId | `string \| null`          | 删除确认目标            |
| deleting       | `boolean`                 | 删除中               |

数据加载：



* `refresh()` 并行调用 `fetchExperiences()` + `fetchExperienceStats()`

* `useEffect` 监听 `kindFilter` 变化自动 `refresh()`

* 搜索（query）是前端过滤，不触发 API

* 保存 / 删除成功后调用 `refresh()`（删除是本地 filter 移除，不 refresh）



***

## 8. 关联组件与页面

### 8.1 设置面板 — 经验资产开关

文件：`src/components/settings-dialog.tsx`（通知 tab 内，约 391-402 行）



```
┌─ 经验资产 ──────────────────────────────────────┐

│ 📖 经验资产                                        │

│ run 收尾后自动反思沉淀可复用经验；关闭后仍可手动沉淀。 │

│ ☑ 自动反思沉淀经验                                  │

└───────────────────────────────────────────────────┘
```



* 位置：设置 Dialog → 通知（notifications）tab

* 组件：`BookOpen` 图标 + 标题 + 描述 + `CheckboxRow`

* 字段：`form.experienceExtractionEnabled`（默认 `true`）

* 保存时 PATCH 到 `app_settings.experience_extraction_enabled`

* 关闭后自动沉淀停止，但手动沉淀（调试面板按钮）仍可用

### 8.2 调试面板 — 手动沉淀按钮

文件：`src/components/agent-run-debug-board.tsx`（约 743-754 行）



```
\\\<Button variant="outline" size="sm" disabled={!selectedRun || reflectingRun}

\&#x20; title="对选中的 Run 立即执行反思，提炼可复用经验写入资产库"

\&#x20; onClick={() => void reflectSelectedRun()}>

\&#x20; {reflectingRun ? \\\<Loader2 className="size-3.5 animate-spin" /> : \\\<BookOpen className="size-3.5" />}

\&#x20; 沉淀经验

\\\</Button>
```



* 位置：Run 详情页顶部操作栏

* 行为：`triggerExperienceReflection(selectedRun.id)` → `POST /api/runs/[id]/reflect`

* 结果 Toast：`已沉淀 N 条经验` / `未沉淀经验` / `沉淀经验失败`

* 禁用条件：未选中 Run 或正在反思中

### 8.3 调试面板 — 经验注入指标

文件：`src/components/agent-run-debug-board.tsx`（约 2484 行，VariablesPanel 内）



```
\\\<PanelMetric label="经验" value={\\\`\\\${snapshot.context.experienceCount ?? 0} 条注入\\\`} />
```



* 位置：Run 详情 → VariablesPanel（变量面板）

* 显示当前 Run 实际注入了几条经验（来自 `snapshot.context.experienceCount`）

* 用于验证注入是否生效

### 8.4 Agent Runner — 自动沉淀与注入（后端）

文件：`src/server/agent-runner.ts` + `src/server/experience-service.ts`



* **自动沉淀**：`finalizeOk` 中异步调用 `extractFromRun(runId)`（不阻塞响应）


  * 门槛（`computeExtractionGate`）：`toolCount >= 3` **或** `artifactProduced` **或** `hasSubRuns`

  * 还需：开关开启、run complete、非 mock agent、有 LLM 可用、提取出候选、非重复

* **注入**：`buildAdapterInput` 中调用 `buildExperienceBlock(agentId, conversationId)`


  * 最多注入 `EXPERIENCE_PROMPT_MAX_ENTRIES = 6` 条

  * token 预算 `EXPERIENCE_PROMPT_TOKEN_BUDGET = 1500`

  * 按匹配度 + 使用频率 + 新鲜度排序，`clipByBudget` 截断

  * 注入到系统提示的「经验资产」区块



***

## 9. 样式规范

### 9.1 设计 token



| 元素       | 值                                       |
| -------- | --------------------------------------- |
| 页面背景     | 继承父容器（`app-workbench` 的渐变背景）            |
| 卡片边框     | `border`（默认 slate-200 /dark white/10）   |
| 主文字      | `text-slate-950 dark:text-slate-50`（继承） |
| 次要文字     | `text-muted-foreground`                 |
| 卡片 hover | `hover:bg-accent/50`                    |
| 圆角       | `rounded-md`（卡片）、`rounded`（标签）          |

### 9.2 字号层级



| 用途        | 字号                    |
| --------- | --------------------- |
| 经验标题      | `text-xs font-medium` |
| 触发条件 / 正文 | `text-[11px]`         |
| 标签 / 元信息  | `text-[10px]`         |
| 统计条       | `text-[11px]`         |
| 筛选按钮      | `text-[11px]`         |

整体是**紧凑密集型**列表设计，字号偏小，适合展示多条经验。

### 9.3 Kind 颜色映射



```
const KIND\\\_COLOR: Record\\\<ExperienceKind, string> = {

\&#x20; experience:    'bg-blue-500/10 text-blue-500 border-blue-500/30',

\&#x20; reflection:    'bg-purple-500/10 text-purple-500 border-purple-500/30',

\&#x20; profile\\\_fact:  'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',

}

const KIND\\\_LABEL: Record\\\<ExperienceKind, string> = {

\&#x20; experience: '经验', reflection: '反思', profile\\\_fact: '画像',

}
```

### 9.4 图标（lucide-react）



| 用途      | 图标                        |
| ------- | ------------------------- |
| 页面 / 入口 | `BookOpen`                |
| 搜索      | `Search`                  |
| 新建      | `Plus`                    |
| 编辑      | `Plus`（`rotate-45`）       |
| 删除      | `Trash2`                  |
| 分组      | `Users`                   |
| Agent   | `Bot`                     |
| 加载      | `Loader2`（`animate-spin`） |



***

## 10. 常量与配置



```
// experience-service.ts

EXPERIENCE\\\_PROMPT\\\_MAX\\\_ENTRIES = 6     // 最多注入条数

EXPERIENCE\\\_PROMPT\\\_TOKEN\\\_BUDGET = 1500  // 注入 token 预算

MAX\\\_EXTRACTION\\\_CANDIDATES = 3           // 单次提取最多候选数

MAX\\\_ACTIVE\\\_EXPERIENCES\\\_PER\\\_AGENT = 200  // 单 Agent 最多活跃经验数

COLD\\\_ASSET\\\_DAYS = 30                     // 冷资产阈值（天）

// 字段长度限制（zod 校验）

title: max 80

trigger: max 200

content: max 8000

tags: max 10 个，每个 max 32
```



***

## 11. 交互流程

### 11.1 新建经验



1. 点「新建」→ `openCreate()` 初始化 EditState（mode='create', kind='experience', active=true）

2. Dialog 打开，填写 kind/title/trigger/content/tags

3. 点「保存」→ `save()`：tags split → `createExperience()` → POST API

4. 成功：关闭 Dialog + `refresh()` 重新拉取列表和统计

### 11.2 编辑经验



1. hover 卡片 → 点编辑按钮（Plus rotate-45）→ `openEdit(item)` 填充表单

2. 修改字段（edit 模式多一个 active checkbox）

3. 点「保存」→ `updateExperience(id, patch)` → PATCH API

4. 成功：关闭 Dialog + `refresh()`

### 11.3 启用 / 停用



1. hover 卡片 → 点 BookOpen 按钮 → `toggleActive(item)`

2. 直接 PATCH `{ active: !item.active }`，无确认 Dialog

3. 成功后本地更新 items 中对应项的 active 状态（不 refresh）

### 11.4 删除



1. hover 卡片 → 点 Trash2 → `setDeleteTargetId(item.id)`

2. 删除确认 Dialog 打开，显示标题

3. 点「删除」→ `confirmDelete()` → DELETE API

4. 成功后本地 `items.filter(it => it.id !== id)` 移除（不 refresh）

### 11.5 搜索



1. 输入搜索词 → 更新 `query` state

2. `filtered = useMemo` 在 items 上前端过滤（标题 + 触发条件 + 内容 + 标签，小写 includes）

3. 按 Enter 可触发 `refresh()`（但当前搜索是前端的，Enter 实际无额外效果）

### 11.6 分类筛选



1. 点 kind 按钮 → `setKindFilter(kind)`

2. `useEffect` 监听 kindFilter → `refresh()` 传 kind 参数到 API

3. 列表和统计重新拉取

### 11.7 分组切换



1. 点「分组」按钮 → toggle `groupByAgent`

2. `groups = useMemo` 按 agentId 分组排序

3. 渲染分组头 + 组内卡片



***

## 12. 文件清单



| 文件                                         | 职责                                                             |
| ------------------------------------------ | -------------------------------------------------------------- |
| `src/components/experience-library.tsx`    | 资产库主页面组件（列表 / 搜索 / 筛选 / 新建 / 编辑 / 删除 / 分组）                     |
| `src/components/workbench-navigation.ts`   | 侧栏导航配置（加「资产」项）                                                 |
| `src/components/app-workbench.tsx`         | 视图分发（import + render experiences）                              |
| `src/stores/app-store.ts`                  | `AppWorkbenchView` 类型（加 'experiences'）                         |
| `src/components/settings-dialog.tsx`       | 设置面板经验资产开关（通知 tab）                                             |
| `src/components/agent-run-debug-board.tsx` | 调试面板沉淀经验按钮 + 注入指标                                              |
| `src/lib/api.ts`                           | 前端 API 封装（fetchExperiences/create/update/delete/reflect/stats） |
| `src/app/api/experiences/route.ts`         | GET 列表 + POST 新建                                               |
| `src/app/api/experiences/stats/route.ts`   | GET 统计                                                         |
| `src/app/api/experiences/[id]/route.ts`    | PATCH 更新 + DELETE 删除                                           |
| `src/app/api/runs/[id]/reflect/route.ts`   | POST 手动反思沉淀                                                    |
| `src/server/experience-service.ts`         | 服务层（CRUD / 统计 / 注入构建 / 自动提取 / FTS 搜索）                          |
| `src/server/agent-runner.ts`               | finalizeOk 异步提取 + buildAdapterInput 注入                         |
| `src/db/schema.ts`                         | experiences 表 + 类型 + 索引                                        |
| `src/db/migrate-add-experiences.ts`        | 建表迁移                                                           |
| `src/db/migrate-add-experiences-fts.ts`    | FTS5 索引迁移                                                      |
| `specs/20-experience-assets.md`            | 设计提案                                                           |
| `skills/add-experience.md`                 | 实现配方 + 坑点记录                                                    |



***

## 14. 窗口页详细规格

> 本章逐个拆解资产功能涉及的所有弹窗 / 窗口页，含布局图、字段表、按钮状态与交互细节。

### 14.1 新建 / 编辑经验 Dialog

**触发**：点「新建」按钮（`openCreate()`）或卡片 hover 后的编辑按钮（`openEdit(item)`）。

**组件**：`Dialog` + `DialogContent className="sm:max-w-md"`（中等宽度）。

**关闭**：点遮罩 / X / 取消按钮 → `setEdit(null)`；保存成功后也自动关闭。

#### 布局图



```
┌─ 手动沉淀经验 ────────────────────────────────┐  ← DialogTitle

│ 手动录入一条可复用的经验，将按触发条件注入后续     │  ← DialogDescription

│ Agent 任务的系统提示。                            │

│                                                  │

│ \[经验] \[反思] \[画像]    ← kind 切换按钮组        │

│                                                  │

│ 标题（≤80 字）                         \[输入框]   │

│ 触发条件：何时适用（≤200 字）          \[输入框]   │

│ 经验正文（≤8000 字）                  \[多行文本]  │

│ 标签，逗号分隔                         \[输入框]   │

│                                                  │

│ ☑ 启用（注入 Agent 上下文）    ← 仅 edit 模式显示 │

│                                                  │

│                          \[取消]  \[保存]          │  ← DialogFooter

└──────────────────────────────────────────────────┘
```

#### 字段规格表



| 字段      | 组件                | 占位符                 | 默认值            | 必填 | 校验                                            | 显示条件          |
| ------- | ----------------- | ------------------- | -------------- | -- | --------------------------------------------- | ------------- |
| kind    | 3 个 Button 切换     | —                   | `'experience'` | 是  | enum: experience/reflection/profile\_fact     | 始终            |
| title   | Input             | `标题（≤80 字）`         | `''`           | 是  | min 1, max 80                                 | 始终            |
| trigger | Input             | `触发条件：何时适用（≤200 字）` | `''`           | 是  | min 1, max 200                                | 始终            |
| content | Textarea (rows=6) | `经验正文（≤8000 字）`     | `''`           | 是  | min 1, max 8000                               | 始终            |
| tags    | Input             | `标签，逗号分隔`           | `''`           | 否  | split 中英文逗号 → trim → 去空 → 最多 10 个 → 每个 ≤32 字符 | 始终            |
| active  | checkbox + label  | `启用（注入 Agent 上下文）`  | `true`         | 否  | boolean                                       | **仅 edit 模式** |

#### kind 切换按钮



```
{(\['experience', 'reflection', 'profile\_fact'] as const).map((kind) => (

&#x20; \<Button type="button" size="sm"

&#x20;   variant={edit.kind === kind ? 'secondary' : 'outline'}

&#x20;   className="h-7 text-xs"

&#x20;   onClick={() => setEdit({ ...edit, kind })}>

&#x20;   {KIND\_LABEL\[kind]}

&#x20; \</Button>

))}
```



* 选中：`variant="secondary"`；未选中：`variant="outline"`

* 尺寸：`h-7 text-xs`

* 三个按钮横排，`flex gap-2`

#### 底部按钮



| 按钮 | variant | 尺寸 | disabled 条件                                                           | 行为                            |
| -- | ------- | -- | --------------------------------------------------------------------- | ----------------------------- |
| 取消 | ghost   | sm | 无                                                                     | `setEdit(null)`               |
| 保存 | default | sm | `saving \|\| !title.trim() \|\| !trigger.trim() \|\| !content.trim()` | `save()` → API → 关闭 + refresh |



* 保存中：按钮内显示 `Loader2 size-3 animate-spin`（无文字）

* 保存按钮在右侧，取消在左侧（`DialogFooter` 默认右对齐）

#### 保存逻辑（save ()）



```
1\. setSaving(true)

2\. tags 处理：split(/\[,，]/) → map(trim) → filter(Boolean) → slice(0,10)

3\. 构造 body = { kind, title, trigger, content, tags }

4\. mode === 'create' → createExperience({ ...body, agentId })  → POST /api/experiences

&#x20;  mode === 'edit'   → updateExperience(id, { ...body, active }) → PATCH  /api/experiences/{id}

5\. 成功：setEdit(null) + refresh()

6\. 失败：console.error，不关闭 Dialog（用户可修正后重试）

7\. finally: setSaving(false)
```

#### create 与 edit 的差异



| 差异点               | create       | edit                   |
| ----------------- | ------------ | ---------------------- |
| DialogTitle       | 手动沉淀经验       | 编辑经验                   |
| DialogDescription | 手动录入… 注入系统提示 | 修改经验内容与启用状态            |
| id                | `null`       | 经验 id                  |
| active 字段         | 不显示（固定 true） | 显示 checkbox            |
| tags 初始值          | `''`         | `item.tags.join(', ')` |
| 其他字段初始值           | 空字符串         | 从 item 填充              |
| API               | POST         | PATCH                  |



***

### 14.2 删除确认 Dialog

**触发**：卡片 hover 后点删除按钮（Trash2）→ `setDeleteTargetId(item.id)`。

**组件**：`Dialog` + `DialogContent className="sm:max-w-sm"`（小宽度，比编辑 Dialog 窄）。

**关闭**：点遮罩 / X / 取消 → `setDeleteTargetId(null)`；删除成功后自动关闭。

#### 布局图



```
┌─ 删除经验？ ───────────────┐

│ 「{经验标题}」将被永久删除，  │

│ 无法恢复。                   │

│                             │

│              \[取消] \[删除]   │

└─────────────────────────────┘
```

#### 规格



| 元素                | 内容                                    | 样式                                                                          |
| ----------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| DialogTitle       | `删除经验？`                               | 默认                                                                          |
| DialogDescription | `「{deleteTarget?.title}」将被永久删除，无法恢复。` | `text-muted-foreground`                                                     |
| 取消按钮              | `取消`                                  | `variant="ghost" size="sm"` → `setDeleteTargetId(null)`                     |
| 删除按钮              | 删除中显示 `Loader2`，否则显示 `删除`             | `variant="destructive" size="sm"`，`disabled={deleting}` → `confirmDelete()` |

#### 删除逻辑（confirmDelete ()）



```
1\. setDeleting(true)

2\. deleteExperience(deleteTargetId) → DELETE /api/experiences/{id}

3\. 成功：setItems(prev => prev.filter(it => it.id !== deleteTargetId))

&#x20;  （本地移除，不重新拉取列表；stats 不会自动刷新，下次进入页面时更新）

4\. 失败：console.error，不关闭

5\. finally: setDeleting(false); setDeleteTargetId(null)
```



***

### 14.3 设置面板 — 经验资产区块

**位置**：设置 Dialog → 通知（notifications）tab → 经验资产 section。

**文件**：`src/components/settings-dialog.tsx`（约 391-402 行）。

#### 布局图



```
┌─ 经验资产 ──────────────────────────────────────┐

│ 📖 经验资产                                        │

│ run 收尾后自动反思沉淀可复用经验；关闭后仍可手动沉淀。 │

│ ┌──────────────────────────────────────────────┐ │

│ │ ☑ 自动反思沉淀经验                              │ │

│ └──────────────────────────────────────────────┘ │

└──────────────────────────────────────────────────┘
```

#### 规格



| 元素    | 内容                                      | 说明                                              |
| ----- | --------------------------------------- | ----------------------------------------------- |
| 容器    | `rounded-xl border bg-muted/30 p-3`     | 与其他设置区块统一                                       |
| 图标    | `BookOpen size-4 text-muted-foreground` | 左侧                                              |
| 标题    | `经验资产`                                  | `text-sm font-medium`                           |
| 描述    | `run 收尾后自动反思沉淀可复用经验；关闭后仍可手动沉淀。`         | `text-[11px] text-muted-foreground`             |
| 复选框容器 | `rounded-md border bg-background p-2`   | 内嵌                                              |
| 复选框   | `CheckboxRow label="自动反思沉淀经验"`          | 绑定 `form.experienceExtractionEnabled`，默认 `true` |

#### 数据流转



```
form.experienceExtractionEnabled (state, 默认 true)

&#x20; → 保存时 PATCH /api/settings { experienceExtractionEnabled }

&#x20; → app\_settings 表 experience\_extraction\_enabled 字段

&#x20; → agent-runner finalizeOk 读取该值决定是否触发自动提取

&#x20; → 关闭后：自动沉淀停止，手动沉淀（调试面板按钮）仍可用
```



***

### 14.4 调试面板 — 沉淀经验按钮 + 结果 Toast

**位置**：运行展板（Run Board）→ 选中已完成 Run → 顶部操作栏。

**文件**：`src/components/agent-run-debug-board.tsx`（约 743-754 行按钮，507-525 行逻辑）。

#### 按钮布局



```
┌─ Run 详情页顶部操作栏 ─────────────────────────┐

│ ...                                              │

│ \[📖 沉淀经验]  \[💬 回到会话]  \[其他按钮...]      │

└──────────────────────────────────────────────────┘
```

#### 按钮规格



| 属性       | 值                                                          |
| -------- | ---------------------------------------------------------- |
| 组件       | `Button type="button"`                                     |
| variant  | `outline`                                                  |
| 尺寸       | `sm`，`className="gap-1.5"`                                 |
| 图标       | 正常：`BookOpen size-3.5`；反思中：`Loader2 size-3.5 animate-spin` |
| 文字       | `沉淀经验`                                                     |
| disabled | `!selectedRun \|\| reflectingRun`（未选中 Run 或正在反思）           |
| title    | `对选中的 Run 立即执行反思，提炼可复用经验写入资产库`                             |
| onClick  | `reflectSelectedRun()`                                     |

#### 反思逻辑（reflectSelectedRun ()）



```
1\. setReflectingRun(true)

2\. triggerExperienceReflection(selectedRun.id) → POST /api/runs/{id}/reflect

3\. 成功：

&#x20;  \- result.saved > 0 → Toast 成功：\`已沉淀 {saved} 条经验\`

&#x20;  \- result.saved === 0 → Toast 提示：\`未沉淀经验\`（门槛未满足或无候选）

4\. 失败：Toast 错误：\`沉淀经验失败\`

5\. finally: setReflectingRun(false)
```

#### 结果 Toast 规格



| 场景         | Toast 类型       | 标题            |
| ---------- | -------------- | ------------- |
| 沉淀成功（≥1 条） | success        | `已沉淀 {N} 条经验` |
| 无沉淀（0 条）   | info / warning | `未沉淀经验`       |
| 失败         | error          | `沉淀经验失败`      |



***

### 14.5 调试面板 — 经验注入指标

**位置**：运行展板 → Run 详情 → VariablesPanel（变量面板）→ 指标行。

**文件**：`src/components/agent-run-debug-board.tsx`（约 2484 行）。

#### 布局



```
┌─ VariablesPanel ──────────────┐

│ 系统提示    N 字符              │

│ 工具        N 个                │

│ 经验        N 条注入    ← 新增  │

│ ...                            │

└────────────────────────────────┘
```

#### 规格



```
\<PanelMetric label="经验" value={\`\${snapshot.context.experienceCount ?? 0} 条注入\`} />
```



| 属性    | 值                                                                                        |
| ----- | ---------------------------------------------------------------------------------------- |
| label | `经验`                                                                                     |
| value | `` `${snapshot.context.experienceCount ?? 0} 条注入` ``                                     |
| 数据来源  | Run 的 debug snapshot → `context.experienceCount`（agent-runner 在 buildAdapterInput 注入后记录） |
| 用途    | 验证当前 Run 实际注入了几条经验；>0 表示注入生效                                                             |



***

### 14.6 窗口 / 页面关系总览



```
资产库主页（ExperienceLibrary）

├── 统计条（只读展示）

├── 搜索+筛选+操作条

│   └── \[新建] → 14.1 新建/编辑 Dialog（create 模式）

├── 列表区

│   └── 经验卡片（hover 显示操作按钮）

│       ├── \[启用/停用] → 直接 PATCH，无窗口

│       ├── \[编辑] → 14.1 新建/编辑 Dialog（edit 模式）

│       └── \[删除] → 14.2 删除确认 Dialog

├── 14.1 新建/编辑 Dialog

└── 14.2 删除确认 Dialog

关联窗口（不在资产库主页内，但属于经验资产功能）

├── 14.3 设置 Dialog → 通知 tab → 经验资产区块（自动沉淀开关）

├── 14.4 调试面板 → 沉淀经验按钮 + 结果 Toast（手动沉淀）

└── 14.5 调试面板 → VariablesPanel → 经验注入指标（注入验证）
```



***

## 13. 制作同类页面的检查清单

给其他 AI / 开发者参考：制作一个类似的 "资产库 / 列表管理" 页面时，确保覆盖以下点：

### 布局



* [ ] 父容器 `h-full flex flex-col`，列表区 `min-h-0 flex-1` + ScrollArea

* [ ] 顶部固定区（统计 + 搜索操作条）用 `shrink-0`

* [ ] 空状态、加载状态、无匹配状态三种分支都处理

### 列表项



* [ ] hover 显示操作按钮（`opacity-0 group-hover:opacity-100`）

* [ ] 标题 / 触发条件单行 truncate，正文 line-clamp-2

* [ ] 标签最多显示 N 个，超出省略

* [ ] 底部元信息（使用次数 / 时间 / 来源）

* [ ] 停用态整体降透明度

### 表单 Dialog



* [ ] create/edit 复用同一个 Dialog，通过 mode 区分标题和字段

* [ ] 保存按钮 disabled 条件覆盖所有必填字段 + saving 状态

* [ ] 标签输入用逗号分隔字符串，保存时 split/trim/ 过滤 / 截断

* [ ] edit 模式比 create 多 active 开关

### 删除



* [ ] 二次确认 Dialog，显示目标标题

* [ ] 删除中按钮 loading 态

### 数据



* [ ] 列表 + 统计并行加载（Promise.all）

* [ ] kind 筛选变化触发重新拉取（useEffect）

* [ ] 搜索优先前端过滤（避免频繁 API）

* [ ] 保存 / 删除后正确刷新（保存 refresh，删除可本地移除）

### API



* [ ] zod strict 校验请求体，不接受额外字段

* [ ] source/createdAt 等服务端字段不接受客户端传入

* [ ] 404 处理（PATCH/DELETE 不存在的 id）

* [ ] 字段长度限制与 DB schema 一致

### 入口接入



* [ ] 导航配置加项（label/icon/group/description）

* [ ] 视图联合类型加值

* [ ] 视图渲染分发加 case

* [ ] 三者必须同步修改，缺一不可