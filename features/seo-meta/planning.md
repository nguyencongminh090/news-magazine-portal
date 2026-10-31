# ADR-002: How SEO meta fields reach crawlers (item #6 / A06)

Status: **ACCEPTED (2026-10-31): option (a), production only, PUBLIC_BASE_URL required.** Implementation tracked as item #7.

## Context
- SEO role edits `documents.meta_title` (<=70), `meta_description` (<=320), `og_image_url` (no CHECK yet) — `backend/db/migrations/002_content.sql`.
- Frontend is a Vite SPA; `frontend/index.html` has a static `<title>` and an empty `#root`. ADR-001 accepted weak SPA SEO.
- Consumers that matter: link-preview bots (Facebook, X, Slack, Zalo) read **only the raw HTML, no JS**; Googlebot renders JS but later and less reliably.
- Express currently serves `/api/*` only; helmet defaults on (this feature needs no inline script).
- Knowledge used: `appsec-xss-csrf` (context-specific encoding, CSP is defense in depth, never put untrusted data in script blocks),
  `perf-http-caching-cdn` (cache/invalidate), `fe-framework-choice` (SPA trade-off already accepted).

## Options
### (a) Express injects per-article meta into the HTML shell for `GET /articles/:slug`
Express reads the built `index.html` once at startup; on that route it looks up the published article by slug and substitutes a marker in
`<head>` with `<title>`, meta description, `og:title/description/image/type/url`, `canonical`; the SPA then boots as usual.
- Pros: fixes link previews and crawlers with one route + one query, no SSR framework; keeps SPA/stack/ADR-001; makes the SEO role's fields observable.
- Cons: Express also knows the article URL scheme; prod/dev split (Vite dev serves its own shell); head only (body still client-rendered); needs small cache.

### (b) Fields stored, not rendered server-side (documented limitation)
- Pros: zero work, zero new attack surface.
- Cons: SEO role edits fields with no observable effect (hollow feature in the demo); previews show generic "News Portal".

### (c) Full SSR / prerender (React `renderToString`, or bot-UA prerender service)
- Pros: full body indexable.
- Cons: second render target for every page, hydration mismatches, bot-UA detection (cloaking risk, spoofable) or an external service.
  Contradicts ADR-001 rejection of Next.js and "do only what was asked". Reconsider only if full-text indexing becomes a requirement.

## Traps for (a) (decide up front)
1. **XSS in `<head>`**: values are SEO-role input. HTML-escape `& < > " '` for every inserted value, attributes always double-quoted. One `escapeHtml` helper + test with a `"><script>` payload.
2. **No JSON/state in an inline `<script>`** (would force CSP `unsafe-inline`/nonce and `</script>`/U+2028 escaping). Meta tags only; the SPA keeps using `/api/...`.
3. **`og_image_url` validated**: absolute `https://` only on write (blocks `javascript:`/`data:`), plus a DB CHECK in a new migration; escape on output anyway; invalid -> omit tag.
4. **CSP/helmet**: `<meta>` needs no CSP change; keep helmet defaults, do not loosen CSP. The og:image is fetched by the bot, so `img-src` is irrelevant.
5. **Vite asset paths**: inject into the *built* `dist/index.html` (hashed asset URLs preserved) by replacing one marker `<!--seo-meta-->`; never regenerate the shell. Dev may keep Vite serving the shell (prod-only injection).
6. **Visibility**: only `status = published`; draft/unknown slug -> default shell with HTTP 404 (no draft title leak).
7. **Absolute URLs** need `PUBLIC_BASE_URL` from env (canonical, og:url); never trust the `Host` header (host-header/cache poisoning).
8. **Caching**: shell is user-independent, GET only; `Cache-Control: public, max-age=60` or ETag from `updated_at`; never cache anything per-user.
9. **Fallbacks**: `meta_title ?? title`, `meta_description ?? summary`, truncated to the same limits.
10. **Route order**: `/api` first, then `/articles/:slug`, then static + SPA fallback.

## Recommendation
**(a)**, head-only and narrowly scoped: one route, one escape helper, published-only, validated `og_image_url`, no inline script, no CSP change.
Reject (c) for now. (b) is the fallback if the user wants zero scope (then state the limitation in the report).

## Follow-up if (a) is approved (record as new todo, do not build now)
- Migration: CHECK `og_image_url ~ '^https://'`.
- `backend/src/routes/articleShell.js` + `escapeHtml` + tests (escape payload, draft -> 404, fallback fields, marker present).
- `<!--seo-meta-->` marker in `frontend/index.html`; Express serves `frontend/dist` in prod.

## Open questions for the user
1. (a) head injection, (b) store only, or (c) SSR?
2. If (a): prod-only injection OK, or must it also work under `npm run dev`?
3. Is a `PUBLIC_BASE_URL` env var acceptable (canonical / og:url)?
