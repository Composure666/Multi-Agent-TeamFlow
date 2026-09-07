# Agent Run Debugging Capability

## Purpose

Agent run debugging gives users a conversation-scoped view of what a single Agent run used as runtime context: agent/model, workspace, prompt section statistics, injected context, tools, external MCP servers, attachments, status, and token usage.

## Requirements

### Requirement: Conversation-scoped run debug access

The system SHALL expose run debug list/detail only under a conversation route and SHALL reject access when the requested run does not belong to that conversation.

#### Scenario: Accessing a run from another conversation

- **Given** a run belongs to conversation A
- **When** the client requests that run under conversation B
- **Then** the API returns not found

#### Scenario: Inspecting a whole conversation

- **Given** a conversation contains multiple user messages and multiple Agent runs
- **When** the client opens the run debug board for that conversation
- **Then** the board's primary navigation is the conversation list
- **And** the default graph projects Message → Run → Orchestrator → Agent relationships for that conversation
- **And** selecting a historical run loads that run's debug detail and expands it inside the conversation graph

### Requirement: Conversation-scoped runtime events

The system SHALL expose conversation-scoped debug events so the session timeline and raw event stream can cover the full conversation instead of only the currently selected run.

#### Scenario: Viewing all-session timeline

- **Given** debug events exist for multiple runs in one conversation
- **When** the client requests conversation debug events
- **Then** the API returns events for that conversation ordered by creation time
- **And** the all-session timeline can display events across those runs

### Requirement: Runtime snapshot persistence

The system SHALL persist a debug snapshot for new Agent runs after adapter input is assembled. The snapshot SHALL describe runtime settings and context using bounded metadata instead of reconstructing from mutable current settings.

#### Scenario: Agent settings change after a run

- **Given** a run recorded a debug snapshot
- **When** the agent configuration changes later
- **Then** the debug detail still returns the original snapshot metadata

### Requirement: Secret redaction

The system SHALL NOT store API keys, auth tokens, resolved MCP environment values, full attachment contents, or full prompt text in run debug snapshots. External MCP servers SHALL only expose environment variable names.

#### Scenario: External MCP server has a secret env value

- **Given** an external MCP server has env `{ API_TOKEN: "secret" }`
- **When** a run debug snapshot records MCP metadata
- **Then** the snapshot contains `API_TOKEN`
- **And** the snapshot does not contain `secret`

### Requirement: Non-blocking snapshot recording

Snapshot recording failures SHALL NOT fail or abort the Agent run.

#### Scenario: Snapshot insert fails

- **Given** adapter input was built successfully
- **When** debug snapshot persistence throws
- **Then** the Agent run continues using the adapter input

### Requirement: Legacy run fallback

Debug detail SHALL still return basic run, message, parent, and child information for old runs that do not have a snapshot.

#### Scenario: Old run has no snapshot

- **Given** a run exists without an `agent_run_debug_snapshots` row
- **When** the client requests debug detail
- **Then** the API returns the run detail with `snapshot: null`
