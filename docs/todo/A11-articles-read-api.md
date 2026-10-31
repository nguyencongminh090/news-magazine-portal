# A11 — Read API for articles and categories
**Status:** ✅ DONE 2026-10-31 — endpoints + tests in backend/src/modules/{articles,categories}
**Area:** `backend/src/modules/articles/`, `backend/src/modules/categories/`, `backend/src/app.js`
**From:** #10 frontend foundation, 2026-10-31 (UI views wait on these endpoints)   **Depends:** A03 (seed data), A05 (done)

## Problem
Backend exposes only `/api/health`; Home, Category, Search and Article views in #10 have nothing to consume.
## Scope
1. `GET /api/articles` — paginated list; filters: category, q (search); published only for public callers.
2. `GET /api/articles/:slug` — detail; reuse the payload builder the SEO shell route uses (one entity = one source).
3. `GET /api/categories` — list with article counts.
4. zod validation via `http/validate.js`; mount a read limiter from `http/rateLimit.js`; problem+json errors.
5. Backend tests (`node --test`) for each endpoint, incl. 404 and invalid query.
## Don't
- No write endpoints, auth, comments, ratings or admin routes (separate items; auth is size L, needs ADR).
- Don't invent a second article payload shape next to `modules/articles/payload.js`.
## Traps
- Never expose drafts to public callers. Cap page size. Search must use parameterised SQL.
## Why this way
Unblocks the remaining scope of #10 with the smallest read-only surface.
## Done when
- Endpoints return seeded data in tests; frontend views in #10 can consume them without new payload variants.
