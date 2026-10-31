# ADR-002: Auth backend (item #14)
Status: **APPROVED by user (2026-10-31)** with the answers under "Resolved". Builds on ADR-001 "Resolved: Auth" (JWT chosen by user; mitigations mandatory). This ADR only fixes the details ADR-001 left open; it does not reopen JWT vs sessions.
Knowledge: `authn-passwords`, `authn-tokens-jwt`, `authn-sessions-cookies`, `appsec-xss-csrf`, `be-auth-integration`.

## Proposed decisions
1. **Endpoints** (`/api/auth`): `POST register`, `POST login`, `POST refresh`, `POST logout`, `GET me`. Admin role management: `PUT /api/users/:id/roles` (admin only).
2. **Register**: public, creates `reader` only; email normalised (trim, lower-case, matches `users_email_lower_key`); returns the same payload as login (signed in). No email verification (out of scope, noted risk: unverified addresses).
3. **Passwords**: Argon2id (`argon2` lib, OWASP minimum 19 MiB / 2 iter / 1 lane); length 8–128 (ADR-001: ≥8 + blocklist; blocklist = small bundled common-password list); no composition rules; no truncation.
4. **Login errors**: one generic 401 "Invalid email or password" for unknown user, wrong password and inactive user; dummy argon2 verify on unknown email to even out timing.
5. **Access token**: JWT HS256, fixed alg on verify, `exp` 15 min, `iss`/`aud` from config, `sub` = user id, **no role claim**: role is loaded from DB per protected request (immediate effect of role change; cost = 1 indexed query; revisit if it becomes hot). Returned in JSON, kept in SPA memory only.
6. **Refresh token**: 32 random bytes base64url, cookie `__Host-`-style name where allowed (`Secure` only in prod → plain `refresh_token` name in dev), `HttpOnly; SameSite=Strict; Path=/api/auth`, only SHA-256 digest stored; rotated on every use; **reuse of a revoked token revokes the whole family**, except a *grace re-mint* (amended 2026-10-31, #16, user-approved): a token rotated (`used_at`/`replaced_by`) less than `REFRESH_REUSE_GRACE_SECONDS` ago (default 30, 0 disables) whose successor is still live gets its successor revoked and a new one issued in the same family (one live token per family; window measured from the original rotation, never extended). Covers a lost rotation response (navigation abort, network drop) and two tabs refreshing at once. Logout / role change revoke the successor, so grace never revives them; TTL 14 days (config). Logout revokes the family and clears the cookie. Deactivating a user or changing roles revokes all their families.
7. **CSRF on refresh/logout**: `SameSite=Strict` + required custom header `X-Requested-With: fetch` + Origin check against `CORS_ORIGIN`/`PUBLIC_BASE_URL` (no CSRF token store). Access-token routes use a bearer header, so they are not CSRF-prone.
8. **Rate limits** (reuse `http/rateLimit.js`): login 10 / 15 min per IP+email key; register 5 / hour per IP; refresh 60 / min per IP. Throttle only, no account lockout (DoS lever).
9. **Layout**: `backend/src/modules/auth/{routes,service,repo,tokens,password}.js` + `requireAuth` / `requireRole(...roles)` in `backend/src/http/auth.js`; one `userPayload()` builder shared by login/refresh/me (hard rule 7).
10. **Frontend side (later, #10)**: `AuthProvider` holds token in memory, silent `refresh` on load, single in-flight refresh on 401, no refresh loop; handles 401 → sign-in, 403 → message.
11. **Tests**: register (dup email case-insensitive, weak password), login generic error, refresh rotation + reuse-detection family revoke, logout, role gate 401/403, inactive user, rate limit.

## Rejected
- Server-side session store: contradicts user's ADR-001 JWT choice.
- Role inside JWT: stale up to 15 min after demotion.
- Access token in localStorage / non-HttpOnly cookie: any XSS steals it (`be-auth-integration`).
- CSRF token store for refresh: extra state; Strict cookie + header + Origin is enough for a same-site SPA.

## Resolved (user, 2026-10-31)
1. Register → `reader` only, no email verification.
2. First admin: env bootstrap `ADMIN_EMAIL` + `ADMIN_PASSWORD` (created at boot/script only if no admin exists; never logged).
3. Role read from DB on every protected request.
4. Change/reset password and email verification: separate follow-up item (#15), not in #14.
5. Assumption (not asked, flag if wrong): prod SPA and API share one origin, so `SameSite=Strict` works; Vite dev proxies `/api`.

## Next
Implement on `feature/auth-backend` off `dev`/`main` per git rules (TDD, one concern per commit).
