# 2026-10-31 21:30 — #15 password change left outstanding reset links valid
## Prompt
Automated security review of 861596d (MEDIUM, missing invalidation on the sibling path).
## Root cause
`updatePassword` (change-password) revoked refresh tokens but not `user_tokens` of purpose `reset`. A link issued
before the change stayed usable for up to 30 min, so whoever held it (e.g. via a once-compromised mailbox) could undo
the user's password change.
## Fix
`setPasswordAndRevoke` (shared by change-password and reset-confirm) also marks every unused reset token used, in the
same transaction under the user-row lock.
## Verification
New assertions in `repo.test.js` (real DB) and `passwordReset.test.js` (HTTP) failed first, pass now; backend 66/66
with TEST_DATABASE_URL.
