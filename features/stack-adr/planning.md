# ADR-001: Tech stack for News Portal (assignment)

Status: **APPROVED by user (2026-10-31)**. Dataset: Wikinews (EN). Formalized as A01–A03 in docs/todo/.

## Context
- Assignment: full-stack news/magazine portal, CRUD, auth, RBAC (4 roles), seed 50–100 real articles.
- Phase 2: custom search engine (tokenization, inverted index, BM25/TF-IDF) over the same documents + search/click log.
- Brief lists RDBMS (PostgreSQL, MySQL) or MongoDB; SQLite is not listed.
- Domain chosen: News & Digital Magazine Portal (public news datasets make seed data easy).

## Decision
| Layer | Choice |
|---|---|
| DB | PostgreSQL |
| Backend | Node.js + Express, REST |
| Frontend | React + Vite (SPA) |
| Architecture | Modular monolith, one repo, `backend/` + `frontend/` |

## Rationale (knowledge notes)
- `db-sqlite-vs-client-server`, `db-full-text-search-choice`: relational data; Postgres `tsvector` gives a baseline to compare with Phase 2 BM25.
- `be-api-style-for-web`: REST fits CRUD + RBAC middleware; GraphQL adds cost without need.
- `fe-framework-choice`: admin UI is form/table heavy, framework pays off.
- `style-modular-monolith`: default single deployable.

## Rejected
- Next.js full-stack (backend less visible for grading), Express+EJS (weak admin UX), FastAPI/Django (user preference: Node).

## Consequences / risks
- SPA is weaker for SEO than SSR; acceptable for assignment (SEO role only edits metadata).
- Need migrations with versioning; ORM vs raw `pg` still open.

## Resolved (user, 2026-10-31)
- DB access: `node-pg` + versioned SQL migrations (no ORM). Parameterized queries only.
- Language: JavaScript.
- Auth: JWT (user choice). Notes `authn-tokens-jwt`, `be-auth-integration`, `authn-passwords` warn JWT is a weak default session, so mitigations are mandatory:
  - access token short-lived (~15 min), held in memory only (never localStorage);
  - refresh token in httpOnly+Secure+SameSite cookie, opaque, stored hashed in DB, rotated on use, revocable (logout / role change);
  - fix algorithm on verifier (HS256 or RS256, reject none), check exp/iss/aud, strong random key from env;
  - role checked server-side per request from DB or short-TTL claim, never trust client role;
  - passwords: Argon2id, length>=8 w/ blocklist, generic login errors, rate limit login, CSRF defence on refresh endpoint.
- Dataset: see below.

## Open
1. (closed) Dataset = Wikinews EN, CC BY; attribution in DATA_LICENSE.md.
