---
paths:
  - "docs/knowledge/**"
  - "docs/notes/**"
---
# Reasoning with knowledge (stop at first hit)
Before a design / architecture / security / DB / UX decision, ground it in a documented note, not habit.
1. **Index** — `docs/knowledge/INDEX.md` (one line per note; read the index, then ONLY the matched note).
2. **Search** — `$SKILLS_TREE/tools/find "<need, plain English>" -k knowledge` (never `python3`; first run ≤ 1 min).
   Read the 1–2 best notes in place; check `apply_when`, "Do not use when", `confidence` (`low` = verify first).
   2+ queries or any copy → delegate to an Agent.
3. **Promote:** a note used a 2nd time → copy into `docs/knowledge/` (keep frontmatter, add `source:` + date) and
   register it in the index. Never copy whole domains; never edit the SKILLS_TREE original.
Precedence: `CLAUDE.md`, `.claude/rules/*`, user instructions > knowledge notes. Cite the note path in the todo/fix-log.
Skills are copied into `.claude/skills/` only on request: `find --copy <dest> --pick <name>`.
