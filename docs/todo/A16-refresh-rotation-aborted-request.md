# A16 — Aborted refresh request logs the user out (rotation reuse false positive)
**Status:** OPEN
**Area:** `backend/src/modules/auth/service.js`, `repo.js`, `frontend/src/auth/authClient.js`, `features/auth/planning.md` (ADR-002 §6)
**From:** #14 real-browser verification, 2026-10-31   **Depends:** A14

## Problem
Page loads call `POST /api/auth/refresh`. If the user navigates/reloads while it is in flight, the server
has already rotated the token but the browser never stores the new cookie. The next load sends the old
token -> reuse detection revokes the whole family -> 401, user is signed out.
Repro (Playwright, seeded DB): sign in, `goto('/admin')` then immediately `goto('/')` -> refresh 401.
## Scope
1. Decide (ADR-002 amendment, user sign-off): e.g. short grace window where the just-rotated token
   returns the successor instead of revoking, vs. other options. Keep reuse detection for real replays.
2. Implement + regression test reproducing the aborted-response case.
## Don't
- Don't drop reuse detection or rotation.
## Traps
- Grace logic must not let a stolen token mint new families; bound by time and single successor.
## Why this way
Security trade-off on an approved ADR -> decide first, then build.
## Done when
- Rapid reload / navigate-during-refresh keeps the session; replay after the window still revokes.
