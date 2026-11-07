## Implementation

- [ ] Add seeded demo data module with the 「光影造像工坊」 conversation, messages, and artifact chain (PRD → 设计稿 → 网页 → 评审).
- [ ] Add demo showcase script to the mock adapter path (streaming replay) or pre-rendered static content — whichever the user confirms.
- [ ] Add read-only `/demo` route reusing the chat/artifact UI with write controls, terminal, and API calls removed/disabled.
- [ ] Add "在线演示" entry on `/home` linking to `/demo`.
- [ ] Add `location = /demo` exemption to `deploy/nginx-agenthub.conf`, mirroring the `/home` block.
- [ ] Verify demo isolation: no SQLite read/write, no terminal route, no write API reachable from `/demo` (manual checklist + test where feasible).
- [ ] Run `pnpm typecheck`, `pnpm lint`, and related tests before commit.
- [ ] Update `deploy/DEMO-CHECKLIST.md` with the public demo link.

## Out of scope (separate tasks)

- README wording (honest bitdance-agenthub attribution) — separate commit.
- Pushing to remote — pending the user's choice of push method.
