# A04 — Migration 005: schema hardening from architecture review
**Status:** OPEN
**Area:** `backend/db/migrations/005_*.sql`, README schema section, `backend/db/migrate.test.js`
**From:** architecture review vs knowledge, 2026-10-31   **Depends:** A02

## Problem
Review of 001-004 found gaps that block auth rotation, list performance and data integrity.
## Scope
1. `refresh_tokens`: drop `DEFAULT` on `family_id` (code must inherit parent family) and add `replaced_by` / `used_at`
   so reuse of a rotated token is detectable (`revoked_at` alone cannot tell rotated from logged-out).
2. `updated_at` maintenance: one shared trigger fn on tables that have it, or record the decision to set it in code.
3. Index `documents (category_id, published_at DESC) WHERE status = 'published'`; review whether
   `documents_created_at_idx` / `documents_author_id_idx` are needed.
4. `reports`: partial unique indexes on (reporter_id, document_id) and (reporter_id, comment_id) where not null.
5. Phase-2 baseline: generated `tsv` column (`'english'`, `setweight` title > content) + GIN index.
6. Test the new constraints in `migrate.test.js`; update README schema table.
## Don't
- Never edit 001-004 (checksum guard rejects it); add 005 only. No search ranking/query code (Phase 2).
## Traps
- `views_count`: do not UPDATE per page view on the hot row; decide counting strategy before the articles API (note in item A05/A06 or here).
- Hard-deleting a document cascades `search_click_log`; prefer `status='archived'` (document in README).
- `CREATE INDEX CONCURRENTLY` cannot run inside the runner's per-file transaction; fine at this data size.
## Why this way
knowledge: `pg-schema-types-keys`, `pg-index-types`, `db-full-text-search-choice`, `be-data-modeling-migrations`.
## Done when
- 005 applies on empty DB and on a DB at 004; tests pass with `TEST_DATABASE_URL`.
