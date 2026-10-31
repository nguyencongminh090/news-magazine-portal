# ADR-003: Change/reset password, email verification, mailer (item #15)
Status: **APPROVED by user (2026-10-31)** with the answers under "Resolved". Builds on ADR-002 (`../auth/planning.md`); does not reopen JWT + rotating refresh cookie.
Knowledge: `authn-passwords` (recovery: single-use, time-limited, no enumeration; re-auth before sensitive changes),
`be-background-jobs` (email off the request path), `authn-sessions-cookies`, `appsec-api-security`.

## Proposed decisions
1. **Mailer** behind one interface `mailer.send({ to, subject, text })`, injected into `authRouter` like `repo`/`jwt`
   (tests pass a fake that captures messages). Transports: `smtp` via `nodemailer` (`SMTP_URL`, provider-agnostic: any
   SMTP relay, or Mailpit locally) and `log` (dev/test default: prints the link, never in prod). Config validated in
   `loadConfig`: `MAIL_TRANSPORT`, `SMTP_URL`, `MAIL_FROM`; links built from existing `PUBLIC_BASE_URL`. Plain-text mail only.
2. **Sending is off the request path**: handler responds first, then sends (fire-and-forget, errors logged, no secrets/
   tokens in logs). No outbox/queue for now (one process, low volume); lost mail = user presses "resend". Revisit if volume grows.
3. **Tokens**: one table `user_tokens(id, user_id, purpose CHECK IN ('reset','verify'), token_hash UNIQUE, expires_at,
   used_at, created_at)`; 32 random bytes base64url, only SHA-256 stored (reuse `tokens.js`). TTL: reset 30 min, verify 24 h.
   Issuing a new token deletes the user's outstanding tokens of the same purpose. Consume is one atomic
   `UPDATE … SET used_at = now() WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now() RETURNING user_id`.
4. **Migrations**: 007 `users.password_changed_at timestamptz NULL` (branch 1); 008 `users.email_verified_at timestamptz NULL`
   + `user_tokens` (branch 2). Bootstrap admin is created verified.
5. **Endpoints** (`/api/auth`):
   - `POST change-password` (Bearer) `{ currentPassword, newPassword }` → wrong current = 400 generic; on success revoke **all**
     the user's refresh families (new `revokeAllForUser`) and issue a fresh session to the caller (`sendSession`), so only other devices log out.
   - `POST password-reset/request` `{ email }` → always `202` same body, regardless of account existence/active state.
   - `POST password-reset/confirm` `{ token, newPassword }` → set hash, revoke all families, mark email verified (link proved mailbox
     control); no auto-login. Invalid/expired/used token = one generic 400.
   - `POST email-verification/request` (Bearer) → `202`; `POST email-verification/confirm` `{ token }` → `204`.
   Every user payload (register/login/refresh/me/change-password) carries `emailVerified: boolean`.
   Token travels in the link (`/reset-password#token=…`, `/verify-email#token=…` fragment, so it never hits server logs) and then in the JSON body; no cookie → no CSRF guard needed.
6. **Enumeration / timing**: reset-request does lookup + token + send after responding, so latency is the same for known
   and unknown emails. Same generic body for inactive users.
7. **Rate limits** (per IP+email key like `loginKey`, plus per IP): reset-request 3/h per IP+email, 10/h per IP;
   verify-request 3/h per user; confirm endpoints 10/15 min per IP. No IP-less per-email bucket (victim mail-bomb/lockout lever).
8. **Old access JWTs after password change**: `requireAuth` already loads the user per request; reject tokens with
   `iat < floor(password_changed_at in seconds)` (cheap, closes the 15-min window). `iat` has 1 s resolution: comparing
   against the un-floored timestamp would reject the fresh session issued in the same second.
9. **Tests**: each endpoint happy path; generic responses for unknown/inactive email; token single-use, expiry, wrong purpose,
   superseded token; all families revoked; caller keeps a session after change-password; rate limits; fake mailer content has a working link.

## Rejected
- Provider HTTP SDK (Resend/Postmark/SES) now: vendor lock; SMTP covers all of them.
- Synchronous send inside the request: leaks account existence via latency; slow SMTP blocks the response.
- DB outbox + worker: correct but heavy for one process and two mail types (`be-background-jobs`); revisit later.
- Storing raw tokens / tokens in query string: DB leak = account takeover; query strings land in logs.

## Resolved (user, 2026-10-31)
1. Mailer: `nodemailer` SMTP + `log` transport (decision 1).
2. Reset allowed for unverified emails; a completed reset marks the email verified. Verification is informational only (gates nothing yet).
3. Yes: reject access JWTs issued before the last password change (decision 8).
4. #15 = backend/API + tests only; pages (reset form, change-password, verify banner) go with #10 using the API contract above.

## Sequencing
Branch 1 `feature/change-password` (no mailer, can start now) → Branch 2 mailer + migration 007 + reset → Branch 3 verification.
