# A16 — Aborted refresh request logs the user out (rotation reuse false positive)
**Status:** ✅ FIXED 2026-10-31 — grace re-mint (30 s) on `fix/refresh-grace-window`; fix-log 2026-10-31 19:45
**Area:** `backend/src/modules/auth/repo.js`, `service.js`, `routes.js`, `backend/src/app.js`, `config.js`, `.env.example`, `features/auth/planning.md` (ADR-002 §6)
**From:** #14 real-browser verification, 2026-10-31   **Depends:** A14

## Problem
Page loads call `POST /api/auth/refresh`. If the response is lost (navigation/reload mid-flight, network drop)
or two tabs refresh with the same cookie, the next request presents the just-rotated token -> reuse detection
revokes the whole family -> 401, user is signed out.
Repro (Playwright, seeded DB): sign in, `goto('/admin')` then immediately `goto('/')` -> refresh 401.
## Scope
1. ADR-002 §6 amended (user chose grace re-mint, 30 s): replay within the window whose successor is still live
   revokes that successor and issues a new one in the same family. Config `REFRESH_REUSE_GRACE_SECONDS`.
2. Rotation writes `used_at`/`replaced_by` (columns from migration 005; no new migration).
3. Regression tests: in-window replay, out-of-order sibling, concurrent replays, after-window replay, after logout.
## Don't
- Don't drop reuse detection or rotation. Don't return the old successor (only hashes are stored).
## Traps
- `revoked_at` alone cannot tell rotation from logout/role change: grace keys on `used_at` + live successor.
- Measure age on the DB clock; keep the original `used_at` so repeated replays never extend the window.
- Lock the successor row inside the same transaction so concurrent replays cannot both mint.
## Why this way
Server-side fix covers both triggers (lost response and two tabs); client single-flight is per tab only.
## Done when
- Rapid reload / navigate-during-refresh and two tabs keep the session; replay after the window still revokes.
