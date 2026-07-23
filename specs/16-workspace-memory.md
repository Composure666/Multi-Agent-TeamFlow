# Spec 16 — Workspace Memory

> Workspace Memory 是当前 conversation/workspace 的长期项目备注。它用于把用户明确维护的项目约束、命令、架构注意事项注入后续 Agent 运行上下文；不是跨会话全局记忆，也不是自动 RAG。

源文件：`src/server/workspace-memory-service.ts` · `src/server/agent-runner.ts` · `src/db/schema.ts`

---

## 1. 目标 / 非目标

**目标**

- 用户能在当前会话维护少量 workspace memory notes。
- Memory 持久化在 SQLite，随 conversation 删除级联删除。
- 后续普通 Agent run 的 system prompt 中包含有界 `<workspace_memory>`。
- Custom / Claude Code / Codex 通过同一 AgentRunner 注入路径收到 memory。
- Memory 修改后清理 Claude Code / Codex session，避免旧 session 继续使用过期 system prompt。

**非目标**

- 不做跨 conversation / 全局 / per-user 记忆。
- 不做 embedding、vector DB、RAG 或语义检索。
- 不扫描或自动总结 workspace 文件。
- 不写 `.agenthub-memory.md` 到用户本地项目。
- 不新增 Agent 可调用的 `remember_*` 工具。
- 不把 memory 放进 `buildHistoryFor` 或 `PromptContextSnapshot`。

---

## 2. 数据模型

```ts
type WorkspaceMemorySource = 'user' | 'agent' | 'system'

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

约束由 `workspace-memory-service` 执行：

- `title.trim()` 必填，最长 80 字符。
- `content.trim()` 必填，最长 4000 字符。
- 单 conversation 最多 50 条 memory。
- Phase 7 只允许用户通过 UI/API 创建 source=`user` 的 memory；`agent` / `system` 保留给后续阶段。

---

## 3. Prompt 注入

AgentRunner 在 `buildAdapterInput` 中构造 system prompt：

```text
<workspace_info>...</workspace_info>

<workspace_memory>...</workspace_memory>

agent.systemPrompt

AgentHub tool guidance

群聊说明（如需要）
```

注入规则：

- 只对普通 run 注入；`overridePrompt` 子任务默认不注入，保持 Spec 06 的子任务隔离上下文。
- 无 memory 时不输出空块。
- memory block 构建失败时记录 warning 并继续，不让 agent run 失败。
- pinned memory 优先，其次 `updatedAt desc`。
- 注入必须有界：最多 12 条，默认约 2000 token 预算。
- 内容与属性必须 XML escape。

示例：

```xml
<workspace_memory>
  <note id="mem_x" title="构建命令" source="user" pinned="true">
    使用 pnpm。提交前运行 pnpm typecheck 和 pnpm lint。
  </note>
</workspace_memory>
```

---

## 4. 与 Conversation Context 的边界

`buildHistoryFor` / `buildPromptContextSnapshot` 仍然只负责 conversation history：

1. 最新 conversation summary。
2. pinned messages。
3. summary 覆盖边界之后的 complete messages。

Workspace Memory 不进入 `PromptContextSnapshotItem`，不访问 workspace 文件，也不参与 conversation compaction。它是 AgentRunner system prompt assembly 的独立输入。

---

## 5. API

### `GET /api/conversations/:id/workspace-memory`

返回：

```ts
{ memories: WorkspaceMemoryRow[] }
```

### `POST /api/conversations/:id/workspace-memory`

Body：

```ts
{ title: string; content: string; pinned?: boolean }
```

返回：

```ts
{ memory: WorkspaceMemoryRow }
```

### `PATCH /api/conversations/:id/workspace-memory/:memoryId`

Body：

```ts
{ title?: string; content?: string; pinned?: boolean }
```

至少一个字段。只允许修改属于当前 conversation 的 memory。

### `DELETE /api/conversations/:id/workspace-memory/:memoryId`

删除当前 conversation 下的 memory，返回 `{ ok: true }`。

---

## 6. 前端

前端 store 增加：

```ts
workspaceMemoriesByConv: Record<string, WorkspaceMemoryRow[]>
setWorkspaceMemoriesForConversation(conversationId, list)
upsertWorkspaceMemory(conversationId, memory)
removeWorkspaceMemory(conversationId, memoryId)
```

UI 在聊天 header 中提供 Workspace Memory 入口：

- 打开后 lazy fetch 当前 conversation memory。
- 支持新增、编辑、删除、pin/unpin。
- 明确提示：Memory 仅作用于当前会话工作区，会注入后续 Agent 运行，不是全局记忆。

`clearConversationHistory` 默认不删除 workspace memory；memory 是 workspace metadata，不是聊天消息历史。

---

## 7. Session 失效

Claude Code / Codex adapter 使用 SDK session/thread resume。Workspace Memory 修改后必须调用：

```ts
clearClaudeCodeSession(conversationId)
clearCodexSession(conversationId)
```

这样后续 run 会用新的 system prompt，而不是继续旧 session 上下文。

---

## 8. 验证

- 创建 / 编辑 / pin memory 后，下次普通 Agent run 的 system prompt 包含 `<workspace_memory>`。
- `overridePrompt` 子任务不包含 workspace memory。
- 删除 conversation 后 memory rows 被级联删除。
- `buildHistoryFor` 测试不需要更新 memory 输入，边界不变。
- `pnpm typecheck` / `pnpm lint` / 相关测试通过。
