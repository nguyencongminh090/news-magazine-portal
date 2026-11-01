# 2026-11-02 — mail links had no origin when PUBLIC_BASE_URL is empty
**Related:** #22 (`backend/src/config.js`, `backend/src/app.js` `appBaseUrl`)
## Prompt
User: do #22 (found during the #20 real-browser check).
## Root cause
`.env` ships `PUBLIC_BASE_URL=` (empty). `loadConfig` kept `''`, so `cfg.publicBaseUrl ?? origins[0]` kept `''` (`??` only skips null/undefined)
and reset/verify mails contained `/reset-password#token=…` with no origin.
## Fix
`loadConfig` normalises empty/blank to `undefined` (`.trim()…|| undefined`). Prod still requires a value; `app.js` untouched.
## Verification
Regression test `empty PUBLIC_BASE_URL is unset…` (seo.test.js) was red before, green after; prod still throws on empty.
Backend suite: 73 pass, 0 fail, 9 skipped (DB-gated). Not run: real mail link in a browser.
