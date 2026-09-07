# Persistence Delta

## MODIFIED Requirements

### Requirement: Database schema SHALL map domain entities

The SQLite schema MUST persist agents, conversations, messages, artifacts, workspaces, attachments, agent runs, run debug snapshots, run debug events, context summaries, and app settings.

#### Scenario: AgentRunner records a debug event
- **WHEN** an Agent run creates a debug event
- **THEN** it is stored in `agent_run_debug_events`
- **AND** it is scoped by both `conversation_id` and `run_id`.

### Requirement: Run debug events SHALL be append-only

Run debug event persistence MUST append new event rows and MUST NOT mutate prior rows during normal run execution.

#### Scenario: Debugger reloads event history
- **WHEN** the client requests debug events under the owning conversation and run
- **THEN** the API returns events ordered by `created_at`
- **AND** a request under a non-owning conversation returns not found.
