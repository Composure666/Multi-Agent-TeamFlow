# Spec 17 — Agent Run 调试面板

## 目标

Agent Run 调试面板用于回答“这次 run 到底用了什么输入与上下文”。面板以 `agent_runs.id` 为中心，展示运行状态、用量、agent/adapter/model、workspace、prompt section 统计、上下文注入、工具、外部 MCP 与关联消息。

本阶段保存运行时快照，但不保存完整 prompt 文本、不保存密钥、不做 run replay。

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

---

## Snapshot 内容

`AgentRunDebugSnapshot` 是持久化调试快照，记录 metadata 与统计值：

- `agent`：id、name、adapter、model、是否 orchestrator
- `workspace`：mode、effective cwd、boundPath
- `prompt`：override 标记、用户 prompt/effective prompt/system prompt 字符数、prompt sections 的 chars/tokenEstimate/present
- `context`：summary、workspace memory、history 注入情况与预算/估算
- `tools`：toolNames 与 external MCP server `{ id, name, trust, envKeys }`
- `attachments`：附件 id、kind、fileName、size、mimeType

不允许保存：

- API key / auth token
- MCP resolved env value
- 完整附件内容
- 完整 system prompt / user prompt 文本

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

---

## API

- `GET /api/conversations/:id/agent-runs`
  - 返回 `{ runs }`
- `GET /api/conversations/:id/agent-runs/:runId/debug`
  - 返回 `{ detail }`
  - run 不存在或不属于 conversation 时返回 404

---

## 前端

`AgentRunDebugButton` 放在 `ChatPanel` header，靠近 `UsageBadge`。打开时 lazy fetch run 列表，选择单个 run 后 fetch detail。

面板展示：

- run 基础信息：id、status、agent、adapter、model、parent/trigger
- token 用量：input/output/cache/lastInput
- workspace：mode/effective cwd
- prompt sections：kind、present、chars、tokenEstimate
- context：summary、workspace memory、history
- tools：内置工具名与外部 MCP server 名称/trust/envKeys
- messages：触发消息与输出消息数量

如果 `snapshot === null`，显示旧 run fallback 提示，只展示可从 DB 还原的信息。

---

## 非目标

- 不保存完整 prompt 文本
- 不保存密钥或 resolved secret
- 不做 prompt diff
- 不做 run replay
- 不做跨 conversation 查询
- 不改 adapter 协议
- 不引入新依赖
