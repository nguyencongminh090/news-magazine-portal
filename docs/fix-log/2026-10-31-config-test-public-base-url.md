# 2026-10-31 14:22 — untracked loadConfig test fails after SEO meta merge
## Prompt
"chạy test backend sau merge" → 1 fail reported; user: "okay" to fix it.
## Root cause
ADR-002 SEO injection (e6ecbd7) made `PUBLIC_BASE_URL` required in production. The valid-config case in
`loadConfig fails eagerly listing all problems` (app.test.js) predates it and omitted the var, so it threw.
Test was stale, not the code: production requiring PUBLIC_BASE_URL is intended (covered by seo.test.js).
## Fix
Added `PUBLIC_BASE_URL: 'https://news.example'` to the valid production config in that test.
## Verification
`npm --prefix backend test`: 19 tests, 16 pass, 0 fail, 3 skipped (before: 15 pass, 1 fail).
