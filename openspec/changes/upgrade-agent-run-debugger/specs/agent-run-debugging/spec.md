# Agent Run Debugging Delta

## MODIFIED Requirements

### Requirement: Agent run debugging SHALL emphasize task-chain inspection

The run debugger MUST help users understand how a run was split, which agent handled which task, and where execution is currently focused.

#### Scenario: Run includes a plan and child runs
- **WHEN** the selected run has plan data and child runs
- **THEN** the debugger shows the orchestrator, task split, and agent assignment in the main graph.

#### Scenario: Plan data is missing but child runs exist
- **WHEN** the selected run has child runs but no parsed plan data
- **THEN** the debugger still renders worker Agent cards from the child runs
- **AND** keeps the orchestrator-to-agent-to-summary topology visible.

#### Scenario: Reference task graph layout is used
- **WHEN** the debugger renders the main graph
- **THEN** the graph presents a vertical inspection path from run summary to orchestrator to worker task cards to output summary
- **AND** each agent or task card exposes status, duration or token metrics, and compact tool/task hints where data is available.

### Requirement: Agent run debugging SHALL expose agent-level detail

The debugger MUST let users inspect a selected agent's logs, tool trace, variables, artifacts, and related messages without leaving the page.

#### Scenario: User selects an agent
- **WHEN** the user selects an agent node
- **THEN** the inspector shows agent-specific detail
- **AND** the bottom panel remains available for supporting diagnostics.

#### Scenario: Run is running
- **WHEN** the selected run is still running
- **THEN** the header shows a pause action for the run.

### Requirement: Agent run debugging SHALL provide readable diagnostics filters

The debugger MUST let users filter run history and timeline entries to reduce noise during debugging.

#### Scenario: User narrows run history
- **WHEN** the user changes the status or time-window filters
- **THEN** the run history list shows only matching runs.

#### Scenario: User narrows the event timeline
- **WHEN** the user switches the timeline filter
- **THEN** the timeline shows the selected category of events.

#### Scenario: User narrows the graph focus
- **WHEN** the user switches the graph focus between all, Agent, Tools, and error views
- **THEN** the graph keeps the full run topology visible
- **AND** visually dims non-matching nodes instead of removing them.

### Requirement: Agent run debugging SHALL keep long diagnostics copyable

The debugger MUST keep long trace text usable in the UI.

#### Scenario: User views a long tool or log snippet
- **WHEN** the snippet is longer than the compact view
- **THEN** the UI keeps it scrollable or collapsed
- **AND** exposes a copy action.

### Requirement: Agent run debugging SHALL expose runtime debug events

The debugger MUST support append-only runtime events for new runs without losing legacy fallback for older runs.

#### Scenario: Runtime events exist for the selected run
- **WHEN** the selected run has persisted debug events
- **THEN** the debugger can display those events in chronological order
- **AND** live `run.debug.*` events update the same run event bucket.

### Requirement: Agent run debugging SHALL support historical fallback

The debugger MUST still display old runs that only have basic run, message, and tool-derived information.

#### Scenario: Historical run lacks full debugger data
- **WHEN** the run does not have enough data for a full task graph
- **THEN** the debugger falls back to a simpler view
- **AND** keeps the available diagnostics accessible.
