# A19 — Frontend redesign: option E "Warm Illustrated Humanist"
**Status:** ✅ DONE 2026-11-02 — option E shipped on feature/ui-redesign (heading outline, short-page footer, richer footer with topics/links/licence); axe Critical/Serious = 0 at 1280/390; user approved.
**Area:** frontend/src (styles.css, layouts/PublicLayout.jsx, pages/*, components/*), DESIGN.md, public/assets
**From:** user, 2026-10-31: chose option E from features/ui-redesign (A–F mockups); "Choose E"   **Depends:** —

## Problem
Public UI is classic text-only. User wants image/asset + icon, modern professional look, clear hierarchy.
## Scope
1. Rewrite DESIGN.md to option E (tokens, fonts, layout, forbidden list); user sign-off on the diff first.
2. Port tokens + one shared SVG icon sprite + 8 category illustrations from `features/ui-redesign/E-warm-illustrated/`.
3. Restyle PublicLayout (sticky left topic rail, mobile drawer) and Home/Category/Search/Article/Auth to match mockup.
4. Article page: Key points box, reading-progress bar, drop cap, illustrated empty/loading states.
5. Keep existing React tests green; add tests for new components (drawer, rating).
## Don't
- Admin pages (separate item), dark mode, new npm deps, hotlinked images, second illustration style.
- Change API contracts. Cards must not replace lists the reader must scan (keep DOM order = reading order).
## Traps
- Mockup E is reference only; F (A+E merge) was built but NOT chosen.
- DESIGN.md limits: max 2 webfont files, body >=16px, AA contrast, reduced motion. E uses Fraunces + Nunito Sans: self-host Vietnamese-capable subsets (replace Source Serif files); verify weight budget.
- Mockup flaws to fix, not copy: category thumbnails reuse politics scene; weather rainbow clipped; sprite duplicated per page; literal `#fff` outside :root; drawer `inert`/Escape untested with assistive tech; sun-yellow on cream contrast unchecked.
- Articles have no image field; art is chosen by category (og_image_url optional later).
- Hard rule 7: one payload/component per entity across pages.
## Why this way
User picked E for friendly explainer tone; ADR-style choice recorded in features/ui-redesign/planning.md.
## Done when
- Home/Category/Search/Article match E at 1280 and 390, no horizontal scroll, axe Critical/Serious = 0.
- Backend + frontend tests pass; real-browser pass; contrast measured by script.
