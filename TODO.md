# TODO — open items only

Index. One line per item → detail `docs/todo/<CODE>-<slug>.md`. Finished items: one line each in `docs/todo/DONE.md`.
Lookups: `node scripts/track.js <N|CODE>` · `track.js open` · `track.js find <kw>`. Rules: `.claude/rules/tracking-files.md`.

Add: detail file from `docs/templates/todo.md`, then ONE line below:
`- **#N.** title \`[Model: Haiku|Sonnet|Opus]\` — [detail](docs/todo/<CODE>-<slug>.md)`
Finish: in ONE edit set `**Status:** ✅ DONE|FIXED|CLOSED|VERIFIED` in the detail file and MOVE the line to the top of `DONE.md` prefixed `✅`.
- **#21.** Frontend: `/verify-email` page + "resend verification email" button `[Model: Sonnet]` — [detail](docs/todo/A21-verify-email-page.md)
- **#22.** Bug: mail links have no origin when `PUBLIC_BASE_URL=` is empty (`??` keeps `''`) `[Model: Sonnet]` — [detail](docs/todo/A22-mail-link-empty-base-url.md)
