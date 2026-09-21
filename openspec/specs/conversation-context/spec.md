# Conversation Context

## Purpose

Defines cross-run history serialization, pinned message injection, and context compaction. Detailed context rules live in `specs/13-conversation-context.md`.

## Requirements

### Requirement: PromptContext snapshots SHALL be explicit and bounded

Prompt context construction MUST produce an explainable snapshot of the latest summary, preserved pinned messages, recent messages after the summary boundary, and token-budget trimming decisions.

#### Scenario: Context snapshot is built after compaction
- **WHEN** a conversation has a latest context summary and pinned messages
- **THEN** the snapshot includes the summary, preserves pinned messages even when covered by the summary, excludes covered unpinned old messages, and marks any budget-trimmed non-pinned messages.

### Requirement: Custom agents SHALL receive bounded chat history

CustomAgentAdapter runs MUST receive serialized conversation history within a model-aware token budget for ordinary user turns.

#### Scenario: Conversation has long history
- **WHEN** AgentRunner builds adapter input
- **THEN** it trims history to fit the model context window and output reserve.

### Requirement: SDK agents SHALL use session resume plus summaries

Claude Code and Codex adapters SHALL rely on SDK session continuation and may receive Multi-Agent TeamFlow context summaries prefixed to new user prompts.

#### Scenario: Codex session continues
- **WHEN** a conversation already has a cached Codex thread id
- **THEN** CodexAdapter resumes the thread instead of replaying full chat history.

### Requirement: Pinned messages SHALL be preserved in context

Pinned messages MUST remain available to context construction even when older unpinned history is summarized or trimmed.

#### Scenario: User pins a message
- **WHEN** context is built after compaction
- **THEN** the pinned message is represented separately from the summary.

### Requirement: Sub-agent prompts SHALL not duplicate global history

Orchestrator-dispatched child runs MUST use their isolated task prompt and skip generic conversation history injection.

#### Scenario: Orchestrator dispatches a child task
- **WHEN** `overridePrompt` is set
- **THEN** AgentRunner does not call `buildHistoryFor` for that child run.

### Requirement: Context compaction SHALL clear SDK sessions

Compacting conversation history MUST clear SDK session caches whose internal state no longer matches the database history.

#### Scenario: Conversation is compacted
- **WHEN** compaction writes a new summary while preserving original messages
- **THEN** Claude Code and Codex session ids for that conversation are cleared.
