# Public Reading UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the public reading views (Home, Category, Search, Article) of the React frontend to the read API, with tests, matching `DESIGN.md` and the approved mockup.

**Architecture:** A thin `fetch` client throws a typed error for problem+json responses; one `useApi` hook feeds every page; presentational components (`ArticleListItem`, `Pagination`, `StateView`) are shared by Home/Category/Search so there is one list rendering. Pages hold no styling beyond classes that already exist in `frontend/src/styles.css`.

**Tech Stack:** React 19, react-router-dom 7, Vite 8 (existing); add Vitest + jsdom + @testing-library/react for tests.

**Spec:** `DESIGN.md`, `features/ui-mockup/mockup.html`, `docs/todo/A10-frontend-ui-implementation.md`, `docs/todo/A11-articles-read-api.md`

## Global Constraints
- Prose column `max-width: 66ch`; body text >= 16px (article 18px); text contrast >= 4.5:1 (existing tokens only; no literal colours outside `:root`).
- Public lists are lists, not cards; one primary action per screen; status/errors never by colour alone (`.error` already prefixes an icon).
- Max 2 webfont files (already added); no new dependencies beyond the test tools listed above; no component library.
- No hardcoded article content; Pending views remain for anything the API does not serve yet.
- Motion: colour transitions only; `prefers-reduced-motion` already disables them. Do not add animations.
- UI code, identifiers and commit messages in English. One commit per task.

## Out of scope (separate items, need their own plan/ADR)
Auth wiring (`AuthPage` stays a shell), comments/ratings/reports, admin CRUD and RBAC-gated nav, dark mode, SEO meta (item #7), categories/tags admin.

## API contract the UI assumes (owned by item #11; reconcile before Task 3)
- `GET /api/articles?category=<slug>&q=<text>&page=<n>` → `{ items: Article[], page: number, pageSize: number, total: number }`
- `GET /api/articles/:slug` → `Article` or problem+json 404
- `GET /api/categories` → `{ items: { slug: string, name: string, articleCount: number }[] }`
- `Article` = `{ slug, title, summary|null, body, publishedAt|null, category: { slug, name }|null }` — existing `toArticlePayload` plus `category`. If #11 ships a different shape, change only `frontend/src/api/types.js` (Task 2) and the tests' fixtures.

## Review Focus
- Empty result (0 articles / category with no articles) → `StateView` says "No articles found", not a blank page.
- Article body containing HTML-like text (`<script>`, `&amp;`) renders as inert text (React text nodes only; never `dangerouslySetInnerHTML`).
- `page` query param of `0`, `-1`, `abc` or beyond the last page → falls back to page 1 / shows empty state, no crash.
- API down / non-JSON 5xx → error state with a retry link, not an unhandled rejection.
- Missing `summary` or `publishedAt` (null) → item still renders without "Invalid Date".

---

### Task 1: Frontend test harness

**Files:**
- Modify: `frontend/package.json` (devDependencies `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`; script `"test": "vitest run"`), `frontend/vite.config.js` (add `test: { environment: 'jsdom', setupFiles: './src/test/setup.js', globals: true }`)
- Create: `frontend/src/test/setup.js` (imports `@testing-library/jest-dom/vitest`), `frontend/src/test/smoke.test.jsx`

**Interfaces:**
- Produces: `npm --prefix frontend test` runs Vitest in jsdom; `renderWithRouter(ui, { route })` exported from `frontend/src/test/render.jsx` (wraps `MemoryRouter`).

- [ ] **Step 1: Write the failing test** `smoke.test.jsx`: renders `<App />` via `renderWithRouter` at `/` and asserts `screen.getByRole('link', { name: 'News Portal' })` is present.
- [ ] **Step 2: Run** `npm --prefix frontend test` → Expected: FAIL (no vitest / no `render.jsx`).
- [ ] **Step 3: Install the dev dependencies, add config and `renderWithRouter`.**
- [ ] **Step 4: Run** `npm --prefix frontend test` → Expected: 1 passed.
- [ ] **Step 5: Commit** `test(ui): add vitest + jsdom harness for frontend`

### Task 2: API client and `useApi` hook

**Files:**
- Create: `frontend/src/api/client.js`, `frontend/src/api/useApi.js`, `frontend/src/api/types.js` (JSDoc typedefs for the contract above), `frontend/src/api/client.test.js`, `frontend/src/api/useApi.test.jsx`

**Interfaces:**
- Produces: `class ApiError extends Error { status: number; title: string }`; `apiGet(path: string, params?: Record<string, string|number|undefined>, opts?: { signal?: AbortSignal }): Promise<any>` — drops `undefined`/empty params, sends `Accept: application/json`; `useApi(path: string|null, params?: object): { data, error: ApiError|null, loading: boolean, reload: () => void }` — aborts the in-flight request on param change/unmount; `path === null` means "do not fetch".

- [ ] **Step 1: Write failing tests** with `vi.stubGlobal('fetch', ...)`:
  - `apiGet('/api/articles', { q: 'moon', page: undefined })` calls `/api/articles?q=moon`.
  - a 404 `application/problem+json` body `{ title: 'Not Found', status: 404 }` rejects with `ApiError` where `status === 404`, `title === 'Not Found'`.
  - a 500 with an HTML body rejects with `ApiError` `status === 500` (no JSON parse crash); a network failure rejects with `ApiError` `status === 0`.
  - `useApi` returns `loading: true` then `data`; changing `params` aborts the first request (assert `signal.aborted`); `reload()` refetches.
- [ ] **Step 2: Run** `npm --prefix frontend test -- api` → Expected: FAIL.
- [ ] **Step 3: Implement** the signatures above in `client.js` and `useApi.js`; parse the error body only when `content-type` includes `json`.
- [ ] **Step 4: Run** same command → Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): add api client and useApi hook`

### Task 3: Shared list components

**Files:**
- Create: `frontend/src/components/StateView.jsx`, `ArticleListItem.jsx`, `Pagination.jsx`, `frontend/src/lib/format.js`, plus `*.test.jsx` next to each
- Modify: `frontend/src/pages/Pending.jsx` (no change expected; `StateView` is separate)

**Interfaces:**
- Consumes: `Article`, `ApiError` from Task 2.
- Produces: `formatDate(iso: string|null): string` (e.g. `31 Oct 2026`, `''` for null/invalid); `<StateView loading error empty onRetry>` renders `role="status"` "Loading…", `role="alert"` with `.error` and a "Try again" button calling `onRetry`, or "No articles found"; `<ArticleListItem article>` renders `<li>` with `.cat`, `<h3><Link to="/articles/:slug">`, summary, date, no image block; `<Pagination page total pageSize buildHref(page)>` renders Previous/Next links, disabled (`aria-disabled`, not a link) at the ends, returns `null` when `total <= pageSize`.

- [ ] **Step 1: Write failing tests:** `formatDate(null) === ''`, `formatDate('not a date') === ''`, `formatDate('2026-10-31T00:00:00Z')` contains `2026`; `ArticleListItem` with `summary: null, publishedAt: null` has no "Invalid Date" text and its title link `href` is `/articles/<slug>`; `StateView` with `error` shows an alert and clicking "Try again" calls `onRetry`; `Pagination` at page 1 has Previous `aria-disabled="true"`, at the last page Next is disabled, with `total <= pageSize` renders nothing.
- [ ] **Step 2: Run** `npm --prefix frontend test -- components lib` → Expected: FAIL.
- [ ] **Step 3: Implement** to the signatures above, reusing existing classes (`.list`, `.cat`, `.muted`, `.pager`, `.btn secondary`, `.state`, `.error`).
- [ ] **Step 4: Run** same command → Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): add shared article list components`

### Task 4: Home page and category navigation

**Files:**
- Modify: `frontend/src/pages/HomePage.jsx`, `frontend/src/layouts/PublicLayout.jsx` (category nav from `/api/categories`), `frontend/src/styles.css` (only if a class is missing)
- Create: `frontend/src/pages/HomePage.test.jsx`, `frontend/src/layouts/PublicLayout.test.jsx`

**Interfaces:**
- Consumes: `useApi`, `StateView`, `ArticleListItem`, `Pagination`.
- Produces: `HomePage` fetches `/api/articles?page=<n>` (`page` read from `useSearchParams`, normalised by `parsePage(value: string|null): number` exported from `frontend/src/lib/format.js`, returns 1 for anything that is not an integer >= 1); layout: first article as `.lead` (title, summary, `.cat`, date), next two as `.second`, rest as `.list` (page 1 only; later pages are the plain list), sidebar `aside` "Categories" from `/api/categories`. `PublicLayout` renders one `NavLink` per category to `/category/:slug` after "Latest".

- [ ] **Step 1: Write failing tests** (mock `fetch`): home shows the lead title as `<h1>`; page 1 with 6 articles → 1 lead, 2 secondary, 3 list items; `?page=abc` requests `page=1`; empty `items` shows "No articles found"; fetch rejection shows the alert and "Try again"; layout nav lists category names returned by `/api/categories` and still renders "Latest" when that request fails.
- [ ] **Step 2: Run** `npm --prefix frontend test -- Home PublicLayout` → Expected: FAIL.
- [ ] **Step 3: Implement** both files; add `parsePage` to `lib/format.js` with its own unit test (`'0'→1`, `'-1'→1`, `'abc'→1`, `'3'→3`).
- [ ] **Step 4: Run** same command → Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): wire home page and category navigation to the API`

### Task 5: Category and Search pages

**Files:**
- Modify: `frontend/src/pages/CategoryPage.jsx`, `frontend/src/pages/SearchPage.jsx`
- Create: `frontend/src/pages/CategoryPage.test.jsx`, `frontend/src/pages/SearchPage.test.jsx`

**Interfaces:**
- Consumes: `useApi`, `StateView`, `ArticleListItem`, `Pagination`, `parsePage`.
- Produces: `CategoryPage` requests `/api/articles?category=<slug>&page=<n>`, heading is the category name (from `/api/categories`, falling back to the slug); `SearchPage` requests `/api/articles?q=<q>&page=<n>`, heading `Results for "<q>"`, and with an empty/missing `q` shows a prompt and sends no request (`useApi(null)`); both use `Pagination` with `buildHref` preserving other query params.

- [ ] **Step 1: Write failing tests:** category request URL contains `category=science`; search `?q=moon&page=2` requests both params and the Next link keeps `q=moon`; search without `q` makes zero fetch calls; a query with `<script>alert(1)</script>` appears as literal text in the heading (`getByText` finds the string; no `script` element in the DOM); a page beyond the last (API returns `items: []`) shows "No articles found".
- [ ] **Step 2: Run** `npm --prefix frontend test -- CategoryPage SearchPage` → Expected: FAIL.
- [ ] **Step 3: Implement** both pages reusing the Task 3 components (no per-page list markup).
- [ ] **Step 4: Run** same command → Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): wire category and search pages to the API`

### Task 6: Article page

**Files:**
- Modify: `frontend/src/pages/ArticlePage.jsx`
- Create: `frontend/src/pages/ArticlePage.test.jsx`

**Interfaces:**
- Consumes: `useApi`, `StateView`, `formatDate`, `NotFoundPage`.
- Produces: `ArticlePage` requests `/api/articles/<slug>`; renders `.article` with `.cat`, `<h1>`, byline/date, body split on blank lines into `<p>` text nodes, then a `Pending`-style note for comments ("Comments are not available yet."); a 404 `ApiError` renders `<NotFoundPage />`; sets `document.title` to `<title> · News Portal` and restores it on unmount.

- [ ] **Step 1: Write failing tests:** body `"One\n\nTwo"` renders two paragraphs; body `"<b>x</b> &amp; y"` is visible as that literal string and no `<b>` element exists; 404 shows the not-found view; 500 shows the alert with "Try again"; `document.title` equals `"<title> · News Portal"` while mounted.
- [ ] **Step 2: Run** `npm --prefix frontend test -- ArticlePage` → Expected: FAIL.
- [ ] **Step 3: Implement** with React text nodes only (no `dangerouslySetInnerHTML`).
- [ ] **Step 4: Run** same command → Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): wire article page to the API`

### Task 7: Quality gate (no new features)

**Files:**
- Create: `docs/notes/` entry via `docs/templates/note.md` only if findings need recording; modify code only to fix findings.

- [ ] **Step 1: Run** `npm --prefix frontend test` and `npm run build` → Expected: all tests pass, build succeeds.
- [ ] **Step 2: Run the `ui-audit` skill** on `frontend/src` against `DESIGN.md` (code mode, then live mode with `npm run dev` and a seeded database) → Expected: 0 block, 0 major findings; fix each finding via `ui-fix`.
- [ ] **Step 3: Real-browser pass** (Chrome, desktop and 375px width): Home, a Category, Search with results and without, an Article, a 404 slug, API stopped (error state). Check keyboard-only navigation, visible focus, console clean, `prefers-reduced-motion` honoured. Expected: no console errors or warnings; every state in Review Focus observed.
- [ ] **Step 4: Update** `docs/todo/A10-frontend-ui-implementation.md` status (remaining: auth wiring, admin, comments) and commit `docs(todo): record #10 progress after public views`

---

## Self-review notes
- Coverage: Home, Category, Search, Article, category nav (A10 Scope 2/4); Scope 3 role-gated admin and auth are explicitly deferred. A10 "Done when" (ui-audit, real-browser pass) is Task 7.
- Type consistency: `Article`, `ApiError`, `useApi`, `parsePage`, `formatDate` names are used identically in Tasks 2–6.
- Blocker: Tasks 4–6 cannot be verified against real data until #11 (read API) and #3 (seed data) land; Tasks 1–3 can start now with mocked `fetch`.
