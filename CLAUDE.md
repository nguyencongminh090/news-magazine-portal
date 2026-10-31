# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# WebProj — agent rules

New WebApp workspace. **No application code exists yet** and the stack is undecided (frontend / backend / DB).
Harness is ported from `gomoku-vn` (`/run/media/ngmint/Data/Programming/Programming/HTML/gomoku-vn`, its `CLAUDE.md` +
`.claude/rules/` are the reference). This file holds **hard rules and pointers only**; detail lives in
path-scoped `.claude/rules/*.md` (auto-load on matching files) and skills (`.claude/skills/`, on demand).

## Commands
Stack (ADR `features/stack-adr/planning.md`): Express (ESM JS) + PostgreSQL (`pg`, SQL migrations) + React/Vite. No lint command yet.
- `npm install` (root) then `npm --prefix backend install` and `npm --prefix frontend install`
- `npm run dev` — API :4000 + Vite :5173 (proxies `/api`); `npm run build` — frontend bundle
- `npm --prefix backend test` — backend tests (`node --test`)
Harness:
- `node scripts/track.js <N|CODE> | open | find <kw> | log [N]` — read tracking indexes cheaply
- `node scripts/check-tracking-sync.js [--full]` — ✅ item ↔ detail-file status check (also the `Stop` hook)

## Hard rules
1. **Do only what was asked now.** A new requirement raised mid-conversation is *recorded*, not built
   (size-L idea → `features/<slug>/`; otherwise `docs/todo/<CODE>` file + 1 `TODO.md` line).
2. **Read the item's `docs/todo/<CODE>` file before implementing it** (`node scripts/track.js <N>`: Scope, Don't, Traps).
3. **Every bug fix = root cause first, a kept regression test, one fix-log entry**; scope strictly what was reported.
4. **Tracking files are small indexes + one detail file per item; fix-log is append-only.** Never Read an index whole.
   → `.claude/rules/tracking-files.md`
5. **Ambiguous prompt** (no item id / file / behaviour): ask ONE `AskUserQuestion` with concrete options. Clear short
   prompts ("run tests", "continue") just execute. `prompt-architect` only for an explicit "improve this prompt".
6. **Stack / architecture / DB choices are size L**: ground them in `docs/knowledge/INDEX.md` then SKILLS_TREE
   `tools/find` (→ `.claude/rules/knowledge.md`), write an ADR-style `features/<slug>/` first, get user sign-off.
7. **One entity = one source** across pages and DB ↔ file store; shared payload builders, no per-page variants.

## Working rules (user-set)
1. **Use knowledge to reason** — quyết định thiết kế/kiến trúc/bảo mật/DB/UX dựa trên note, không theo thói quen (mục dưới).
2. **Conversation language: Vietnamese.** Trả lời, hỏi lại, báo cáo bằng tiếng Việt; code, identifier, commit message,
   tracking files (TODO/fix-log/todo detail) viết tiếng Anh; thuật ngữ kỹ thuật giữ nguyên gốc.
3. **gomoku-vn rules apply** unless this file says otherwise — reference `/run/media/ngmint/Data/Programming/Programming/HTML/gomoku-vn/CLAUDE.md`
   + its `.claude/rules/`. Ported so far: hard rules 1–5, 7 (consistency), token economy, tracking. Not yet ported (adopt when relevant):
   git workflow (`fix/*` off `main`, `feature/*` off `dev`, one commit per fix, merge commits only), feature "done" = backend tests +
   jsdom + real-browser pass, cache-busting `?v=` hash, `playwright-e2e-safety`.
4. **Clean Code** → `.claude/rules/clean-code.md` (standards read in place from SKILLS_TREE).
5. **Session health alert.** Chủ động cảnh báo user (một dòng, tiếng Việt) khi context dài/gần đầy hoặc chất lượng có nguy cơ giảm:
   sau nhiều lượt đọc file lớn/ output dài, khi đổi sang task không liên quan, sau khi xong một mốc (item ✅, commit, xong một skill/feature),
   hoặc khi thấy mình bắt đầu lặp/quên fact đã chốt. Nêu rõ: *vì sao*, *nên mở session mới lúc nào* (ngay / sau bước hiện tại), và
   *cần mang theo gì* (item `#N`, đường dẫn todo, trạng thái dở dang — ghi vào `docs/todo`/`docs/notes` trước khi đóng). Không đợi tới khi bị auto-compact.

## Reasoning with knowledge
Design / architecture / security / DB / UX decision → `docs/knowledge/INDEX.md` first, then
`$SKILLS_TREE/tools/find "<need>" -k knowledge`. `$SKILLS_TREE` = `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE`
(set in `.claude/settings.json`; usage in `~/.claude/CLAUDE.md`). Precedence: this file, `.claude/rules/*`,
user instructions > knowledge notes.

## Token / quota economy
- Locate before read: `codegraph_explore` only if a `.codegraph/` exists (none yet); else `grep -n` then `Read` with `offset/limit`.
- Never Read `TODO.md`, `docs/fix-log.md`, `docs/todo/DONE.md`, `docs/archive/*` whole — use `scripts/track.js`.
  Never Read lockfiles, build output, `node_modules/`, `test-results/`.
- Don't re-derive facts already settled in the conversation or a detail file.
- Run narrow tests while iterating, full suite once before commit; `| tail -30` on long output.
- Subagents cost a cold start: use only for sweeps >3 greps, truly parallel work, or SKILLS_TREE multi-query/copy work.
- Write terse: English tracking text, ≤ 40-line todo files, ≤ 30-line fix-log entries; final replies = result + what's unverified.

## Where detail lives
| Topic | Location |
|---|---|
| Index/detail layout, status markers, task size, `[Model: …]` tier | `.claude/rules/tracking-files.md`, `docs/templates/` |
| Knowledge lookup procedure | `.claude/rules/knowledge.md`, `docs/knowledge/INDEX.md` |
| `features/<slug>/` design folders | `.claude/rules/design-intake.md` |
| Skills (frontend, backend/architecture/DB, prompt-architect) | `.claude/skills/*` (copied from SKILLS_TREE; read each `README.WARNING.md` for hardcoded refs) |

## Not yet set up (do when the stack is chosen)
No commits yet (`check-tracking-sync.js` fails open without a baseline) · architecture section here · test + cache-busting + git-workflow rules (gomoku-vn's `testing.md`, `cache-busting.md`, `git-workflow` skill are templates).
