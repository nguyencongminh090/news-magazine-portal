# A07 — Inject per-article SEO meta into HTML shell (ADR-002 option a)
**Status:** OPEN
**Area:** `backend/src/modules/articles/`, `backend/src/config.js`, migration 006
**From:** item #6 sign-off 2026-10-31   **Depends:** A05, A04

## Scope
1. `GET /articles/:slug` (production only): read `dist/index.html`, inject title/description/og/canonical into `<head>`.
2. `escapeHtml` for every injected value; `og_image_url` https-only (CHECK in migration 006).
3. Only `status = published`; unknown/draft slug -> default shell with 404.
4. Config: `PUBLIC_BASE_URL` required at boot in production (canonical, og:url).
## Don't
- No SSR, no inline scripts (CSP unchanged), no dev-mode injection.
## Why this way
`features/seo-meta/planning.md` (ADR-002).
## Done when
- Tests: escaping, 404 for draft, https-only image, missing PUBLIC_BASE_URL fails boot.
