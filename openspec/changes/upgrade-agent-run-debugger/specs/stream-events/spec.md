# Stream Events Delta

## MODIFIED Requirements

### Requirement: StreamEvent SHALL be the only live update protocol

All agent output, tool activity, artifact creation, pending approvals, dispatch state, debug event updates, and usage updates SHALL flow through `StreamEvent` before reaching the UI.

#### Scenario: AgentRunner publishes a debug event
- **WHEN** an Agent run, dispatch task, or tool call crosses a tracked boundary
- **THEN** AgentRunner publishes a `run.debug.*` event through the existing EventBus/SSE stream
- **AND** the event carries a stable debug event id when persistence succeeds.

### Requirement: Run debug events SHALL support live replay

AgentRunner MUST publish bounded `run.debug.*` events at run, dispatch, and tool boundaries, and frontend reducers MUST apply those events idempotently.

#### Scenario: Tool execution is traced
- **WHEN** AgentRunner consumes `tool.call` and `tool.result`
- **THEN** it emits `run.debug.tool.started` and `run.debug.tool.completed`
- **AND** stores only summarized arguments/results, redacting secret-like fields.

#### Scenario: Terminal output is available from a bash tool result
- **WHEN** a `bash` tool result completes
- **THEN** AgentRunner emits a display-only `run.debug.terminal.output` event
- **AND** the debugger presents it as Terminal Log, not as an interactive shell.
