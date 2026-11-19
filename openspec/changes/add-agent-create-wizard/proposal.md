> 注（2026-11-19，batch5-cleanup W2）：本文提及的 `sidebar.tsx`、`agent-library.tsx`、`team-library.tsx`、`new-conversation-dialog.tsx`、`global-search-trigger.tsx`、`dir-picker-dialog.tsx` 已于 2026-11-18 batch4 §2 删除；现入口：侧栏→`app-workbench.tsx` 内联 `wb-sidebar`、Agent 库→`agent-workspace.tsx`、会话创建→新建任务视图。历史叙述保留原样。

## Why

Creating a useful agent currently requires users to understand model/provider fields, tool permissions, and system prompt authoring up front. A guided conversational path can turn a plain-language role description into a reviewed agent configuration while keeping the existing detailed configuration flow available for power users.

## What Changes

- Add a first-step choice when the user clicks "Create Agent": conversational creation or detailed configuration.
- Keep the current detailed configuration form as the explicit advanced path.
- Add a conversational creation path that gathers intent, asks only necessary follow-up questions, generates an agent configuration draft, and shows a confirmation screen before saving.
- Reuse the existing agent creation API and service for final persistence; the conversational path must not write agents directly.
- Generate tool selections from local deterministic rules and existing presets, with the draft clearly showing granted permissions before confirmation.
- Scope the first implementation to non-orchestrator agents and preserve existing restrictions around SDK adapters, provider/model validation, and tool sets.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-builder`: Add a guided conversational creation path as a first-step option under the existing Create Agent entry point.

## Impact

- `src/components/agent-library.tsx`: route the existing create button into a first-step creation choice.
- `src/components/create-agent-dialog.tsx`: support opening directly in detailed mode and accepting draft values from the wizard.
- New UI component for the conversational creation wizard and draft confirmation step.
- New API/service boundary for generating an agent configuration draft from user intent, with zod validation and deterministic post-processing.
- `src/server/agent-service.ts` and `/api/agents` remain the final persistence path.
- `openspec/specs/agent-builder/spec.md` and `specs/10-agent-builder.md` need updated creation-flow documentation.
