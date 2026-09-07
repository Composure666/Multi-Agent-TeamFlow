# Design

## Scope

This change focuses on the first usable debugger slice:

- run overview header
- persistent run history rail
- task-chain oriented central graph
- fixed right-side inspector
- synchronized bottom detail panel

The initial implementation should reuse the current run and message data model. It should not introduce a new debug event store yet.

## Layout

The page should be organized into five visible areas:

1. Header for run identity and status.
2. Left rail for recent runs.
3. Center canvas for task and agent relationships.
4. Right inspector for the selected agent or node.
5. Bottom panel for output, logs, tool trace, variables, artifacts, and history.

The existing stage bar can remain, but it should become a light lifecycle indicator rather than the primary storytelling element.

## Projection Model

The debugger should derive its UI from existing data:

- current run summary
- runtime snapshot
- plan_tasks output
- child runs
- tool trace
- message summaries
- artifact summaries

That is enough to present a useful task chain and agent detail experience for the first slice.

## Interaction Rules

- Clicking a run changes the canvas and inspector context.
- Clicking a graph node updates the inspector.
- Clicking a tool trace entry should focus the relevant agent or tool detail.
- The selected node should drive the bottom panel tab when a clear mapping exists.
- Old runs without complete debug data should degrade gracefully instead of erroring.

## Later Expansion

Real-time debug events, step-level tracing, and replay should remain explicit follow-up work. The first slice should not block on those contracts.
