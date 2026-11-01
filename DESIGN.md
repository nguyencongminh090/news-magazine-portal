# DESIGN

## Facts
- Site type and main goal: News & digital magazine portal; goal: comfortable reading and browsing of articles, plus a CMS area (admin/editor/seo) for CRUD and moderation.
- Audience: general readers (all ages, mostly mobile + laptop) and 3 staff roles using a desktop admin area. Content is English (Wikinews seed); UI chrome may be Vietnamese later.
- Brand words: friendly, credible, clear, explainer-like (user chose option E, 2026-10-31).
- Constraints: React + Vite SPA, no component library chosen; accessibility target WCAG 2.2 AA; text-heavy, medium-high content density; prose capped at 66ch (existing fix); SEO meta rendering still undecided (todo #6).
- Longevity: product (years); illustration is a fixed single style, no trend effects.
- Hard filters applied: accessibility (no low-contrast styles, no glass/neumorphism over text); task-critical (login, comment, admin forms keep visible signifiers); audience (older readers: underlined links, body >= 16px); language coverage (fonts must cover Vietnamese diacritics); performance (max 2 webfont files, no heavy motion).

## Directions
Considered A (minimal editorial), B (flat 2.0), C (bento) first; superseded. Redesign options A-F: `features/ui-redesign/` (ADR: `planning.md`). User chose **E**; F (A+E merge) was built but not chosen.

## Chosen
Style: vstyle-handmade-organic ("Warm Illustrated Humanist"), mockup `features/ui-redesign/E-warm-illustrated/`.
Reason: user picked E for a friendly explainer tone; every story pairs illustration + category icon.
Scope: public pages (Home, Category, Search, Article, Auth). Admin pages keep current styling until a separate item.

## Tokens
- Color roles: background cream #FBF6EC, surface paper #F3EAD7, sand #E8D8B9, border #E0CFAC, text ink #1E2A44, text-2 #464F66, muted #5C6479, primary terracotta #B4492A (hover #923818), secondary teal #1B5E63, success sage #3F6B4C, sun #E8A33D (accent only, never text). Measured: ink/bg 13.3:1, muted/bg 5.5:1 (4.9:1 on paper), white/terracotta 5.3:1, teal/bg 6.9:1; all >= AA 4.5:1. Per-category tint pairs (bg/fg) live in styles as tokens. Dark mode out of scope.
- Type: Headlines "Fraunces" (serif, SOFT/WONK axes), UI/body "Nunito Sans"; self-hosted woff2, Vietnamese-capable; max 2 webfont files (variable, latin+vietnamese ranges via unicode-range count as the same family; total weight budget verified at build). Body 17-18px / 1.6-1.75 (article 18px / 1.75), UI chrome >= 16px; 3-level scale: display serif, h3 serif, body sans. Article measure 66ch.
- Spacing unit 8px; scale 4, 8, 16, 24, 32, 48, 64. Page container max 1120px; left rail 224px.
- Radius: 14px small, 22px cards, blob `34px 96px 34px 34px` on media/hero only, pills (999px) for buttons/search/rail items. Imperfection never reaches form controls beyond pill/rounded shape.
- Texture: SVG grain overlay at 7% opacity, pointer-events none; never over text-bearing contrast checks (text sits on flat surfaces).
- Motion: 200-350ms cubic-bezier(.22,.8,.3,1) for hover lift (translateY -2px), drawer slide, progress bar; `@media (prefers-reduced-motion: reduce)` removes all transitions and smooth scroll.
- Icons: one shared inline SVG sprite, stroke 1.8, 20px; illustrations: 8 category SVG scenes + empty-state sprout, one style only.

## Layout
- Public shell: sticky header (logo, pill search, bell/user, one terracotta primary button) + sticky left topic rail (224px, category icon dots, `aria-current` + dot marker); below 1024px the rail becomes a slide-in drawer (scrim, Escape closes, focus returns to the menu button).
- Home: lead story (illustration left, headline right) then Latest list and Most viewed; wavy dividers instead of hairlines.
- Category/search: topic header with illustration, result list (DOM order = reading order) with pagination.
- Article: category hero, headline, byline/date, Key points box, reading-progress bar, drop cap, single 66ch column, tags, rating, comments, report link. Illustrated empty/loading states.
- Auth: centred single-column form with sprout illustration.
- Eye-flow: F/Z path; one focal point per screen (lead on Home, hero on Article, topic header on Category); one primary terracotta action per screen.

## Forbidden
- Links styled as plain text or ghost buttons for primary actions (keep underlined links in prose).
- Card grids replacing lists the reader must scan or compare; DOM order must equal reading order.
- Text over textured/illustrated areas; text below 16px; contrast below AA; more than 2 webfont files.
- Red/green alone for state (always icon or text); sun yellow as text colour; colour-only active nav.
- Second illustration style, hotlinked images, literal colours outside `:root` tokens, glassmorphism, neumorphism, parallax, heavy motion.
