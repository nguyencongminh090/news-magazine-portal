# A09 — migrate.js requires trailing "/" on the migrations dir argument
**Status:** ✅ DONE
**Area:** `backend/db/migrate.js`, `backend/db/migrate.test.js`
**From:** item #4 follow-up, 2026-10-31   **Depends:** A02

## Problem
`new URL(name, 'file://' + dir)` resolves wrongly when `dir` has no trailing slash; the test appends "/" as a workaround.
## Scope
1. Build file paths with `path.join` / `pathToFileURL` so the argument works with or without "/".
2. Regression test: run with a dir without trailing slash; remove the test workaround.
## Done when
- `npm --prefix backend test` green with Postgres (`TEST_DATABASE_URL`).
