---
name: finesse-skill
description: Audit and improve Multi-Agent TeamFlow interfaces for clarity, hierarchy, accessibility, density, and task completion.
---

# Finesse UI Audit

Use this skill when reviewing or changing Multi-Agent TeamFlow UI. Start from the user's task, not the component tree.

## Required context

- Read `CLAUDE.md`, `OVERVIEW.md`, and `openspec/specs/frontend/spec.md`.
- Inspect the target view at desktop and mobile widths.
- Trace loading, empty, error, disabled, running, approval, complete, aborted, and reconnecting states.

## Audit order

1. Identify the primary task and the single strongest next action.
2. Check navigation grouping, page hierarchy, content density, and scan paths.
3. Check controls: use icons for familiar actions, tooltips for unfamiliar icons, menus for low-frequency actions, and visible labels for consequential actions.
4. Check keyboard focus, labels, hit targets, contrast, overflow, long text, and reduced-motion behavior.
5. Check visual consistency against `--agenthub-*` tokens before introducing new colors or spacing values.

## Output format

Report every issue as: priority, evidence, user impact, smallest useful change, affected files, and acceptance check.

## Multi-Agent TeamFlow constraints

- Do not bypass Zustand/SSE boundaries or call LLM SDKs from UI.
- Do not weaken approval, workspace sandbox, iframe sandbox, or security rules.
- Prefer existing shadcn/ui and Lucide components.
- Keep page sections unframed unless a card is needed for a repeated item or genuinely framed tool.
- Verify all responsive changes with Playwright before claiming completion.
