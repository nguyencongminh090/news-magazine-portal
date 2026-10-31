# A13 — Seed safety: production guard, keep views_count, re-verify fetch
**Status:** ✅ DONE 2026-10-31 — guard (SEED_ALLOW_PRODUCTION=1 overrides), views_count insert-only, anonymousUser exported+tested; 33/33 pass with postgres:16
**Area:** `backend/db/seed/seed.js`, `seed.test.js`, `fetch-wikinews.js`, `articles.json`
**From:** review of #3 (2026-10-31)   **Depends:** —

## Problem
1. Seed creates 4 demo accounts (incl. admin) with the public password `DevPassw0rd!`; nothing stops it running on a production DB.
2. Re-running seed overwrites `documents.views_count` (ON CONFLICT DO UPDATE) with the synthetic value, wiping real counts once views are tracked.
3. The IP-anonymisation in `fetch-wikinews.js` (`anonymousUser`) was only syntax-checked; `articles.json` was patched by hand.
## Scope
1. Refuse to run when `NODE_ENV=production` (clear error, exit 1) unless an explicit override env var is set; test it.
2. Drop `views_count` from the DO UPDATE set (insert-only); test that a changed count survives a rerun.
3. Unit-test `anonymousUser` (IPv4, IPv6, normal username); export it. Do not re-fetch the whole dataset for this.
## Don't
- Don't change the dev password or demo emails (documented in README). Don't edit applied migrations.
## Traps
- Seed test needs a disposable Postgres (`TEST_DATABASE_URL`); DB test files run serially.
- Dataset includes some sensitive/odd articles (e.g. "White House deletes Truth Social post portraying Obamas as apes",
  interviews, a drunk-raccoon story). They are real Wikinews items; review the set before any graded submission.
- `views_count` is synthetic; the UI must not present it as real traffic.
## Why this way
Seed data and real data share tables; the seed must be safe to rerun and impossible to run against production by accident.
## Done when
- Guard, views_count preservation and `anonymousUser` are covered by tests and `npm --prefix backend test` is green with a DB.
