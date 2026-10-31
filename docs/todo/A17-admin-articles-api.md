# A17 — Admin articles API (list/create/edit/publish/delete)
**Status:** IN PROGRESS — backend done on `feature/admin-articles-api` (RBAC, slug dedupe, publish-once, stale-update 409, tests incl. real DB). UI = #10.
**Area:** `backend/src/modules/adminArticles/`, `articles/payload.js`, `app.js`
**From:** #10 Admin view blocked on API; design `features/admin-articles/planning.md` signed off 2026-10-31   **Depends:** A14, A11

## Problem
No endpoints let staff manage articles; the Admin view in #10 cannot be built.
## Scope
1. `/api/admin/articles` GET list, GET :id, POST, PUT :id, DELETE :id (admin only), editor+admin otherwise.
2. `toAdminArticlePayload` extends the public builder.
## Don't
- No SEO meta/og writes (#7), no category/tag CRUD, no comments.
## Traps
- `PUT` needs `updatedAt` echo (409 if stale); `published_at` set once; tags upserted by slug.
## Done when
- Backend tests green incl. real-DB test; merged; #10 consumes it.
