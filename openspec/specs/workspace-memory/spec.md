# Workspace Memory

## Purpose

Defines persistent, conversation-scoped workspace notes that are injected into future agent runs as bounded context. Detailed design lives in `specs/16-workspace-memory.md`.

## Requirements

### Requirement: Workspace memory SHALL be conversation-scoped

Workspace memory entries MUST belong to exactly one conversation and MUST be deleted when that conversation is deleted. AgentHub MUST NOT share workspace memory across conversations or as global user memory.

#### Scenario: Conversation is deleted
- **WHEN** a conversation is deleted
- **THEN** all workspace memory rows for that conversation are deleted by cascade.

### Requirement: Workspace memory SHALL be DB-backed and bounded

Workspace memory MUST be stored in SQLite and MUST NOT be inferred by scanning workspace files at prompt time. Prompt injection MUST bound the number and size of entries.

#### Scenario: AgentRunner builds adapter input
- **WHEN** workspace memory exists for the conversation
- **THEN** AgentRunner injects a bounded `<workspace_memory>` block into the system prompt for normal runs
- **AND** pinned memories are considered before non-pinned memories.

### Requirement: Workspace memory SHALL preserve conversation-context boundaries

Workspace memory MUST be injected by AgentRunner prompt assembly, not by `buildHistoryFor` or `buildPromptContextSnapshot`.

#### Scenario: Conversation history is serialized
- **WHEN** `buildHistoryFor` builds history
- **THEN** it serializes conversation messages, pinned messages, summaries, artifact placeholders, and agent names only
- **AND** it does not access workspace files or workspace memory.

### Requirement: Workspace memory SHALL be user-controlled in the first phase

The first workspace memory implementation MUST expose user CRUD operations and MUST NOT provide an agent tool that writes long-term memory automatically.

#### Scenario: User edits workspace memory
- **WHEN** a user creates, edits, deletes, or pins a workspace memory note
- **THEN** future normal agent runs use the updated bounded memory block
- **AND** SDK sessions that could retain stale system prompt context are cleared.
