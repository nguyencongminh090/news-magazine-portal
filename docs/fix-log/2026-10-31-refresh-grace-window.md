# 2026-10-31 19:45 — #16 Lost refresh response signed the user out (rotation reuse false positive)
## Prompt
"Do #16" — found during #14 real-browser verification: navigate during an in-flight refresh -> logged out.
## Root cause
`rotateRefreshToken` treated ANY replay of a revoked token as theft and revoked the family. When the browser
drops the rotation response (navigation abort, network drop) or two tabs refresh with the same cookie, the
next request legitimately presents the just-rotated token. `used_at`/`replaced_by` (migration 005) existed
for this but were never written, so rotation was indistinguishable from logout.
## Fix
- `repo.rotateRefreshToken({ ..., graceMs })`: rotation now writes `used_at` + `replaced_by`. A replay within
  `graceMs` (age on the DB clock) whose successor is still live revokes that successor and issues a new one
  in the same family (one live token per family); the revoked sibling also points at the new token so an
  out-of-order cookie write gets grace. Logout / role change revoke the successor -> no grace -> reuse.
- Config `REFRESH_REUSE_GRACE_SECONDS` (default 30, 0-300, 0 disables), wired app -> authRouter -> service.
- ADR-002 §6 amended. No migration needed.
## Verification
- Regression in `repo.test.js` failed first (`'reuse' !== 'ok'`), passes now: replay in window, out-of-order
  sibling, concurrent replays, replay after 31 s still revokes, replay after logout still revokes.
- `npm --prefix backend test` with TEST_DATABASE_URL: 46/46. Playwright on seeded DB: 3x navigate-during-refresh
  + two tabs at once keep the session; DB shows 1 grace re-mint and 1 live token.
