# A21 — Frontend: /verify-email page + resend button
**Status:** CODE DONE, vitest green (109); real-browser pass pending
**Area:** `frontend/src/{App.jsx,auth/authClient.js,auth/AuthContext.jsx,pages/VerifyEmailPage.jsx}`, `components/Engagement.jsx` (the "Verify your email" hint)
**From:** user, 2026-11-02 "tạo item mới cho trang /verify-email + nút gửi lại email xác nhận"   **Depends:** #15 (backend, done), #20

## Problem
Verification mail links to `<origin>/verify-email#token=…` (`backend/src/modules/auth/emails.js`) but the SPA has no such route -> 404.
Unverified users also have no way to ask for a new mail.
## Scope
1. authClient: `confirmEmailVerification(token)` (POST `/api/auth/email-verification/confirm`, no auth, 204) and
   `requestEmailVerification()` (POST `/api/auth/email-verification/request`, bearer, 202).
2. `/verify-email` page: read token from the URL fragment (lazy `useState` init, then strip — same pattern as ResetPasswordPage),
   confirm once, show success / invalid-or-expired / missing-token states; on success refresh the session user so `emailVerified` flips.
3. "Resend verification email" button for signed-in unverified users (header hint + Engagement hint); neutral confirmation text;
   handle 429 (limit 3/h per user) and 202.
## Don't
- Change the backend contract or email text. Put the token in a query string. Auto-confirm on a GET without the user's page load guard (confirm once per mount, StrictMode-safe).
## Traps
- StrictMode double effect: the confirm call must fire once (ref/guard), and the token must be read before the fragment is stripped.
- Link may be opened signed-out or on another device: confirm needs no session.
## Done when
- vitest for the page + resend button; full frontend suite green; real-browser pass with a token from the `[mail:log]` output (run API with `PUBLIC_BASE_URL` set, see #22).
