# A05 — Backend foundation: pool, config, errors, validation, rate limit
**Status:** ✅ DONE 2026-10-31 — db.js pool, loadConfig, problem+json, zod validate, express-rate-limit, modules/ layout. Limiters defined in http/rateLimit.js (limits.*), not yet mounted: routes come in later items.
**Area:** `backend/src/` (db.js, config.js, index.js, app.js, new modules/ layout)
**From:** architecture review vs knowledge, 2026-10-31   **Depends:** A02 (A04 for refresh-token columns)

## Problem
Backend is a skeleton: no pg Pool, lazy config, ad hoc `{error}` responses, no validation or rate limiting.
## Scope
1. `src/db.js`: one `pg.Pool` (max, connectionTimeoutMillis, idleTimeoutMillis, statement_timeout), `query` helper, SIGTERM graceful shutdown.
2. Eager config validation at boot (DATABASE_URL, JWT secret, cookie secure flag, issuer/audience, NODE_ENV).
3. One error format (RFC 9457 problem+json) + error class carrying status; map pg codes 23505→409, 23503→409/422, 23514→422;
   handler honours `err.status`.
4. Validation layer (schema per route), 415 on wrong Content-Type, reject mass-assignment fields, page-size cap.
5. Rate limit (login, refresh, comment, rating, report) + `trust proxy` setting; keep `express.json` limit.
6. Layout `src/modules/<domain>/{routes,service,repo}.js`; only repo files import the pool; one shared article payload builder.
## Don't
- No auth/RBAC logic here (separate item). No ORM.
## Traps
- Release pool clients in `finally`; never log tokens.
- Production: serve SPA and `/api` from one origin so CORS/CSRF surface shrinks; helmet CSP must be tuned if Express serves the SPA.
## Why this way
knowledge: `pg-connection-pooling-timeouts`, `be-http-semantics`, `appsec-api-security`, `style-modular-monolith`, `websec-cors`.
## Done when
- Tests cover error mapping, validation rejects, and rate-limit 429; `npm --prefix backend test` green.
