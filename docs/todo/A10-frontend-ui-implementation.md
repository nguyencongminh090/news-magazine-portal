# A10 — Implement frontend UI from DESIGN.md and approved mockup
**Status:** IN PROGRESS — public views (Home, Category, Search, Article, category nav) wired to the API and quality-gated 2026-10-31 (ui-audit 0 block / 0 major, real-browser pass done). Unknown-category 404 done. Remaining (auth items blocked by #14 auth API): auth wiring (login/register), Admin (articles table + form, role-gated nav), comments/rating/report, per-page titles (#7).
**Area:** `frontend/src/`, `frontend/index.html`, `DESIGN.md`, `features/ui-mockup/mockup.html`
**From:** UI design session, mockup approved by user 2026-10-31   **Depends:** A05 (API), A03 (seed data) for real content

## Problem
Frontend is only a stub; no pages, routing or styles beyond a base reset.
## Scope
1. Move `:root` tokens from the mockup into `frontend/src/styles.css`; font: Source Serif 4 (max 2 webfont files, Vietnamese subset) + system-ui.
2. Routes: Home, Category/Search, Article, Sign in/Register, Admin (articles table + form first); layout per `DESIGN.md` ## Layout.
3. Public pages use lists, not cards; one primary action per screen; role-gated admin nav (UI hint only, server enforces RBAC).
4. Use real API data; no hardcoded article content.
## Don't
- Don't deviate from `DESIGN.md` ## Forbidden. Don't add a component library. Don't build features beyond the mockup views (no dark mode yet).
- Don't start before A05 exposes the endpoints being consumed.
## Traps
- Prose width 66ch and body >= 16px must survive; keep contrast pairs AA.
- Status shown by text/icon, never colour alone. `prefers-reduced-motion` must disable transitions.
- SEO meta rendering follows ADR `features/seo-meta/` (item #7), not this item.
## Why this way
Single source of tokens in `DESIGN.md`; mockup is the visual reference.
## Done when
- Views match mockup at desktop and ≤800px; `ui-audit` has no block/major findings; console clean in a real-browser pass.
