# Spec 17 — Agent Run 调试面板

## 目标

Agent Run 调试面板用于回答“这次 run 到底用了什么输入与上下文”和“这次 run 的任务链是如何推进的”。面板以 `agent_runs.id` 为中心，展示运行状态、用量、agent/adapter/model、workspace、prompt section 统计、上下文注入、工具、外部 MCP、关联消息、任务拆分、Agent 分配与工具轨迹。

本能力保存运行时快照，并在 MVP 3 起追加保存运行调试事件，但不保存完整 prompt 文本、不保存密钥、不做 run replay。运行检查器可通过现有 `messages.parts`、`plan_tasks`、`childrenRuns`、debug snapshot 与 append-only debug events 投影任务链、Agent Inspector 和 Runtime Events。

---

## 数据模型

新增表：

```ts
agent_run_debug_snapshots {
  id              text PK           // rdbg_<nanoid>
  run_id          text NOT NULL FK→agent_runs.id ON DELETE CASCADE
  conversation_id text NOT NULL FK→conversations.id ON DELETE CASCADE
  agent_id        text NOT NULL FK→agents.id
  snapshot        text JSON NOT NULL // AgentRunDebugSnapshot
  created_at      int NOT NULL
}
UNIQUE INDEX idx_run_debug_run ON (run_id)
INDEX idx_run_debug_conv_created ON (conversation_id, created_at)
```

`run_id` 按 run 唯一：`recordAgentRunDebugSnapshot` 若发现已有 snapshot，应直接返回已有记录，避免重复写入。

```ts
agent_run_debug_events {
  id              text PK           // rde_<nanoid>
  conversation_id text NOT NULL FK→conversations.id ON DELETE CASCADE
  run_id          text NOT NULL FK→agent_runs.id ON DELETE CASCADE
  parent_run_id   text
  agent_id        text FK→agents.id
  task_id         text
  step_id         text
  tool_call_id    text
  type            text NOT NULL
  status          text
  payload         text JSON NOT NULL
  created_at      int NOT NULL
}
INDEX idx_run_debug_events_conv_run_created ON (conversation_id, run_id, created_at)
INDEX idx_run_debug_events_run_agent_created ON (run_id, agent_id, created_at)
INDEX idx_run_debug_events_run_task_created ON (run_id, task_id, created_at)
INDEX idx_run_debug_events_run_tool ON (run_id, tool_call_id)
```

Debug events 是 append-only：运行期间只追加，不修改历史事件。payload 只保存摘要字段，例如 label、toolName、argsSummary、outputSummary、durationMs、error、stream/text 摘要。

---

## Snapshot 内容

`AgentRunDebugSnapshot` 是持久化调试快照，记录 metadata 与统计值：

- `agent`：id、name、adapter、model、是否 orchestrator
- `workspace`：mode、effective cwd、boundPath
- `prompt`：override 标记、用户 prompt/effective prompt/system prompt 字符数、prompt sections 的 chars/tokenEstimate/present
- `context`：summary、workspace memory、experience（`experiencesInjected` / `experienceCount`）、history 注入情况与预算/估算
- `tools`：toolNames 与 external MCP server `{ id, name, trust, envKeys }`
- `attachments`：附件 id、kind、fileName、size、mimeType

不允许保存：

- API key / auth token
- MCP resolved env value
- 完整附件内容
- 完整 system prompt / user prompt 文本
- 完整 tool 输出或未经脱敏的 tool 参数

---

## 服务层

源文件：`src/server/agent-run-debug-service.ts`

### `recordAgentRunDebugSnapshot(args)`

在 `AgentRunner.buildAdapterInput` 组装完 adapter input 后调用。写入失败只记录 warning，不阻断 run。

### `listAgentRunsForConversation(conversationId)`

按 `startedAt DESC` 返回当前会话 run 列表，用于面板 lazy fetch。每项包含 agent 名称、adapter、model、status、usage、startedAt/finishedAt、是否已有 snapshot。

### `getAgentRunDebugDetail(conversationId, runId)`

必须校验 run 属于 conversation。返回：

- `agentRun`
- `snapshot | null`
- `triggerMessage | null`
- `outputMessages`
- `childrenRuns`
- `parentRun | null`

旧 run 没有 snapshot 时，仍返回基础 detail 与 `snapshot: null`。

### `recordAgentRunDebugEvent(args)`

在 AgentRunner 的 run、dispatch、tool 边界调用。写入失败只记录 warning，不阻断 run；成功后通过 SSE 发布带 `debugEventId` 的 `run.debug.*` 事件。

### `getAgentRunDebugEvents(conversationId, runId)`

必须校验 run 属于 conversation。按 `createdAt ASC` 返回当前 run 的 append-only debug events。

---

## API

- `GET /api/conversations/:id/agent-runs`
  - 返回 `{ runs }`
- `GET /api/conversations/:id/agent-runs/:runId/debug`
  - 返回 `{ detail }`
  - run 不存在或不属于 conversation 时返回 404
- `GET /api/conversations/:id/agent-runs/:runId/debug-events`
  - 返回 `{ events }`
  - run 不存在或不属于 conversation 时返回 404
- `GET /api/conversations/:id/agent-run-debug-events`
  - 返回当前会话下所有 run debug events：`{ events }`
  - conversation 不存在时返回 404

---

## 前端

`AgentRunDebugButton` 放在 `ChatPanel` header，靠近 `UsageBadge`。打开时 lazy fetch run 列表，选择单个 run 后 fetch detail。

运行展板页面升级为 Conversation-rooted Run Inspector 布局：

- Sticky Run Header：展示 Breadcrumb、当前任务、Run、状态、耗时、Token、模型与操作入口
- 轻量 Stage Bar：保留触发、上下文、规划、执行、产出生命周期状态，但不再作为主画布
- 左侧 Conversation List：一级对象必须是会话；展示会话标题、Run 数、最近 Run 状态和最近活动时间
- 中央 Session Task Graph：默认以 Conversation 为根，通过 `messages`、`agent_runs.triggerMessageId`、`agent_runs.parentRunId`、`messages.runId` 投影 Message → Run → Orchestrator → Agent → Step/Tool
- 中央 Current Run Graph：保留单次 Run 深度调试，基于 `plan_tasks` 与 `childrenRuns` 投影 Orchestrator、Task、Agent 和依赖关系
- 右侧 Agent Inspector：点击 run、task、agent 节点后展示对应调试上下文
- 底部详情面板：保留 Output、Logs、Tool Trace、Variables、Artifacts、History

`[全会话]` 模式中的 Timeline 和 Event Stream 必须使用会话级 messages、runs 与 debug events 聚合；`[当前 Run]` 模式继续只展示选中 run 的 detail/events。点击全会话图中的历史 Run 节点时，前端应加载该 run 的 debug detail/events，并在 Session Task Graph 中展开对应 Run Group。

面板展示：

- run 基础信息：id、status、agent、adapter、model、parent/trigger
- token 用量：input/output/cache/lastInput
- workspace：mode/effective cwd
- prompt sections：kind、present、chars、tokenEstimate
- context：summary、workspace memory、experience、history
- tools：内置工具名与外部 MCP server 名称/trust/envKeys
- messages：触发消息与输出消息数量
- runtime events：run、dispatch task、tool、terminal output 的摘要事件

如果 `snapshot === null`，显示旧 run fallback 提示，只展示可从 DB 还原的信息。

Agent Task Graph 第一阶段只做前端投影：

- 有 `plan_tasks` 时展示任务节点和依赖关系
- 有 `childrenRuns` 时把子 run 状态映射到对应 Agent
- 无 plan 的旧 run 降级为单 Run + Agent 视图
- 点击子 Agent 时，Inspector 可加载该子 run 的 debug detail，但中央画布仍保留父 run 的任务链上下文

---

## 非目标

- 不保存完整 prompt 文本
- 不保存密钥或 resolved secret
- 不做 prompt diff
- 不做 run replay
- 不做 run 对比
- 不做跨 conversation 查询
- 不改 adapter 协议
- 不引入新依赖
