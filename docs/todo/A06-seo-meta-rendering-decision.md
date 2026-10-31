# A06 — Decide how SEO meta fields reach crawlers (SPA vs server render)
**Status:** ✅ DONE — ADR accepted (a); implementation recorded as #7
**Area:** `features/seo-meta/` (ADR, size L), possibly Express route for `/articles/:slug`
**From:** architecture review vs knowledge, 2026-10-31   **Depends:** A02

## Problem
SEO role edits `meta_title`, `meta_description`, `og_image_url`, but a pure SPA never serves them to crawlers or link previews.
## Scope
1. ADR in `features/seo-meta/planning.md`: (a) Express injects per-article meta into the HTML shell for `/articles/:slug`,
   or (b) state in the report that fields are stored but not rendered server-side. Get user sign-off before building.
## Don't
- No implementation before sign-off (size L: architecture choice).
## Traps
- If (a): helmet CSP and Vite asset paths; escape all meta values (XSS in `<head>`).
## Why this way
ADR `features/stack-adr/planning.md:29` accepted SPA SEO weakness; this closes the loop explicitly.
## Done when
- ADR approved by user; follow-up implementation item recorded if (a) is chosen.
