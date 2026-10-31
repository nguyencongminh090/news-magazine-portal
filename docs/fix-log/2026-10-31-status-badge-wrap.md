# 2026-10-31 22:49 — #10 Status badge icon wraps onto its own line
## Prompt
"sửa lỗi chấm ● của Status" (seen in the 1280px admin list screenshot: ● above "Published").
## Root cause
The badge text is "● Published" (icon + space + label). The table auto-layout narrows the Status column, so the line breaks at the space; `.status` had no `white-space` rule.
## Fix
`white-space: nowrap` on `.status`. Regression test in `frontend/src/styles.test.js` (verified red without the rule).
## Verification
`npm --prefix frontend test` green. Not re-measured in a real browser yet.
