# Admin articles API + UI (unblocks #10 Admin view)
**Status:** PROPOSED — awaiting user sign-off (size L: new authenticated write surface, cross-layer).
**Depends:** #14 auth (done), #5 backend, existing `documents` schema (migrations 002/005).

## Goal
Staff (`admin`, `editor`) list / create / edit / publish / archive / delete articles from the Admin view.
Out of scope: categories/tags CRUD, comments/rating/report, SEO-metadata editing (`seo` role, item #7), media upload.

## API (`/api/admin/articles`, `requireAuth` + `requireRole('admin','editor')`)
| Method | Path | Behaviour |
|---|---|---|
| GET | `/` | all statuses; query `page,pageSize,status?,q?` (title ILIKE); includes `status`, `viewsCount`, `updatedAt` |
| GET | `/:id` | full row incl. body, meta fields, status |
| POST | `/` | create; `slug` optional (derived from title, ASCII-folded, de-duplicated with `-2`…); `authorId` = caller |
| PUT | `/:id` | full replace of editable fields (title, slug, summary, body, categorySlug, tags[], status) |
| DELETE | `/:id` | hard delete (CASCADE tags); 204 |

## Decisions (to confirm)
1. **Payload:** extend `toArticlePayload` with an admin superset (`status`, `viewsCount`, `updatedAt`, meta) — same builder, no per-page variant (rule 7).
2. **Publish:** `status` draft→published sets `published_at = now()` once (kept on later edits); published→draft keeps it (CHECK needs it only when published).
3. **Permissions:** editor may edit any article (no per-author ownership yet); only `admin` may DELETE. Editors archive instead.
4. **Body:** plain text, paragraphs split on blank lines (matches `ArticlePage`); React escapes it → no sanitiser needed. Max 100 000 chars.
5. **Tags:** accepted as names, upserted into `tags` (slug derived), `document_tags` replaced in one transaction.
6. **Concurrency:** `PUT` requires `updatedAt` echo → 409 if stale (prevents silent overwrite between two editors).
7. **Errors/validation:** zod `.strict()`, RFC-7807 via existing `HttpError`; unique-slug violation → 409.
8. **SEO meta/og** fields are NOT writable here (belongs to `seo` role / #7).

## UI (#10 Admin)
`AdminArticlesPage` table (title, category, text+icon status, views, actions) + filter + pager; `AdminArticleForm` route `admin/articles/new|:id`. Per mockup; uses `useApi`; delete via inline confirm (no `window.confirm`).

## Tests
Backend: RBAC matrix (anon 401, reader 403, editor ok, editor DELETE 403), slug collision, publish timestamp, stale-update 409, tag upsert, status filter. Frontend: table states, form validation, role-gated nav.

## Steps
1. Backend repo + routes + tests (branch `feature/admin-articles-api` off `dev`/`main`). 2. Frontend table + form (branch `feature/admin-articles-ui`). 3. Real-browser pass + ui-audit.
