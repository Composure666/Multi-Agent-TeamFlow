# New Task Hero Tuning Implementation Plan

**Goal:** Tune the existing new-task page so its proportions, whitespace rhythm, typography, mascot balance, controls, and workspace footer more closely match the supplied reference image.

**Architecture:** Keep the existing `NewTaskView`, `RobotMascot`, and `WorkbenchNav` components and their behavior. Apply narrowly scoped Tailwind class changes and one small presentational helper for the toolbar review badge; no API, state, database, or dependency changes.

**Tech Stack:** Next.js 16.2.6, React 19, TypeScript, Tailwind CSS v4, lucide-react.

## Global Constraints

- Preserve existing task submission, scene selection, attachment, enhancement, and navigation behavior.
- Do not add dependencies.
- Keep visible copy limited to the existing reference-aligned labels.
- Do not change OpenSpec entity, event, adapter, tool, persistence, or security contracts.
- Verify with `pnpm typecheck` and a real browser screenshot at the reference desktop viewport.

## Files

- Modify `src/components/app-workbench.tsx`: Hero layout, mascot sizing, input toolbar presentation, sidebar selected/hover states, and account footer copy.
- Modify `src/components/workbench-navigation.ts` only if the existing reference-aligned navigation labels require correction.

## Tasks

### Task 1: Tune Hero geometry and typography

- Keep the content container centered at `max-w-[1100px]`.
- Make the heading a stable two-line composition so “你的” cannot become an orphan line.
- Use a 760-weight equivalent (`font-[760]`) and move the Hero down by approximately 20px through the existing wrapper spacing.
- Reduce category button horizontal padding and gaps enough to keep all five categories on one desktop row.
- Preserve the existing short category description and quick-agent row.

### Task 2: Balance and enrich the mascot

- Increase the mascot frame and robot body by roughly 12%.
- Keep the mascot visually centered in the right column and add only subtle bottom status accents: `Agent`, `Orchestrator`, and `Review enabled`.
- Preserve the existing low-opacity blue atmosphere and orbit treatment without adding unrelated UI.

### Task 3: Refine the input workbench

- Increase the text area top padding and toolbar vertical padding.
- Change the visible selector label from `Orchestrator` to `Workspace` while preserving its existing select behavior.
- Render `Review` as a lightweight badge-style button with a check icon; preserve its toggle behavior.
- Use the requested border and tinted shadow values, and keep the divider low-contrast.

### Task 4: Refine navigation account presentation

- Use `#EEF5FF` for navigation hover and `#E7F0FF` for the selected desktop item.
- Keep the selected item free of the old blue bar.
- Replace the account footer badge text `个人` with `Workspace`, and present the secondary line as `Local` with the existing green status dot.

### Task 5: Verify

- Run `pnpm typecheck`.
- Start the existing dev server on an available port.
- Capture a browser screenshot at `1920x1200` and inspect the heading wrap, five-button row, mascot scale, input height, and footer spacing.
- Do not claim completion until the verification commands and visual inspection provide evidence.
