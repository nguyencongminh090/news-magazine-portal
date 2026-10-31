# A01 — Project foundation (repo, layout, tooling)
**Status:** ✅ DONE 2026-10-31 — skeleton verified (backend tests 2/2, build, dev proxy); git repo already initialised, remote pending
**Area:** repo root, `backend/`, `frontend/`, `.gitignore`, `.env.example`, `README.md`
**From:** features/stack-adr (approved 2026-10-31)   **Depends:** —

## Problem
No git repo, no app skeleton. Brief requires a GitHub repo.
## Scope
1. `git init`, `.gitignore` (node_modules, .env, build output), branch `main`; remote added by user.
2. `backend/` Express (JS, CommonJS or ESM — pick one, note it), `node-pg`, env loading, health route.
3. `frontend/` React + Vite (JS), proxy to backend in dev.
4. `.env.example` (DB url, JWT secret, token TTLs); root README with run steps.
5. Add real app commands to `CLAUDE.md` Commands section.
## Don't
- No auth/CRUD here. No ORM. No secrets committed.
## Traps
- `check-tracking-sync.js` needs a git baseline: first commit before relying on it.
## Why this way
ADR: modular monolith, Express REST + PostgreSQL + React/Vite.
## Done when
- `npm run dev` serves backend health + frontend page; repo committed; README accurate.
