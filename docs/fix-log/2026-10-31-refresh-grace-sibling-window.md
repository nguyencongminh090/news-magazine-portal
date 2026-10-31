# 2026-10-31 19:48 — #16 follow-up: grace window restarted on each superseded sibling
## Prompt
Automated security review of b8dbada (MEDIUM, reuse detection bypass) + advisor review.
## Root cause
`graceRemint` set the superseded sibling's `used_at = now()`, giving every re-minted chain link a fresh 30 s
window. An attacker holding a stolen token and the real user refreshing alternately within 30 s could keep
re-minting indefinitely without tripping reuse detection. ADR-002 §6 claimed the window never extends.
## Fix
Sibling inherits the original token's `used_at` (`repo.js` graceRemint), so a whole grace chain is bounded by
the first rotation + REFRESH_REUSE_GRACE_SECONDS. ADR §6 wording and `auth-flow.md` diagram updated.
## Verification
New assertion in `repo.test.js` (sibling used_at == original) failed first, passes now; backend 46/46 with TEST_DATABASE_URL.
