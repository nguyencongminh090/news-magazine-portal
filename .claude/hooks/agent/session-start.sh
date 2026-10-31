#!/usr/bin/env bash
# SessionStart hook: orient the agent with open backlog items (titles only). Warn-only; always exits 0.
. "$(dirname "$0")/lib.sh" 2>/dev/null || exit 0
dir=$(project_dir)
[ -f "$dir/scripts/track.js" ] || exit 0
open=$(node "$dir/scripts/track.js" open 2>/dev/null | head -n 8)
[ -n "$open" ] || open="(no open items)"
emit_context SessionStart "Open TODO items (node scripts/track.js <N> for detail; reply to the user in Vietnamese):
$open"
exit 0
