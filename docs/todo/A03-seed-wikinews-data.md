# A03 — Seed 50–100 real articles (Wikinews EN) + license file
**Status:** ✅ DONE 2026-10-31 — 104 articles (8 categories), CC BY 4.0 verified, seed idempotent (2 runs identical)
**Area:** `backend/db/seed/`, `DATA_LICENSE.md`
**From:** features/stack-adr (approved 2026-10-31)   **Depends:** A02

## Problem
Brief requires 50–100 realistic records, no Lorem Ipsum.
## Scope
1. Script fetches/imports ~100 English Wikinews articles (title, text, category, date, source URL).
2. Generate author, tags, summary (first sentences), views_count deterministically (seeded RNG).
3. `DATA_LICENSE.md`: source, per-article URL/author, CC BY version (verify on the actual dump/page).
4. Seed also creates 4 demo users (one per role) with documented dev-only passwords.
## Don't
- Don't include images with unclear license. Don't commit huge raw dumps.
## Traps
- Wikinews license moved CC BY 2.5 → 4.0 on some editions: record the one actually served.
- Strip wiki markup/templates from content.
## Why this way
Cleanest redistributable license for a public GitHub repo (BBC News content is BBC copyright).
## Done when
- ≥ 50 documents seeded, categories populated, license file complete, seed idempotent.
## Notes
- Author = real Wikinews creator (CC BY attribution), IPs replaced by "Anonymous Wikinews contributor"; tags = the articles' own Wikinews categories (deviates from "generate").
- Dataset in `backend/db/seed/articles.json` (388 KB, committed); `fetch-wikinews.js` is resumable; Argon2id via `argon2`.
