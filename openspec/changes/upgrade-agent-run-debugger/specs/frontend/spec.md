# Frontend Delta

## MODIFIED Requirements

### Requirement: Run debugger SHALL present a run-inspector layout

The run debugger MUST organize the page around run inspection rather than a pure stage-flow view.

#### Scenario: User opens a run
- **WHEN** the user opens the run debugger
- **THEN** the page shows a run overview header
- **AND** a visible run history rail
- **AND** a central task-chain graph
- **AND** an inspector for the selected node
- **AND** a bottom detail panel.

### Requirement: Run debugger SHALL keep selection state synchronized

The frontend MUST keep the graph, inspector, and bottom detail panel synchronized when the user selects a run, node, or tool trace item.

#### Scenario: User clicks a graph node
- **WHEN** the user clicks a graph node
- **THEN** the inspector updates to that node
- **AND** the bottom panel switches to the most relevant tab when a mapping exists.

#### Scenario: User clicks a runtime timeline event
- **WHEN** the event includes an Agent or task identity that exists in the graph
- **THEN** the graph selection moves to that Agent
- **AND** the inspector switches to the relevant terminal, tool, or history tab.

#### Scenario: User clicks a tool trace entry
- **WHEN** the tool trace entry can be mapped to a runtime debug event
- **THEN** the related Agent is selected
- **AND** the inspector switches to the tool tab.
- **AND** the tool row exposes status and duration before the user expands input or output details.

#### Scenario: Run detail loads
- **WHEN** the debugger loads a run with worker Agent nodes
- **THEN** the first worker Agent becomes the default inspector target.

#### Scenario: Selected Agent has no terminal output but has tool trace
- **WHEN** the inspector opens for an Agent with no command or terminal evidence
- **AND** that Agent has tool calls
- **THEN** the inspector opens the tool tab instead of showing an empty terminal pane.

#### Scenario: Plan data is missing but child runs exist
- **WHEN** the debugger loads a run that only has child runs
- **THEN** the graph still renders worker Agent nodes from those child runs
- **AND** the first child-backed Agent becomes the default inspector target.

#### Scenario: User expands an Agent card
- **WHEN** an Agent card contains more steps or tool hints than the compact view can show
- **THEN** the card remains collapsed by default
- **AND** the user can expand it inline without opening a modal.

### Requirement: Run debugger SHALL support history and timeline filters

The debugger MUST let users narrow run history and event timelines without leaving the page.

#### Scenario: User filters recent runs
- **WHEN** the user changes the run-history status or time-window filter
- **THEN** the left rail updates to show only matching runs.

#### Scenario: User filters timeline events
- **WHEN** the user switches the timeline filter
- **THEN** the event list updates between all, agent, tools, and error views.

#### Scenario: Timeline events are shown in readable language
- **WHEN** the debugger renders runtime debug events
- **THEN** tool and agent events are translated into readable row titles
- **AND** the raw payload stays available in the expanded event body.

#### Scenario: User filters graph focus
- **WHEN** the user switches the canvas focus between all, Agent, Tools, and error views
- **THEN** the graph keeps the run, orchestrator, worker Agent, and output chain in place
- **AND** non-matching graph nodes are dimmed.

### Requirement: Run debugger SHALL hydrate runtime debug events

The frontend MUST lazy fetch persisted debug events for the selected run and merge live SSE debug events into the same run bucket.

#### Scenario: User opens a run with persisted debug events
- **WHEN** the run debug detail is loaded
- **THEN** the frontend also requests `GET /api/conversations/:id/agent-runs/:runId/debug-events`
- **AND** stores the returned events ordered by creation time.

#### Scenario: Live debug event arrives
- **WHEN** the SSE stream receives a `run.debug.*` event
- **THEN** the store appends it to that run's debug event bucket idempotently.

### Requirement: Run debugger SHALL make long trace text reusable

The debugger MUST keep long tool/log snippets readable and copyable.

#### Scenario: User inspects a long snippet
- **WHEN** the user views a long command or tool payload
- **THEN** the UI keeps the snippet scrollable or collapsed
- **AND** provides a copy action.

### Requirement: Run debugger SHALL degrade gracefully for old runs

The debugger MUST continue to render historical runs that only have partial metadata or no runtime snapshot.

#### Scenario: Old run has missing snapshot
- **WHEN** a run has no snapshot data
- **THEN** the page still renders the available run, message, and tool information
- **AND** the UI shows a fallback state instead of throwing.
