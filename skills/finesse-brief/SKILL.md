---
name: finesse-brief
description: Define and refactor Multi-Agent TeamFlow workbenches through user tasks, domain boundaries, state flows, and observable interfaces.
---

# Finesse Workbench Brief

Use this skill before a substantial workbench redesign or cross-module refactor.

## Required context

- Read `CLAUDE.md`, `OVERVIEW.md`, and the relevant OpenSpec capability specs.
- Map user roles, primary tasks, workspace objects, state transitions, and data dependencies.
- Treat the five-layer architecture as fixed unless the user explicitly approves a contract change.

## Brief structure

1. Product promise and target user.
2. Primary jobs and success signals.
3. Page-level information architecture: navigation, workspace, context panel, detail panel, and modal layers.
4. Domain ownership: conversations, agents, capabilities, artifacts, automations, analytics, and notifications.
5. State model: idle, loading, refreshing, running, awaiting approval, awaiting question, complete, failed, aborted, and disconnected.
6. Inputs, outputs, store selectors, transport events, persistence sources, and observability signals.

## Refactoring rules

- `AppWorkbench` owns shell composition and view routing; domain workspaces own their UI and loading behavior.
- Zustand remains the L4 state boundary; SSE remains the transport boundary.
- L3 services and adapters remain inaccessible to UI components.
- Prefer configuration-driven navigation and explicit domain components over conditionals spread across the shell.
- Every extracted workspace must have an empty state, error state, loading state, and an independently testable entry point.

## Output

Produce a page/domain map, a state-flow map, a dependency table, risks, and an incremental migration sequence.
