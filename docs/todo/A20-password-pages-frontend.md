# A20 — Frontend pages: forgot / reset / change password
**Status:** ✅ DONE 2026-11-02 — vitest 104/104; real-browser (Playwright/Chromium) forgot→reset→login→change-password→signed-out redirect all pass. Pages live in `PasswordPages.jsx` (single file).
**Area:** `frontend/src/auth/authClient.js`, `frontend/src/pages/{ForgotPassword,ResetPassword,ChangePassword}Page.jsx`, `App.jsx`, `AuthPage.jsx`, `PublicLayout.jsx`
**From:** user, 2026-11-02 "Add forget password + change password"   **Depends:** #15 (backend, done)

## Problem
Backend endpoints exist (#15) but no UI uses them.
## Scope
1. authClient: `changePassword` (bearer, sets new session), `requestPasswordReset`, `confirmPasswordReset`.
2. `/forgot-password` (always shows neutral "if the account exists" message), `/reset-password#token=` (reads fragment, then clears it), `/account/password` (signed-in only).
3. "Forgot password?" link on login; "Change password" link in header.
## Don't
- Email-verification UI (separate; not requested).
- Reveal whether an email exists; put the token in a query string.
## Done when
- vitest for the 3 pages passes; full frontend suite green.
