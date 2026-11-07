## Why

The public demo of Multi-Agent TeamFlow is guest-blocked: nginx Basic Auth
sits in front of the whole workbench, so a visitor (e.g. a judge opening the
resume link) hits a login prompt instead of the product. Disabling auth is
not an option — the app exposes a real `node-pty` terminal and all visitors
share one SQLite database. A safe, public demo mode lets guests see the
product's core value (multi-agent group chat → deliverable) without any
access to the terminal, the database, or write operations.

## What Changes

- Add a public `/demo` route, exempt from nginx Basic Auth exactly like
  `/home` is today (`location = /demo`, exact match, `auth_basic off`).
- `/demo` is read-only: it renders a pre-seeded showcase conversation and
  its artifact chain, served from in-memory seed data. It never reads or
  writes the server SQLite database, never invokes a real LLM adapter, and
  never exposes the terminal or any write API.
- The showcase reuses the existing `MockAdapter` scripted flow (it already
  streams pre-set scripts with no LLM call) with a dedicated demo script:
  the 「光影造像工坊」 group chat from `deploy/DEMO-CHECKLIST.md`, showing
  the full chain PRD → 设计稿 → 网页 → 评审 with its artifacts.
- `/home` gains an "在线演示" entry linking to `/demo`.
- nginx config gains the `/demo` exemption in `deploy/nginx-agenthub.conf`,
  following the existing `/home` block and its exact-match rationale
  (prefix matching would leak `/demoxxx` and future routes).

## Capabilities

### New Capabilities

- `demo-mode`: a public, read-only demo route SHALL render a seeded
  multi-agent showcase conversation without authentication, database access,
  terminal access, or write operations.

### Modified Capabilities

- `frontend`: `/home` SHALL link to the public demo; `/demo` SHALL render
  the showcase in the same chat/artifact UI without write controls.
- `platform-security`: the nginx config SHALL exempt exactly `/demo` from
  Basic Auth; every other route SHALL remain behind auth.

## Impact

- `src/app/demo/page.tsx` (new): demo route, read-only rendering.
- `src/server/adapters/mock-adapter.ts`: add a demo showcase script
  (or a demo-only script module it imports); no changes to real adapters.
- `src/server/demo-seed.ts` (new): seeded 「光影造像工坊」 conversation,
  messages, and artifact contents — static data, no DB.
- `src/app/home/page.tsx`: add the "在线演示" entry.
- `deploy/nginx-agenthub.conf`: add `location = /demo` exemption.
- `deploy/DEMO-CHECKLIST.md`: document the public demo link (docs only).
- No DB schema change, no new dependency, no change to auth, sandbox,
  or the terminal path. README wording is a separate task (separate commit).

## Open Questions (for user confirmation before implementation)

1. Scope: demo mode only, or demo + README + push together?
2. Showcase playback: live MockAdapter streaming replay, or fully
   pre-rendered static content? (Streaming reuses the existing adapter
   and feels alive; static is simpler and has zero server compute.)
3. Push method (if README/push are in scope): GitHub App repo selection,
   or user pushes from their own PC?
