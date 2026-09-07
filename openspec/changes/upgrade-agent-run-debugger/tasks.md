## 1. Capability and Spec Updates

- [x] 1. Add OpenSpec delta specs for `agent-run-debugging` and `frontend` to describe the debugger layout and interaction model.
- [x] 2. Update the numbered `specs/17-agent-run-debugging.md` if needed to reflect the run-inspector wording and task-chain focus.

## 2. Frontend Projection

- [x] 3. Extend the existing run-board projection so the canvas can describe task-chain and agent relationships, not only stage flow.
- [x] 4. Preserve the existing tool trace, artifact, and message projection helpers for the inspector and bottom panel.

## 3. Layout and Interaction

- [x] 5. Rework `AgentRunDebugBoard` into a five-zone layout with header, run history, graph, inspector, and bottom panel.
- [x] 6. Add selection state for the active run, graph node, inspector target, and bottom-panel tab.
- [x] 7. Keep old-run fallback behavior intact so missing snapshot or partial data never breaks the page.

## 4. Verification

- [x] 8. Add or update focused tests for graph projection, inspector switching, and old-run degradation.
- [x] 9. Run `pnpm vitest run` for the affected tests, then `pnpm typecheck` and `pnpm lint`.

## 5. Phase C Follow-up

- [x] 10. Add run-history status and time-window filters to the debugger left rail.
- [x] 11. Add timeline filters for agent, tools, errors, and all events.
- [x] 12. Add copy affordances and tighter long-output handling to trace/log snippets.
- [x] 13. Re-run focused tests, then `pnpm typecheck` and `pnpm lint` after the phase C UI changes.

## 6. Phase D / MVP 3

- [x] 14. Add append-only `agent_run_debug_events` persistence and server helpers.
- [x] 15. Publish debug events from AgentRunner at run, dispatch, and tool boundaries.
- [x] 16. Expose `GET /api/conversations/:id/agent-runs/:runId/debug-events`.
- [x] 17. Hydrate debug events into the store and SSE stream for live replay.

## 7. Phase E / Visual Fidelity

- [x] 18. Rework the task graph projection into the reference layout: run summary, orchestrator, worker agent cards, and output summary.
- [x] 19. Upgrade debugger nodes so agent cards show task steps, metrics, and tool chips directly on the canvas.
- [x] 20. Rework the right inspector into an agent workbench with agent summary metrics, current task progress, terminal log, tool calls, and variables.
- [x] 21. Make the bottom panel default to an event timeline presentation while preserving Output, Logs, Tool Trace, Variables, Artifacts, and History tabs.
- [x] 22. Tighten the header and run-history rail visual hierarchy to match the reference screen.
- [x] 23. Re-run focused tests, then `pnpm typecheck` and `pnpm lint`.

## 8. Phase F / Agent-Centric Visual Pass

- [x] 24. Collapse task split into Agent cards so Agent is the central graph entity.
- [x] 25. Add graph focus projection for all, Agent, Tools, and error views without removing topology context.
- [x] 26. Wire canvas focus controls to dim non-matching graph nodes while keeping the event timeline filter synchronized.
- [x] 27. Render Agent task steps with compact status and dependency hints on graph cards.
- [x] 28. Re-run focused projection/view tests, then `pnpm typecheck` and `pnpm lint`.
- [x] 29. Default the inspector to the first worker Agent and expose a running-state pause action in the header.
- [x] 30. Add Agent card expand/collapse and timeline/tool-click linkage into the inspector.
- [x] 31. Fall back to child-run-backed Agent cards when plan data is missing so multi-agent runs still read as multi-agent.
- [x] 32. Choose the inspector's initial tab from real evidence: Terminal when command output exists, otherwise Tool Trace when tool calls exist.
- [x] 33. Merge runtime tool debug metadata into Tool Trace rows so status and duration are visible before expanding Input / Output.
- [x] 34. Translate runtime debug events into readable Agent/Tool timeline labels while preserving raw event details in the row body.
