# News Portal

News & Digital Magazine Portal (assignment). Phase 1: CRUD, authentication, RBAC. Phase 2 prep: document store + search/click log.

**Stack:** Node.js (Express, ESM) · PostgreSQL (`pg`, plain SQL migrations) · React + Vite.
Design decisions: [`features/stack-adr/planning.md`](features/stack-adr/planning.md).

## Run locally
Requires Node >= 20.12 (and PostgreSQL from the schema item onward).

```bash
npm install && npm --prefix backend install && npm --prefix frontend install
cp .env.example .env        # optional for now; needed once the database is used
npm run dev                 # API http://localhost:4000, web http://localhost:5173
```

| Command | Purpose |
|---|---|
| `npm run dev` | API + Vite dev server (`/api` is proxied) |
| `npm run build` | Production frontend bundle (`frontend/dist`) |
| `npm --prefix backend test` | Backend tests (set `TEST_DATABASE_URL` to a **disposable** Postgres DB to also run the DB tests; they drop schema `public`, so files run serially) |
| `npm --prefix backend run migrate` | Apply pending SQL migrations to `DATABASE_URL` |
| `npm --prefix backend run seed` | Load the 104 Wikinews articles and 4 demo users (idempotent; run after `migrate`) |

## Layout
```
backend/   Express API (src/app.js, src/routes/, src/config.js); db/migrations/*.sql + db/migrate.js
frontend/  React app (src/)
docs/      Tracking files and knowledge index
features/  Design folders (ADRs)
```

## Seed data
`backend/db/seed/articles.json` holds real English Wikinews articles (CC BY 4.0, see [DATA_LICENSE.md](DATA_LICENSE.md)).
`seed` upserts them by slug, so reruns change nothing. `node backend/db/seed/fetch-wikinews.js` refreshes the dataset
(resumable) and `node backend/db/seed/build-license.js` rewrites `DATA_LICENSE.md`.

Demo accounts, **local development only** (password for all: `DevPassw0rd!`):
`admin@example.test`, `editor@example.test`, `seo@example.test`, `reader@example.test`.

## Database schema
PostgreSQL, plain SQL migrations in `backend/db/migrations/` (`NNN_name.sql`, applied in order, one transaction each,
tracked in `schema_migrations` with a checksum; never edit an applied file, add a new one).

| Area | Tables |
|---|---|
| Auth / RBAC | `users`, `roles` (seeded: admin, editor, seo, reader), `user_roles`, `refresh_tokens` (SHA-256 hash; `family_id` has no default, rotation inherits the parent's family; `used_at`/`replaced_by` mark rotated tokens so reuse is detectable) |
| Content | `categories`, `tags`, `documents`, `document_tags` (tags only via this junction; API exposes a tag list) |
| Engagement | `comments`, `ratings` (1-5, one per user/document), `reports` (targets exactly one document or comment; one report per reporter per target) |
| Logs | `search_click_log` (`user_id` NULL = anonymous), `audit_log` |

`documents.status` is `draft|published|archived`; `published` requires `published_at`. SEO fields: `slug`, `meta_title`,
`meta_description`, `og_image_url`. `updated_at` is maintained by a shared `set_updated_at()` trigger (users, documents, comments, ratings).
`documents.tsv` is a generated weighted `tsvector` (`english`, title A > content B) with a GIN index; no search queries yet (Phase 2).
Prefer `status = 'archived'` over deleting a document: a hard delete cascades `search_click_log`, comments, ratings and reports.
`views_count` must not be UPDATEd per page view on the hot row; decide the counting strategy (batched/async) before the articles API.
