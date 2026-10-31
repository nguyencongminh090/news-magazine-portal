# A15 — Change/reset password and email verification
**Status:** OPEN — spec: ADR-003 `features/password-recovery/planning.md` (approved 2026-10-31)
**Area:** `backend/src/modules/auth/`, mailer (new), frontend auth pages
**From:** ADR-002 decision, 2026-10-31   **Depends:** A14

## Problem
#14 ships register/login only; users cannot change or recover a password, and emails are unverified.
## Scope
1. Change password (current password required; revoke all refresh families).
2. Reset via single-use, time-limited emailed token; response never reveals whether the account exists.
3. Email verification token flow. Needs a mailer decision (ADR first).
## Don't
- No frontend pages (go with #10); no outbox/queue; no provider SDK.
## Traps
- Store only token hashes; generic responses to avoid account enumeration (`authn-passwords`).
## Why this way
Kept out of #14 to keep it one small, reviewable concern.
## Done when
- Flows tested; mailer choice recorded in ADR-003 (done). Branches: 1 change-password, 2 mailer+reset, 3 verification.
## Progress
- 2026-10-31 branch 1 `feature/change-password`: `POST /api/auth/change-password`, migration 007, old-JWT cutoff in `requireAuth`.
