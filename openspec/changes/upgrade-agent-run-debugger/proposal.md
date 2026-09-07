# Upgrade Agent Run Debugger

## Why

The current run board already helps users inspect a single Agent run, but it still reads like a stage flow viewer. Users have to infer task splitting, agent assignment, and failure points from a stage-oriented layout and a bottom panel that is only loosely tied to the main canvas.

We want the page to behave more like a run inspector: users should be able to understand what happened in a run, which agent handled which part, and where to look when something goes wrong.

## What Changes

- Keep the existing run board entry point, but reorganize the page around run inspection rather than stage illustration.
- Promote the top header to a stronger run overview with clearer status, duration, token usage, and run identity.
- Keep the run history visible as the left rail, with clear recent-run switching and simple filtering.
- Rework the central canvas into a task-chain oriented view that highlights the orchestrator, task split, agent assignment, and active execution path.
- Add a fixed right-side inspector for agent-level detail instead of relying only on the bottom panel.
- Make the existing bottom panel act as a detail area for logs, tool trace, variables, artifacts, history, and output.
- Preserve current data sources for the first implementation; do not require new event persistence for the initial slice.

## Capabilities

### Modified Capabilities

- `agent-run-debugging`: Reframe the run board as a run inspector, with task-chain visualization and agent-level inspection.
- `frontend`: Add the new layout, selection model, and cross-panel interaction rules for the debugger page.

## Impact

- `src/components/agent-run-debug-board.tsx`: restructure the page into header, history rail, graph canvas, inspector, and bottom detail area.
- `src/lib/agent-run-debug-board.ts`: extend the existing stage projection logic into a richer debugger projection.
- `src/lib/agent-run-debug-projection.ts`: continue reusing existing tool trace, artifact, and message projections for detail panes.
- `src/stores/app-store.ts`: store the extra selection state needed for graph and inspector synchronization.
- `openspec/specs/frontend/spec.md` and `openspec/specs/agent-run-debugging/spec.md` need updated wording for the new debugger layout and interaction model.
