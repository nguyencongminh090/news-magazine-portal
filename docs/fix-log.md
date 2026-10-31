# Fix log

Append-only. Detail files: `docs/fix-log/<YYYY-MM-DD>-<slug>.md` (template `docs/templates/fix-log.md`).

| Timestamp | Summary | Detail |
|---|---|---|
| 2026-10-31 14:22 | Stale loadConfig test lacked PUBLIC_BASE_URL required in prod since ADR-002; test updated | [detail](fix-log/2026-10-31-config-test-public-base-url.md) |
| 2026-10-31 14:50 | #10 `.home/.page/.state` padding shorthand reset the `.wrap` side gutter; content hit the screen edge on narrow viewports | [detail](fix-log/2026-10-31-wrap-gutter-reset.md) |
| 2026-10-31 15:05 | #10 Article/404 views lacked a main landmark (declared per page); moved to PublicLayout; 404 link target enlarged | [detail](fix-log/2026-10-31-public-main-landmark.md) |
| 2026-10-31 16:00 | #14 login rate-limit key skipped email normalisation (bypass) and bootstrap crashed/pre-registered on an existing ADMIN_EMAIL | [detail](fix-log/2026-10-31-auth-review-findings.md) |
| 2026-10-31 19:45 | #16 replay of a just-rotated refresh token (lost response, two tabs) revoked the family; 30 s grace re-mint via used_at/replaced_by | [detail](fix-log/2026-10-31-refresh-grace-window.md) |
| 2026-10-31 19:48 | #16 follow-up: grace re-mint restarted the window on each superseded sibling (ping-pong bypass); sibling now inherits the original used_at | [detail](fix-log/2026-10-31-refresh-grace-sibling-window.md) |
| 2026-10-31 20:06 | #15 password change / role change raced an in-flight refresh rotation; its successor token stayed live. Lock user row first in both | [detail](fix-log/2026-10-31-revoke-all-rotation-race.md) |
| 2026-10-31 21:30 | #15 change-password left outstanding reset links usable for 30 min; a new password now consumes every unused reset token | [detail](fix-log/2026-10-31-password-change-kills-reset-links.md) |
| 2026-10-31 22:49 | #10 admin Status badge icon wrapped onto its own line in narrow table cells; .status is now white-space: nowrap | [detail](fix-log/2026-10-31-status-badge-wrap.md) |
| 2026-10-31 23:20 | #18 report submit showed JSON parse error though saved; authClient.request now treats any empty body (201 too) as null | [detail](fix-log/2026-10-31-empty-201-json.md) |
