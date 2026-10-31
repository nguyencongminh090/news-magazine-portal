# A15 — Change/reset password and email verification
**Status:** OPEN
**Area:** `backend/src/modules/auth/`, mailer (new), frontend auth pages
**From:** ADR-002 decision, 2026-10-31   **Depends:** A14

## Problem
#14 ships register/login only; users cannot change or recover a password, and emails are unverified.
## Scope
1. Change password (current password required; revoke all refresh families).
2. Reset via single-use, time-limited emailed token; response never reveals whether the account exists.
3. Email verification token flow. Needs a mailer decision (ADR first).
## Don't
- Don't start before #14 is merged.
## Traps
- Store only token hashes; generic responses to avoid account enumeration (`authn-passwords`).
## Why this way
Kept out of #14 to keep it one small, reviewable concern.
## Done when
- Flows tested; mailer choice recorded in an ADR.
