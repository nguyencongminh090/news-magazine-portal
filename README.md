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
| `npm --prefix backend test` | Backend tests |

## Layout
```
backend/   Express API (src/app.js, src/routes/, src/config.js)
frontend/  React app (src/)
docs/      Tracking files and knowledge index
features/  Design folders (ADRs)
```
