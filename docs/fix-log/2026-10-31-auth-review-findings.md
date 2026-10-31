# 2026-10-31 16:00 — #14 auth review: login limiter bypass + bootstrap crash
## Prompt
Automated security review of the merged auth backend (2 MEDIUM findings).
## Root cause
1. Login limiter key used the raw `req.body.email`, but the schema trims/lower-cases afterwards, so case/whitespace variants of one email each got their own 10-attempt bucket. No per-IP-only cap existed.
2. `bootstrapAdmin` called `createUser` for `ADMIN_EMAIL` without checking for an existing account: a self-registered account with that address made boot crash on the unique index (DoS), and pre-registering the address was possible.
## Fix
1. `loginKey` normalises like the schema; added a per-IP bucket (40 / 15 min). No IP-less per-account bucket (would let anyone lock out a victim).
2. Bootstrap returns `email-taken` / `weak-password` instead of throwing, never promotes an existing user; `index.js` catches any remaining failure so the API still starts.
## Verification
Regression tests in `backend/src/modules/auth/auth.test.js` (variants share a bucket; bootstrap never promotes). Full backend suite 46/46 with a real Postgres.
