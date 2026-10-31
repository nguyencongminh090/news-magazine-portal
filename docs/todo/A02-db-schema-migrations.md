# A02 — PostgreSQL schema + versioned SQL migrations
**Status:** ✅ DONE 2026-10-31 — 4 migrations + runner + test; schema doc in README. Assumed role names admin/editor/seo/reader and ratings only (no separate likes); `author_name` text + nullable `author_id`.
**Area:** `backend/db/migrations/*.sql`, migration runner script
**From:** features/stack-adr (approved 2026-10-31)   **Depends:** A01

## Problem
Need schema for RBAC, content, engagement and Phase-2 prep tables.
## Scope
1. Plain `.sql` migrations + tiny runner (applied-migrations table).
2. Tables: users, roles, user_roles (4 roles), refresh_tokens (hashed), categories, tags, document_tags,
   documents (id,title,content,summary,category_id,author,created_at,views_count,status + SEO fields),
   comments, ratings/likes, flags/reports, search_click_log (user_id,query_string,clicked_doc_id,timestamp),
   audit/system_log.
3. Constraints, FKs, indexes (category, created_at, tags).
## Don't
- No ORM. Don't add search indexes beyond basic (Phase 2).
## Traps
- `tags` is required on documents by brief: junction table + expose tag list in payload (one entity = one source).
- `user_id` in click log nullable (anonymous search).
## Why this way
knowledge: `be-data-modeling-migrations`.
## Done when
- Migrations apply cleanly on empty DB and are re-runnable; schema doc in README.
