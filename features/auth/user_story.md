# Auth — user stories
Actors: visitor, reader, editor, seo, admin (roles seeded in migration 001).
- Visitor registers with email + display name + password → becomes `reader`, signed in.
- Any user signs in/out; the SPA restores the session on page load without re-entering the password.
- Admin assigns `editor` / `seo` / `admin` (no self-service role escalation).
- Server enforces RBAC on every protected route; UI nav by role is only a hint.
Constraints: ADR-001 already fixed JWT + opaque rotating refresh cookie (see `../stack-adr/planning.md`); schema is migration 001 (`users`, `user_roles`, `refresh_tokens`); `argon2`, `JWT_*`, `REFRESH_TOKEN_TTL_DAYS`, `COOKIE_SECURE` already in deps/config.
