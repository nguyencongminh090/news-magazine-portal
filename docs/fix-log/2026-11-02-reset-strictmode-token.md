# 2026-11-02 — reset-password page lost its token under React StrictMode
**Related:** #20 (`frontend/src/pages/PasswordPages.jsx`)
## Prompt
User: check A20 in a real browser before closing.
## Root cause
`ResetPasswordPage` read the fragment token in `useEffect` and stripped it in the same effect. StrictMode (dev, `main.jsx`) runs effects twice,
so the second run read the already-stripped address -> token `''` -> "This link is missing its token". jsdom tests missed it (no StrictMode).
## Fix
Read the token in a lazy `useState` initialiser (render phase, before any effect); the effect only strips the fragment (idempotent). Removed the `token === null` branch.
## Verification
Regression test `reset keeps its token under StrictMode double effects` (RTL `configure({ reactStrictMode: true })`) was red before, green after.
Frontend vitest 104/104; Playwright/Chromium: real mail link -> form shown, reset succeeds, token reuse rejected, fragment stripped.
