# DESIGN

## Facts
- Site type and main goal: News & digital magazine portal; goal: comfortable reading and browsing of articles, plus a CMS area (admin/editor/seo) for CRUD and moderation.
- Audience: general readers (all ages, mostly mobile + laptop) and 3 staff roles using a desktop admin area. Content is English (Wikinews seed); UI chrome may be Vietnamese later.
- Brand words: credible, calm, clear, editorial (proposed; no brand supplied).
- Constraints: React + Vite SPA, no component library chosen; accessibility target WCAG 2.2 AA; text-heavy, medium-high content density; prose capped at 66ch (existing fix); SEO meta rendering still undecided (todo #6).
- Longevity: product (years), so avoid trend effects.
- Hard filters applied: accessibility (no low-contrast styles, no glass/neumorphism over text); task-critical (login, comment, admin forms keep visible signifiers); audience (older readers: underlined links, body >= 16px); language coverage (fonts must cover Vietnamese diacritics); performance (max 2 webfont files, no heavy motion).

## Directions
### A. Minimal editorial (safe)
- Style note: vstyle-minimalism-swiss
- Why: matches the "personal blog, news, docs" row of the site-type matrix; fewest built-in risks; cheapest to build.
- Risk: can read as generic. Mitigation: one accent colour, serif headlines, large lead image on the top story.
### B. Flat 2.0 component-driven
- Style note: vstyle-flat-material
- Why: strong buttons and tables suit the admin area.
- Risk: public pages look like every other app. Mitigation: custom theme, never library defaults.
### C. Magazine bento (bold)
- Style note: vstyle-bento-modular
- Why: distinctive magazine homepage.
- Risk: cards scan worse than lists (NN/g); breaks reading order. Mitigation: homepage only.

## Chosen
Style: vstyle-minimalism-swiss
Reason: user picked direction A; content-first, accessible, lowest risk for a text-heavy portal.

## Tokens
- Color roles: background #FAFAF7, surface #FFFFFF, border #E3E1DA, text #1A1A1A, muted text #5C5C58, primary/accent #8A1C1C, success #1F6B3A, warning #8A5A00, danger #B3261E. Text pairs: text/background ~16:1, muted/background ~6.3:1, primary/surface ~9:1, all >= AA 4.5:1. Dark mode is an optional later toggle, not default.
- Type scale: body 18px / line-height 1.65 (article), 16px / 1.5 (UI chrome); ratio 1.25; h1 40px, h2 28px, h3 22px; at most three sizes per section. Headlines: "Source Serif 4", Georgia, serif. UI/body: system-ui, sans-serif.
- Spacing unit: 8px; scale 4, 8, 16, 24, 32, 48, 64. Article column max 66ch; page container max 1120px.
- Radius: 2px for inputs/buttons, 0 for images, no pill shapes.
- Motion: 150ms ease-out for hover/focus colour only; no parallax or reveal animations; `@media (prefers-reduced-motion: reduce)` removes all transitions.

## Layout
- Sections (top to bottom):
  - Public home: masthead + category nav; lead story (large image + serif headline + summary) with 2 secondary stories; latest-news list (title, category, date, 1-line summary); sidebar (most viewed, categories); footer (license, about).
  - Category/search page: heading + filter bar, then a list of results with pagination.
  - Article page: category, headline, byline/date, lead image, single 66ch column, tags, rating, comments, report link.
  - Auth pages: centred single-column form.
  - Admin (admin/editor/seo): fixed left nav, data table with row actions, flat forms on the same tokens.
- Eye-flow note: eye enters at the lead headline (top-left, largest serif text), then follows a Z/F path down the list; one primary action per screen (Read / Publish / Sign in) in the accent colour, everything else neutral.

## Forbidden
- Links styled as plain text or ghost buttons for primary actions (no removing signifiers; keep underlined links).
- Using minimalism to hide thin content; empty space must not look unfinished.
- Playful, loud or nostalgic styling, glassmorphism, neumorphism, heavy motion, card grids for lists the reader must scan or compare.
- Red/green alone to signal state (always add icon or text).
- Text below 16px, text contrast below AA, more than 2 webfont files.
