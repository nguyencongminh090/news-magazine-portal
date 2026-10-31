# A12 — migration 005 test fails once a later migration exists
**Status:** OPEN
**Area:** `backend/db/migrate.test.js` ("migration 005 applies on a database already at 004")
**From:** found while finishing #3 (2026-10-31)   **Depends:** —

## Problem
The test copies migrations `< 005` into a temp dir, applies them, then runs `migrate(testDb)` against the real dir
and asserts the result equals `['005_schema_hardening.sql']`. Migration `006_og_image_https.sql` now exists, so the
result is `['005…', '006…']` and the test fails (only when `TEST_DATABASE_URL` is set; skipped otherwise).
## Scope
1. Make the assertion independent of newer migrations (e.g. assert it starts with `005_schema_hardening.sql`, or
   compare against `listMigrations()` filtered to `>= 005`).
2. Keep the data check (existing document gets a non-null `tsv`).
## Don't
- Don't edit any applied migration file. Don't touch 005/006 SQL.
## Traps
- DB tests share one schema; `npm --prefix backend test` already runs files serially (`--test-concurrency=1`).
- Needs a disposable Postgres, e.g. `docker run --rm -e POSTGRES_PASSWORD=t -e POSTGRES_DB=t -p 54329:5432 postgres:16-alpine`.
## Why this way
A test that names the latest migration breaks on every new one; it should only pin what it is about (005's backfill).
## Done when
- With `TEST_DATABASE_URL` set, `npm --prefix backend test` has 0 failures, and stays green after adding a new migration.
