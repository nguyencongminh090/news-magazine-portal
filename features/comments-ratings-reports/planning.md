# Comments, ratings, reports (item #18)
**Status:** APPROVED 2026-10-31 — all recommendations accepted (verified email, post-moderation, admin reports UI split out, author may rate own). Backend in progress.
**Depends:** #14 auth (done; `requireAuth`, `requireRole`, `emailVerified`), #17 admin API pattern, schema 003/005 (`comments`, `ratings`, `reports`), `limits.comment/rating/report` (A05).

## Goal
Signed-in readers rate and comment on published articles and report an article or a comment; staff moderate.
Out of scope: threading/replies, edit-own-comment, likes on comments, notifications, per-user ban, admin reports UI (step 4, follow-up item).

## Decisions (to confirm)
1. **Who may act** — read (list comments, see avg rating): anyone. Post comment / rate / report: signed-in **and email-verified** (anti-spam; `emailVerified` exists). Anonymous → 401 with UI sign-in prompt. Why: schema ties `ratings.user_id` / `reports.reporter_id` to users; anonymous would need IP/captcha and breaks "one rating per user".
2. **Threading: no** (flat, oldest-first, cursor `page,pageSize`). Schema has no `parent_id`; keeps moderation simple. Revisit as its own item.
3. **Moderation model** — comments are **post-moderated**: `status='visible'` on create; staff (`admin`,`editor`) set `hidden`. Hidden comments are excluded from public list and counts; author sees nothing special (no shadow state in v1). Deleting a comment = staff hard delete (CASCADE removes its reports) — admin only; editors hide.
4. **Ratings** — `PUT /api/articles/:slug/rating {score 1..5}` upserts (idempotent, user may change); `DELETE` removes own. Only on `published` articles. No self-rating restriction for author (simple; note as risk).
5. **Reports** — `POST /api/articles/:slug/reports {reason}` and `POST /api/comments/:id/reports {reason}`; duplicate (same reporter+target) → 409 via partial unique index (A04). Reason 1..1000 chars. Reporting never auto-hides (no brigading). Own comment/article reports allowed but pointless; not blocked.
6. **One payload builder** `toEngagementSummary(row)` → `{ ratingAvg (1 decimal|null), ratingCount, commentCount, myRating|null }`; used by article detail **and** list (rule 7). Counts computed in SQL by aggregate subqueries (no denormalised counters → no second source). `myRating` only when a valid bearer is present (optional-auth middleware).
7. **Comment payload** `{ id, body, createdAt, author: {displayName}|null }`. Never email/roles/ids of users. Deleted user → `author:null` ("Deleted user" in UI).
8. **Text safety** — `body`/`reason` plain text, trimmed, 1..2000 / 1..1000, zod `.strict()`; rendered as React text nodes with `white-space: pre-wrap`; no HTML/markdown. No link rewriting.
9. **Write-endpoint security** — Bearer auth (no cookie) ⇒ not CSRF-prone (same stance as auth routes). Limiter placed **before** validate so every attempt counts; existing budgets: comment 10/min, rating 20/min, report 5/min (per IP; add per-user key via `keyGenerator` after `requireAuth`). Additional guard: max 1 identical comment body per user per article (409) to stop double-submit.
10. **Errors** — RFC-7807 via `HttpError`: 401 anon, 403 unverified/role, 404 unknown/unpublished article or hidden comment target for non-staff, 409 duplicate report/comment, 422 validation, 429 limit.

## API
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/articles/:slug/comments?page&pageSize` | none | visible only; `{items,total}` |
| POST | `/api/articles/:slug/comments` | verified user | `{body}` → 201 comment payload |
| PUT / DELETE | `/api/articles/:slug/rating` | verified user | upsert / remove own → returns summary |
| POST | `/api/articles/:slug/reports`, `/api/comments/:id/reports` | verified user | 201, 409 duplicate |
| PATCH | `/api/admin/comments/:id` `{status}` | admin, editor | hide / unhide |
| DELETE | `/api/admin/comments/:id` | admin | 204 |
| GET | `/api/admin/reports?status&page` · PATCH `/:id` `{status}` | admin, editor | **follow-up item** (UI + triage); sets `resolved_by/at` |

Article detail/list payload gains the summary from decision 6 (additive, no breaking change).

## UI (ArticlePage)
Rating control = 5 radio-style star buttons (text label "Rate 1 of 5", `aria-pressed`, ≥44px, shows current avg + count as text); comments list with count heading; form (textarea + counter + submit; disabled-with-reason state for anon/unverified, link to sign in / verify); per-comment and per-article "Report" link → inline reason form (no `window.confirm`/dialogs). States: loading, empty ("No comments yet"), error, rate-limited (Retry-After message), duplicate-report ("Already reported"). Status never by colour alone.

## Tests
Backend: RBAC matrix (anon 401, unverified 403, reader ok, editor hide ok, editor DELETE 403), rating upsert/uniqueness/range, duplicate report 409, hidden comment excluded from list+count, unpublished article 404, validation (empty/oversize/unknown keys), rate-limit 429, summary builder shared by list+detail, no PII in comment payload. Frontend (jsdom): each state above, optimistic rating rollback on error, text rendered escaped (`<script>` as text). Real-browser pass + ui-audit.

## Steps (after sign-off)
1. Migration only if needed (none expected; maybe `UNIQUE(user_id,document_id,body)` guard handled in code). 2. Backend `engagement` module + tests (`feature/comments-api`). 3. ArticlePage UI (`feature/comments-ui`). 4. Real-browser + ui-audit. 5. Follow-up item: admin moderation UI.
