# Fix log

Append-only. Detail files: `docs/fix-log/<YYYY-MM-DD>-<slug>.md` (template `docs/templates/fix-log.md`).

| Timestamp | Summary | Detail |
|---|---|---|
| 2026-10-31 14:22 | Stale loadConfig test lacked PUBLIC_BASE_URL required in prod since ADR-002; test updated | [detail](fix-log/2026-10-31-config-test-public-base-url.md) |
| 2026-10-31 14:50 | #10 `.home/.page/.state` padding shorthand reset the `.wrap` side gutter; content hit the screen edge on narrow viewports | [detail](fix-log/2026-10-31-wrap-gutter-reset.md) |
| 2026-10-31 15:05 | #10 Article/404 views lacked a main landmark (declared per page); moved to PublicLayout; 404 link target enlarged | [detail](fix-log/2026-10-31-public-main-landmark.md) |
| 2026-10-31 16:00 | #14 login rate-limit key skipped email normalisation (bypass) and bootstrap crashed/pre-registered on an existing ADMIN_EMAIL | [detail](fix-log/2026-10-31-auth-review-findings.md) |
| 2026-10-31 19:45 | #16 replay of a just-rotated refresh token (lost response, two tabs) revoked the family; 30 s grace re-mint via used_at/replaced_by | [detail](fix-log/2026-10-31-refresh-grace-window.md) |
