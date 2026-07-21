# AgentHub 自动化能力嵌入实施计划书

## 1. 目标背景

AgentHub 已具备多 Agent 会话、Orchestrator 调度、工具调用、产物生成、Workspace 沙箱、SSE 事件和 SQLite 持久化能力。当前“自动化”页面仍以静态模拟数据展示任务卡、运行记录和趋势概览，尚未形成后端数据闭环。

本计划目标是补齐自动化能力的项目内嵌路线，并先落地一个可联调的最小切片：自动化任务定义与运行记录进入 SQLite，前端自动化页面通过后端 API 获取真实数据，后续再接入手动触发、定时调度、事件触发和真实 Agent 执行。

## 2. 实施范围

### 本阶段范围

- 新增自动化任务定义表与运行记录表。
- 新增自动化看板服务与 `GET /api/automations` 接口。
- 将自动化页面中的统计、任务列表、近期运行记录、运行趋势替换为后端接口数据。
- 保持现有前端样式、主题、布局和主要交互入口不变。
- 保留一组后端 seed 数据，使首次启动即可完成前后端联调。

### 暂不纳入本阶段

- 自动化任务完整 CRUD。
- 手动触发后真实启动 Agent run。
- 定时调度器。
- Webhook / MCP 外部触发。
- 通知推送、邮件、IM 集成。
- 引入 Temporal、n8n、Windmill 等外部工作流引擎。

## 3. 自动化目标与适用场景

### 自动化目标

- 将重复性 Agent 任务保存为可管理的自动化定义。
- 将每次自动化执行过程沉淀为运行记录，支持状态追踪和回溯。
- 复用现有 AgentRunner、Orchestrator、工具系统、审批和 Workspace 沙箱，避免新增一套独立执行体系。
- 为后续定时任务、事件触发、Webhook、MCP 触发提供统一数据模型。

### 适用场景

- 每日信息整理：AI 新闻、行业摘要、历史上的今天。
- 学习提醒：每日单词、阅读计划、知识卡片。
- 项目协作：周报、Issue/PR 汇总、代码质量巡检。
- 内容生产：电影推荐、选题整理、文档草稿生成。
- 本地工作流：基于 Workspace 的定期检查、构建、报告生成。

## 4. 技术方案

### 推荐方案：自研轻量 AutomationService

第一阶段采用项目内自研 `AutomationService`，而不是直接引入通用工作流引擎。

原因：

- AgentHub 是本地运行 + SQLite + Electron 形态，轻量服务更符合部署模型。
- 项目已有 AgentRunner、ConversationService、ToolRegistry、审批和沙箱机制，自动化应复用这些能力。
- 外部工作流引擎会引入额外运行时、权限模型、存储模型和维护成本。
- 当前最需要的是数据闭环和 UI 联调，而不是复杂 DAG 编排。

### 后续可扩展方案

当自动化能力进入高频使用后，可按需扩展：

- 调度层：Node 内置 timer / cron 表达式解析。
- 触发层：Webhook、文件变更、MCP server event。
- 执行层：`AutomationService.runAutomation()` 创建消息并调用 `AgentRunner.run()`。
- 事件层：复用 EventBus / SSE 推送运行状态。
- 审批层：复用现有 `fs_write`、`bash`、Orchestrator plan review。

## 5. 前端改造步骤

1. 在 `src/lib/api.ts` 新增自动化 DTO 类型与 `fetchAutomationDashboard()`。
2. 在 `AutomationWorkspace` 中新增 dashboard state、loading state、error state。
3. 页面进入后调用 `GET /api/automations`。
4. 将统计卡硬编码值替换为 `dashboard.stats`。
5. 将任务卡静态数组替换为 `dashboard.automations`。
6. 将近期运行记录替换为 `dashboard.recentRuns`。
7. 将运行趋势替换为 `dashboard.trend`。
8. 增加小型映射函数：
   - 英文状态映射为中文状态。
   - `iconKey` 映射为 Lucide 图标与现有颜色类。
   - 时间戳和耗时格式化为现有短文本。
9. 保留当前组件结构、className、主题变量、卡片布局和“添加”按钮视觉。

## 6. 后端改造步骤

1. 在 Drizzle schema 中新增 `automations` 与 `automation_runs`。
2. 在 DB bootstrap DDL 中新增对应建表、索引和幂等 seed。
3. 新增 `src/server/automation-service.ts`：
   - 查询自动化定义。
   - 查询最近运行记录。
   - 聚合统计指标。
   - 聚合运行趋势。
   - 输出稳定 DTO。
4. 新增 `src/app/api/automations/route.ts`，实现 `GET /api/automations`。
5. 同步更新数据库规格文档。

## 7. 接口对接方式

### GET `/api/automations`

响应结构：

```ts
{
  dashboard: {
    stats: {
      enabledCount: number
      todayRunCount: number
      successRate: number
      pendingCount: number
    }
    automations: Array<{
      id: string
      title: string
      description: string
      category: string
      cadence: string
      latestRunAt: number | null
      status: 'enabled' | 'running' | 'draft' | 'paused'
      iconKey: 'newspaper' | 'languages' | 'calendar_clock' | 'video' | 'history'
    }>
    recentRuns: Array<{
      id: string
      automationId: string
      title: string
      category: string
      status: 'success' | 'failed' | 'running'
      durationMs: number | null
      startedAt: number
      finishedAt: number | null
    }>
    trend: Array<{
      label: string
      value: number
    }>
  }
}
```

GET 接口无请求体。后续新增 POST / PATCH / trigger 接口时，再使用 zod 校验跨进程输入。

## 8. 数据流转逻辑

1. 应用启动时执行 DB bootstrap。
2. bootstrap 创建自动化相关表，并在表为空时插入初始自动化任务和运行记录。
3. 用户进入自动化页面。
4. 前端调用 `fetchAutomationDashboard()`。
5. API route 调用 `getAutomationDashboard()`。
6. `AutomationService` 从 SQLite 查询任务定义和运行记录。
7. 服务层聚合启用任务、今日运行、成功率、待处理数量和趋势。
8. API 返回 dashboard DTO。
9. 前端映射 DTO 并渲染现有自动化页面。

后续真实执行阶段的数据流：自动化触发器产生 trigger event，`AutomationService` 创建或复用会话消息，调用 `AgentRunner.run()`，运行状态写入 `automation_runs`，并通过 SSE 推送给前端。

## 9. 测试与联调计划

### 命令验证

```bash
pnpm typecheck
pnpm lint
pnpm db:push
```

### API 联调

- 启动应用后访问 `GET /api/automations`。
- 确认返回 `dashboard.stats`、`dashboard.automations`、`dashboard.recentRuns`、`dashboard.trend`。
- 确认首次启动有 seed 数据。
- 确认重复启动不会重复插入 seed。

### 前端联调

- 打开自动化页面，确认统计卡展示来自接口。
- 确认任务卡列表来自接口且样式不变。
- 确认最近运行记录来自接口。
- 确认运行概览趋势来自接口。
- 模拟 API 失败时页面不崩溃，显示当前主题一致的错误提示。
- 刷新页面后数据仍可展示。

### 回归检查

- Agent 库、产物库、会话页不受影响。
- 分析页若仍使用静态数据，应保持原行为。
- DB schema 与 bootstrap 保持一致。

## 10. 风险点及应对措施

| 风险 | 影响 | 应对 |
|---|---|---|
| schema 与 bootstrap 不一致 | Electron 首次启动或开发 DB 推送失败 | 同步修改 `schema.ts`、`bootstrap.ts`、规格文档，并运行 `pnpm db:push` |
| 前端视觉变化 | 影响现有页面体验 | 只替换数据来源，保留 className 和组件结构 |
| seed 数据重复 | 统计和列表异常 | seed 前检查 `automations` 是否为空 |
| 统计口径不清 | 展示与预期不一致 | 本阶段固定为看板展示口径，后续执行阶段再扩展 |
| 自动化范围膨胀 | 改造不可控 | 本阶段只做持久化/API/UI 联调，不实现调度和真实执行 |
| 后续触发器权限边界复杂 | 可能绕开审批或沙箱 | 后续执行必须复用 `ConversationService`、`AgentRunner`、ToolRegistry 和现有审批机制 |

## 11. 实施阶段安排

### 阶段一：数据闭环与页面联调

交付自动化任务定义表、运行记录表、看板 API、前端真实数据展示和实施计划文档。当前已完成该阶段。

### 阶段二：自动化任务管理与计划调度

扩展自动化任务配置字段，增加创建、编辑、启停、删除能力；前端补充表单和详情页；所有请求体使用 zod 校验。增加 `schedule_type`、`schedule_config`、`next_run_at`、`prompt`、目标会话/Agent 绑定和运行日志，支持手动触发与本地轻量 scheduler 扫描 due 任务。

### 阶段三：Agent 执行链路增强

完善 `runAutomation()` 与现有会话消息、AgentRunner、Orchestrator 的关联，补充执行过程中的 AgentRun 回填、运行中状态同步、审批等待状态和用户可见结果链接。

### 阶段四：调度与事件触发增强

增加定时调度、Webhook、MCP 触发、文件事件触发，并完善并发控制、失败重试和审计记录。

### 阶段五：运行分析与治理

扩展成功率、耗时、失败原因、Agent 使用量、产物输出、审批等待等分析能力。

## 12. 交付成果

本阶段交付：

- 自动化任务结构化计划字段：`prompt`、`schedule_type`、`schedule_config`、`next_run_at`、目标 Agent/会话绑定。
- `automation_run_logs` 运行日志表。
- 自动化任务创建、编辑、启停、删除和手动运行 API。
- 本地轻量 scheduler 与 due task 扫描。
- 前端自动化创建/编辑表单、任务操作按钮和运行历史展示。
- 数据库规格文档同步。
- 通过 typecheck、lint、测试和 DB bootstrap/db push 验证。

## 13. 推荐实施路径

推荐按“文档与规格 → DB → service → API → 前端 → 验证”的顺序推进。这样可以先锁定数据契约，再逐层接入，避免 UI 先行造成 DTO 反复调整。当前阶段完成后，再评估是否进入任务 CRUD 和真实 Agent 执行阶段。
