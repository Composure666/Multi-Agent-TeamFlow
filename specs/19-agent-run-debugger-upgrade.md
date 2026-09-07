# Spec 19 — Agent Run Debugger 升级开发文档

## 1. 文档结论

本升级方向可行，但不能只按“页面改版”处理。现有运行展板的数据基础是 `agent_runs`、`agent_run_debug_snapshots`、`messages.parts` 和由前端投影出的 Tool Trace；它可以支撑 Header、运行记录、阶段条、基础 Tool/Logs/Output 展示，但无法完整支撑文档中提出的实时 `Run -> Task -> Agent -> Step/Tool/Event` 调试体验。

因此建议分两层落地：

- 短期：基于现有数据完成运行检查器的信息架构、Inspector、Timeline 静态投影与交互联动。
- 中期：新增运行事件持久化与任务/步骤追踪模型，再实现真正实时的 Agent Task Graph、Event Timeline、异常自动定位和数据概览 Drill-down。

第一版建议优先交付 MVP 1 + MVP 2：让用户看懂任务如何拆分、分配给哪个 Agent、每个 Agent 调用了哪些工具，以及失败时应该看哪里。

## 2. 当前能力基线

现有代码已具备：

- 运行调试入口与运行记录列表。
- Sticky Run Header，显示会话标题、Run 状态、耗时、Token、模型与操作按钮。
- ReactFlow 阶段式画布：触发、上下文、规划、执行、产出。
- 底部面板：Output、Logs、Tool Trace、Variables、Artifacts、History。
- 从 `MessagePart` 投影 Tool Trace、Artifact、Plan Tasks、Task Result、Timeline。
- 运行时快照 `AgentRunDebugSnapshot`，记录 agent、workspace、prompt 统计、context、tools、attachments。

现有代码暂不具备：

- 独立的 Task、Step、TerminalEvent、RunEvent 持久化表。
- 每个工具调用的准确开始/结束时间、耗时和所属 Step。
- Agent 内部 Step 的稳定事件来源。
- 真正实时的运行调试事件流回放。
- 数据概览到具体 Run/Agent/Tool 事件的深链接。
- 交互式 Terminal。

## 3. 功能可行性与难度评估

| 功能 | 可行性 | 难度 | 原因与约束 | 建议阶段 |
|---|---|---:|---|---|
| Run Header Overview 重构 | 高 | 低 | 现有 run list/detail 已有状态、耗时、usage、model；主要是 UI 调整 | MVP 1 |
| Header Sticky | 高 | 低 | 当前已有 sticky 结构，继续优化即可 | MVP 1 |
| 左侧 Run History 保持可见并增强筛选 | 高 | 中 | 当前列表按会话展示 run；需要增加状态筛选和时间范围过滤 | MVP 1 |
| Stage Bar 轻量化 | 高 | 低 | 现有阶段数据可直接压缩成轻量状态条 | MVP 1 |
| Agent Task Graph | 中高 | 中 | 可先从 `plan_tasks` 和 `childrenRuns` 投影；但准确状态依赖 dispatch 事件与子 run 关系 | MVP 1 |
| Agent Card 指标 | 中高 | 中 | duration/status 可来自 child run；tool count/token 需要从消息 parts 或 usage 聚合，第一版允许估算 | MVP 1 |
| Agent Inspector 固定右侧栏 | 高 | 中 | 前端结构改造为三栏布局，复用现有 Bottom Panel 内容 | MVP 2 |
| Inspector Tabs：Terminal / Logs / Tools / Variables / Messages / Artifacts | 中高 | 中 | Tools/Variables/Messages/Artifacts 已有来源；Terminal 第一版只能做 Terminal Log 展示 | MVP 2 |
| Terminal Log | 中 | 中 | 可展示 bash/codex_command 输出摘要；真实实时 shell 输出需 adapter/tool 层补事件 | MVP 2 |
| Flow / Inspector / Timeline 三联动 | 高 | 中 | 前端状态选择模型即可做；精确定位到 Step 依赖新事件字段 | MVP 2 |
| 底部 Event Timeline | 中高 | 中 | 可先由 messages.parts 投影静态 timeline；实时与精确时间需新事件表 | MVP 2 / MVP 3 |
| SSE 实时调试事件流 | 中 | 高 | 当前已有 StreamEvent/SSE，但需新增事件类型、store reducer、持久化策略 | MVP 3 |
| TaskCreated / StepStarted / ToolCalled 等新事件 | 中 | 高 | 涉及 `src/shared/types.ts`、adapter 翻译、AgentRunner、spec、测试 | MVP 3 |
| Variables 深度调试 | 中 | 高 | 当前仅有 context 快照统计；真实变量需定义来源、脱敏规则、存储边界 | MVP 4 |
| 失败 Run 自动聚焦错误节点 | 中高 | 中 | 基于 run.status/tool_result.isError 可做；精确到 Step 需事件模型 | MVP 4 |
| 数据概览 Drill-down 到 Run/Agent/Tool | 中 | 中高 | 需要 URL/state target 支持 agent/tool filters 和事件定位 | MVP 4 |
| Replay | 低到中 | 高 | 现有 Spec 17 明确非目标；涉及 prompt、上下文、工具副作用与安全审批 | 后续 |
| Run 对比 | 中 | 高 | 需要稳定的 run event schema 与指标聚合 | 后续 |
| 交互式 Terminal | 低到中 | 高 | 涉及真实进程会话生命周期、权限、输入输出通道、安全控制 | 后续 |

## 4. 推荐信息架构

运行调试页保留在“分析”一级模块下，与数据概览并列：

- 数据概览：回答“所有 Run 的整体表现如何，哪里值得关注？”
- 运行调试：回答“这一次 Run 发生了什么，为什么会这样？”

页面结构：

```text
顶部 Run Header
左侧 Run History
中央 Agent Task Graph
右侧 Agent Inspector
底部 Event Timeline
```

主工作流：

```text
看 Run 状态
-> 看任务拆分
-> 看 Agent 分配
-> 看当前 Step / Tool
-> 定位异常
-> 查看输出结果
```

## 5. MVP 1：任务链可见

### 5.1 目标

把中央画布从“阶段流程图”升级为“任务链 + Agent 卡片”，让用户能看懂 Orchestrator 如何拆任务、哪些 Agent 被分配、当前运行到哪里。

### 5.2 数据来源

第一版不新增 DB 表，使用现有数据投影：

- `agentRun`: 当前 run 基础状态。
- `snapshot.agent`: 当前 run 的 agent/model。
- `childrenRuns`: 子 Agent run。
- `messages.parts.tool_use(plan_tasks)`: 任务拆分计划。
- `messages.parts.tool_use/report_task_result`: 子任务结果。
- `messages.parts.tool_use/tool_result`: 工具调用统计。

### 5.3 前端投影模型

新增或扩展前端投影类型：

```ts
interface RunDebuggerGraph {
  run: RunNode
  orchestrator: AgentNode | null
  tasks: TaskNode[]
  agents: AgentNode[]
  edges: GraphEdge[]
}

interface TaskNode {
  id: string
  title: string
  agentId: string
  dependsOn: string[]
  status: 'waiting' | 'running' | 'completed' | 'failed' | 'blocked'
  source: 'plan_tasks' | 'child_run' | 'inferred'
}

interface AgentNode {
  agentId: string
  name: string
  role: 'orchestrator' | 'worker'
  status: 'waiting' | 'running' | 'completed' | 'failed' | 'blocked'
  runId: string | null
  taskIds: string[]
  durationMs: number | null
  tokenTotal: number | null
  toolCallCount: number
}
```

### 5.4 UI 要求

- Stage Bar 压缩为轻量生命周期条，放在 Header 下方或画布上方。
- 中央 ReactFlow 节点改为 Orchestrator、Task、Agent。
- 不把所有 Tool 永久铺在画布上，Tool 只在 Agent 展开态或 Inspector 中展示。
- Running Agent 使用品牌色描边和轻量动态状态。
- Failed Agent 使用错误色，图加载后自动进入可见区域。
- Waiting/未执行节点降低视觉权重。

### 5.5 验收标准

- 有 `plan_tasks` 的 Run 能展示任务拆分与 Agent 分配。
- 有 `childrenRuns` 的 Run 能展示子 Agent 状态。
- 没有 plan 的旧 Run 不报错，回退为单 Agent 运行视图。
- 点击 Agent 节点后能选中并打开 Inspector。

## 6. MVP 2：Agent 可调试

### 6.1 目标

让每个 Agent 成为可进入的工作现场，用户点击 Agent 后能看到它做了什么、用了什么工具、产出了什么。

### 6.2 Inspector 布局

右侧固定 Inspector，不使用遮挡式弹窗。

```text
Header: Agent 名称 / 状态 / 关闭
Meta: Task / Duration / Tokens / Tool Calls / Model
Tabs: Terminal / Logs / Tools / Variables / Messages / Artifacts
Content: 当前 Tab 详情
```

### 6.3 Tab 数据策略

- Terminal：第一版展示命令类工具输出摘要，命名为“Terminal Log”，避免误导为可交互终端。
- Logs：文件、命令、网络、错误事件聚合。
- Tools：按时间顺序展示 tool input、output、duration、status；duration 缺失时显示 `-`。
- Variables：展示 snapshot context、workspace、prompt section 统计；不展示完整 prompt。
- Messages：展示触发消息、Agent 输出消息、关联子 run。
- Artifacts：展示 artifact ref、deploy status、deploy candidates。

### 6.4 交互联动

- 点击 Agent：中央节点高亮，Inspector 打开到该 Agent。
- 点击 Step：Inspector 打开 Logs 或 Tools 并定位对应条目；无 Step 数据时定位 Agent。
- 点击 Tool：Inspector 切换 Tools 并展开该调用。
- 点击 Timeline Event：中央画布定位关联节点，Inspector 打开关联详情。
- 关闭 Inspector：保留画布当前视野，不重置选择。

### 6.5 验收标准

- 用户从任一 Agent 节点进入 Inspector 不超过 1 次点击。
- Tool 错误能在 Tools/Logs 中以错误态展示。
- 长输出折叠，不撑爆右侧栏或底部 Timeline。
- 旧 Run 无 snapshot 时给出降级提示，仍展示可恢复的 run/message/tool 信息。

## 7. MVP 3：实时可观测

### 7.1 目标

让运行中的 Run 能实时更新 Task、Agent、Step、Tool、Timeline 状态，并在刷新页面后可回放事件。

### 7.2 新增事件模型

需要在现有 `StreamEvent` 基础上新增调试事件，建议命名保持项目现有风格：

```ts
type RunDebugEvent =
  | { type: 'run.debug.task.created'; runId: string; task: DebugTask }
  | { type: 'run.debug.task.assigned'; runId: string; taskId: string; agentId: string }
  | { type: 'run.debug.task.status'; runId: string; taskId: string; status: DebugTaskStatus; reason?: string }
  | { type: 'run.debug.step.started'; runId: string; taskId?: string; agentId: string; stepId: string; title: string }
  | { type: 'run.debug.step.completed'; runId: string; stepId: string; status: DebugStepEndStatus; error?: string }
  | { type: 'run.debug.tool.started'; runId: string; agentId: string; stepId?: string; toolCallId: string; toolName: string; argsSummary: string }
  | { type: 'run.debug.tool.completed'; runId: string; toolCallId: string; status: 'complete' | 'failed'; outputSummary: string; durationMs?: number }
  | { type: 'run.debug.terminal.output'; runId: string; agentId: string; toolCallId?: string; stream: 'stdout' | 'stderr'; text: string }
```

这些事件需要同步更新：

- `openspec/specs/stream-events/spec.md`
- `specs/02-stream-events.md`
- `src/shared/types.ts`
- SSE reducer 与 store
- 相关 adapter / tool 执行边界

### 7.3 新增持久化表

建议新增一张 append-only 事件表：

```ts
agent_run_debug_events {
  id              text PK
  conversation_id text NOT NULL
  run_id          text NOT NULL
  parent_run_id   text
  agent_id        text
  task_id         text
  step_id         text
  tool_call_id    text
  type            text NOT NULL
  status          text
  payload         text JSON NOT NULL
  created_at      int NOT NULL
}
```

索引：

- `(conversation_id, run_id, created_at)`
- `(run_id, agent_id, created_at)`
- `(run_id, task_id, created_at)`
- `(run_id, tool_call_id)`

### 7.4 API

新增：

```text
GET /api/conversations/:id/agent-runs/:runId/debug-events
```

返回：

```ts
{
  events: AgentRunDebugEventRecord[]
}
```

现有 debug detail 可增加 `events` 字段，但建议第一版独立接口，避免 detail payload 膨胀。

### 7.5 验收标准

- 运行中事件到达后 1 秒内更新画布、Inspector 或 Timeline。
- 刷新页面后可按时间顺序恢复 Timeline。
- 事件持久化失败不应中断 Agent run，但要记录 warning。
- 事件 payload 不保存密钥、完整 prompt、完整大文件内容。

## 8. MVP 4：深度调试与 Drill-down

### 8.1 故障自动定位

失败规则：

- Run 失败：定位第一个 failed task / failed agent / failed tool。
- Tool 失败：Inspector 自动打开 Tools 并展开失败调用。
- Blocked：必须展示 reason，例如等待依赖、缺少权限、用户未审批、MCP 工具等待授权。

### 8.2 数据概览联动

需要支持从数据概览页带参数进入运行调试页：

```ts
openRunBoardTarget({
  conversationId,
  runId,
  agentId?,
  taskId?,
  toolCallId?,
  eventId?,
  filter?
})
```

联动路径：

- Recent Run -> 对应 Run 调试页。
- Agent 排行 -> Run History 自动按 Agent 过滤。
- 失败率卡片 -> 最近失败 Run。
- 异常 Tool -> 打开对应 Run 并定位 Tool Event。

### 8.3 验收标准

- 从数据概览点击异常项后，运行调试页能自动选中对应 Run。
- 若传入 `toolCallId` 或 `eventId`，Inspector 能定位到对应详情。
- 若目标事件不存在，页面显示降级提示，不崩溃。

## 9. 非目标

以下能力不进入本轮实现：

- Run Replay。
- Run 对比。
- 交互式 Terminal 输入。
- 保存完整 prompt 文本。
- 保存密钥、认证 token、MCP resolved env value。
- 对旧 Run 补造完整 Step/Event 历史。
- 引入 WebSocket 替换现有 SSE。

## 10. 关键实现任务

### 阶段 A：文档与契约

- 新建 OpenSpec change，定义 Agent Run Debugger 升级。
- 更新 `agent-run-debugging` capability，补充 Task Graph、Inspector、Timeline 要求。
- 若实施 MVP 3，同步更新 stream-events、persistence、frontend specs。

### 阶段 B：前端投影与 UI

- 将 `agent-run-debug-board.ts` 从 Stage Projection 扩展为 Graph Projection。
- 将 `AgentRunDebugBoard` 布局调整为五区：Header、Run History、Task Graph、Inspector、Timeline。
- 增加选择状态：`selectedAgentId`、`selectedTaskId`、`selectedStepId`、`selectedToolCallId`、`selectedEventId`。
- 实现 Inspector Tabs 与定位逻辑。
- 保留旧 Run 降级展示。

### 阶段 C：筛选与可读性

- Run History 增加状态筛选与时间范围。
- Timeline 增加全部、Agent、Tools、错误筛选。
- 复杂图支持折叠 Agent 内部 Step。
- 长输出统一折叠与复制。

### 阶段 D：实时事件

- 新增 debug event 类型与持久化表。
- 在 AgentRunner、dispatch、tool 执行边界写入 debug events。
- SSE 推送 debug events。
- 前端 store 应用 debug events，并支持 refresh 后回放。

### 阶段 E：数据概览 Drill-down

- 扩展全局 run board target 状态。
- 数据概览各指标入口带上 run/agent/tool/event 过滤参数。
- 运行调试页消费参数并自动定位。

## 11. 测试策略

单元测试：

- Graph projection：有 plan、无 plan、依赖缺失、循环依赖、子 run 状态混合。
- Inspector projection：tool_use/result 配对、orphan result、错误工具、artifact、deploy。
- Timeline projection：消息、thinking、text、tool、artifact、deploy 顺序稳定。
- Debug event reducer：乱序、重复、缺字段降级。

服务层测试：

- debug detail 仍按 conversation scope 校验。
- debug events 只返回当前 conversation/run。
- debug event 写入失败不阻断 run。
- payload 脱敏规则生效。

UI 测试：

- 点击 Agent 打开 Inspector。
- 点击 Tool Event 定位 Tools tab。
- 失败 Run 自动打开错误详情。
- Run History 筛选工作正常。
- 长输出不破坏布局。

验证命令：

```bash
pnpm vitest run src/lib/agent-run-debug-board.test.ts src/lib/agent-run-debug-projection.test.ts
pnpm typecheck
pnpm lint
```

涉及 DB schema 时还需要：

```bash
pnpm db:push
```

## 12. 风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| Adapter 无 Step 事件 | 无法准确展示 Agent 内部步骤 | MVP 1/2 使用消息和工具调用投影，MVP 3 再补事件 |
| Tool 输出过大 | UI 卡顿或撑爆布局 | payload 摘要化、长输出折叠、事件列表虚拟滚动 |
| 旧 Run 数据不完整 | 无法构建 Task Graph | 单 Agent 降级视图，并提示“历史 Run 缺少调试事件” |
| 保存敏感数据 | 安全风险 | 延续 Spec 17 脱敏边界，只保存摘要与 env key 名 |
| 事件模型一次做太大 | 实现周期失控 | 先做 append-only debug events，不拆多张 task/step/tool 表 |
| 数据概览与调试页耦合过重 | 状态难维护 | 使用统一 `openRunBoardTarget` 入参，调试页内部消费 |

## 13. 建议确认点

进入实现前建议确认三件事：

1. 第一阶段是否按 MVP 1 + MVP 2 合并交付，先不做实时事件持久化。
2. Terminal 第一版是否明确命名为“Terminal Log”，只展示命令输出，不支持输入。
3. 是否接受新增 `agent_run_debug_events` append-only 表作为 MVP 3 的事件回放基础。

如果以上三点确认，可以先创建 OpenSpec change，再按阶段 A 到阶段 C 开发前端可见版本。
