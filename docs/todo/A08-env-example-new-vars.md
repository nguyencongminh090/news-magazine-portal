# A08 — Update .env.example for new config variables
**Status:** OPEN
**Area:** `backend/.env.example` (or root), README env section
**From:** item #5 follow-up, 2026-10-31   **Depends:** A05

## Scope
1. Add every variable read by `backend/src/config.js` `loadConfig`: NODE_ENV, PORT, DATABASE_URL, JWT_SECRET (>=32 chars),
   COOKIE_SECURE, JWT_ISSUER, JWT_AUDIENCE, TRUST_PROXY, DB_* pool settings; mark required-in-production ones.
## Don't
- No real secrets; placeholders only.
## Done when
- Every var in `loadConfig` appears in `.env.example`.
