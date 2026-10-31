# TODO — open items only

Index. One line per item → detail `docs/todo/<CODE>-<slug>.md`. Finished items: one line each in `docs/todo/DONE.md`.
Lookups: `node scripts/track.js <N|CODE>` · `track.js open` · `track.js find <kw>`. Rules: `.claude/rules/tracking-files.md`.

Add: detail file from `docs/templates/todo.md`, then ONE line below:
`- **#N.** title \`[Model: Haiku|Sonnet|Opus]\` — [detail](docs/todo/<CODE>-<slug>.md)`
Finish: in ONE edit set `**Status:** ✅ DONE|FIXED|CLOSED|VERIFIED` in the detail file and MOVE the line to the top of `DONE.md` prefixed `✅`.

- **#3.** Seed Wikinews articles + DATA_LICENSE `[Model: Sonnet]` — [detail](docs/todo/A03-seed-wikinews-data.md)
- **#8.** Update .env.example for new config variables `[Model: Haiku]` — [detail](docs/todo/A08-env-example-new-vars.md)
- **#9.** Fix migrate.js trailing-slash dir argument `[Model: Sonnet]` — [detail](docs/todo/A09-migrate-dir-trailing-slash.md)
