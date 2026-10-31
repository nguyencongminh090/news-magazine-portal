# TODO — open items only

Index. One line per item → detail `docs/todo/<CODE>-<slug>.md`. Finished items: one line each in `docs/todo/DONE.md`.
Lookups: `node scripts/track.js <N|CODE>` · `track.js open` · `track.js find <kw>`. Rules: `.claude/rules/tracking-files.md`.

Add: detail file from `docs/templates/todo.md`, then ONE line below:
`- **#N.** title \`[Model: Haiku|Sonnet|Opus]\` — [detail](docs/todo/<CODE>-<slug>.md)`
Finish: in ONE edit set `**Status:** ✅ DONE|FIXED|CLOSED|VERIFIED` in the detail file and MOVE the line to the top of `DONE.md` prefixed `✅`.

- **#10.** Implement frontend UI from DESIGN.md + approved mockup `[Model: Sonnet]` — [detail](docs/todo/A10-frontend-ui-implementation.md)
- **#11.** Read API for articles and categories `[Model: Sonnet]` — [detail](docs/todo/A11-articles-read-api.md)
- **#12.** Fix migrate test that hardcodes migration 005 as the latest `[Model: Haiku]` — [detail](docs/todo/A12-migrate-test-005-hardcodes-latest.md)
- **#13.** Seed safety: production guard, keep views_count on rerun, test IP anonymiser `[Model: Sonnet]` — [detail](docs/todo/A13-seed-safety-and-followups.md)
