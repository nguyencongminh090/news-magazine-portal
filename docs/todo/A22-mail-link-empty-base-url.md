# A22 — Bug: mail links lack an origin when PUBLIC_BASE_URL is empty
**Status:** ✅ DONE
**Area:** `backend/src/config.js` (publicBaseUrl), `backend/src/app.js:38` (`appBaseUrl: cfg.publicBaseUrl ?? origins[0]`)
**From:** found during #20 real-browser check, 2026-11-02   **Depends:** —

## Problem
`.env` has `PUBLIC_BASE_URL=` (empty, as in `.env.example`). `loadConfig` leaves it `''`; `'' ?? origins[0]` keeps `''`, so reset/verify
mails contain `/reset-password#token=…` with no origin (logged: `/reset-password#token=…`). Dev-only (prod requires a real value) but the dev mail link is unusable.
## Scope
1. Root cause: treat empty as unset (`||` or normalise `''` -> `undefined` in `loadConfig`).
2. Regression test (config and/or mail link built through `createApp`) + one fix-log entry.
## Don't
- Change prod rules (PUBLIC_BASE_URL stays required there).
## Done when
- With `PUBLIC_BASE_URL=` empty in development the mail link starts with `CORS_ORIGIN`; backend tests green.
