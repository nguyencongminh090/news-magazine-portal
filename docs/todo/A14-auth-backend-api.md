# A14 — Auth backend API (register / login / session / me)
**Status:** OPEN
**Area:** `backend/src/modules/auth/`, `backend/src/app.js`, `backend/db/migrations/001_users_roles_auth.sql` (schema exists, no routes)
**From:** #10 auth wiring blocked — backend exposes no auth endpoints, 2026-10-31   **Depends:** A05

## Problem
Schema for users / roles / refresh tokens exists, but no endpoint creates a user or signs one in, so the frontend login/register forms (`AuthPage`) cannot be wired.
## Scope
1. ADR first (size L, `features/auth/`): session mechanism (httpOnly cookie vs token), password hashing, CSRF stance, rate limits. Get user sign-off before code.
2. Endpoints: register, login, logout, current user (`/me` with role), refresh if the ADR keeps refresh tokens.
3. RBAC middleware for admin/editor/seo/reader; server enforces, UI nav is only a hint.
4. Tests: validation, duplicate email (case-insensitive), wrong password, rate limit.
## Don't
- Don't wire the frontend here; that stays in #10 after this lands.
- Don't leak whether an email exists on login failure.
## Traps
- `users_email_lower_key` is a unique index on lower(email): normalise before lookup.
- Shared payload builders (hard rule 7); no per-route user shapes.
## Why this way
Frontend auth, Admin, comments/rating/report in #10 all depend on a session and a role.
## Done when
- Endpoints documented and tested; frontend can sign in against a seeded DB.
