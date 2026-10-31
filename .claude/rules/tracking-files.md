---
paths:
  - "TODO.md"
  - "docs/todo/**"
  - "docs/fix-log.md"
  - "docs/fix-log/**"
  - "docs/notes/**"
  - "docs/templates/**"
  - "docs/archive/**"
---

# Tracking files: small indexes, one detail file per item

Readers are agents; every byte read costs quota. Indexes stay one line per item, detail lives one level
down, nothing is read whole.

| Index | Detail | Template |
|---|---|---|
| `TODO.md` — open items only | `docs/todo/<CODE>-<slug>.md` (`A01`, `B12`) | `docs/templates/todo.md` |
| `docs/todo/DONE.md` — finished, 1 line each | same detail file | — |
| `docs/fix-log.md` — append-only table | `docs/fix-log/<YYYY-MM-DD>-<slug>.md` | `docs/templates/fix-log.md` |
| — | `docs/notes/<date>-<slug>.md` (size-S, expiring) | `docs/templates/note.md` |

Read with `node scripts/track.js <N|CODE>` / `open` / `find <kw>` / `log [N]` — never Read an index or
`fix-log.md` whole. `docs/archive/*` is frozen history: grep only.

## Write
- English for new entries; quote the user verbatim in their own language.
- **Add:** copy template → `docs/todo/<CODE>-<slug>.md` (≤ 40 lines), then ONE `TODO.md` line:
  `- **#N.** title \`[Model: …]\` — [detail](docs/todo/<CODE>-<slug>.md)`. Titles only, no results.
- **Finish = ONE edit touching both:** detail gets `**Status:** ✅ DONE|FIXED|CLOSED|VERIFIED <date> …`;
  the `TODO.md` line moves to the top of `DONE.md` prefixed `✅`. The `Stop` hook
  (`scripts/check-tracking-sync.js`, diff mode vs git HEAD; `--full` audits all) blocks a newly-✅ item with no marker.
- **Fix-log:** every bug fix = new `docs/fix-log/<date>-<slug>.md` (≤ 30 lines) + one row
  `| timestamp | ≤160-char summary | [detail](path) |`. Append-only; a wrong entry gets a correcting entry.
  Timestamp = real time (`date "+%Y-%m-%d %H:%M"`).

## Task size
| Size | Test (all hold) | Artifact |
|---|---|---|
| **S** | ≤ ~2 files, one layer, no design choice, reversible | commit message; `docs/notes/` if a trap is worth keeping |
| **M** | several files or a real choice, one layer | todo detail + 1 index line |
| **L** | cross-layer, protocol/format/toolchain, hard to reverse | `features/<slug>/` → todo |
Unsure → pick the larger. Bug fix always gets a fix-log entry.

## Model tier (`[Model: …]` on the TODO line)
Haiku = measurement/reproduce, no judgement · Sonnet = scoped implementation (default) ·
Opus = architecture/security tradeoffs, multi-round root-cause diagnosis.
