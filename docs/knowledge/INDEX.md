# Knowledge index (reference-only, read in place in SKILLS_TREE)

Notes are generic; project CLAUDE.md and rules win on conflict. Read only the matched note. More: `SKILLS_TREE/tools/find "<need>" -k knowledge`.

## Frontend
| Note | Use when |
|---|---|
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/fe-html-progressive-enhancement.md` | structuring HTML/JS so pages work before and without JS |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/fe-css-architecture.md` | organising CSS: layers, naming, tokens, specificity |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/fe-css-viewport-and-stacking.md` | dvh/viewport bugs, z-index stacking, overlays |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/ux-responsive-mobile-first.md` | mobile-first responsive layout, breakpoints, touch |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/fe-state-data-fetching.md` | client state, fetching, caching, loading/error states |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/fe-framework-choice.md` | vanilla vs framework decision |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/a11y-wcag-essentials.md` | baseline accessibility requirements |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/a11y-aria-keyboard-focus.md` | ARIA, keyboard nav, focus management in custom widgets |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/ux-forms-errors.md` | form design, validation, error messages |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/ux-design-systems.md` | tokens and component library structure |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/perf-core-web-vitals.md` | LCP/INP/CLS targets and fixes |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/perf-loading-critical-path.md` | slow first paint, render-blocking assets |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/perf-http-caching-cdn.md` | Cache-Control, ETag, CDN, stale assets after deploy |

## Backend
| Note | Use when |
|---|---|
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/be-http-semantics.md` | choosing methods, status codes, idempotency, headers |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/be-api-style-for-web.md` | REST vs RPC vs GraphQL for this app |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/be-realtime.md` | WebSocket/SSE, reconnect, resync |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/security/items/appsec-api-security.md` | hardening API endpoints, rate limits, authz |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/security/items/authn-sessions-cookies.md` | session cookies, logout, fixation |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/security/items/authn-tokens-jwt.md` | using JWT safely (algorithm allowlist, expiry) |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/security/items/appsec-xss-csrf.md` | output escaping, CSP, CSRF protection |

## Architecture
| Note | Use when |
|---|---|
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/software-architecture/items/style-choosing.md` | picking an architecture style |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/software-architecture/items/style-modular-monolith.md` | structuring a single deployable cleanly (default start) |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/software-architecture/items/data-caching.md` | deciding what/where to cache and invalidation |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/software-architecture/items/cross-error-handling-strategy.md` | consistent error handling across layers |

## Database
| Note | Use when |
|---|---|
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/be-data-modeling-migrations.md` | schema design, constraints, versioned migrations |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/database/items/db-sqlite-vs-client-server.md` | SQLite vs Postgres choice |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/database/items/db-query-plan-index-tuning.md` | slow queries, index design, EXPLAIN |
| `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/database/items/pg-online-migrations-locks.md` | zero-downtime Postgres migrations |
