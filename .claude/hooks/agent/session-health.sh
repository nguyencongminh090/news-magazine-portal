#!/usr/bin/env bash
# UserPromptSubmit hook: working rule 5 (CLAUDE.md). When the transcript is large, tell the agent to
# alert the user (Vietnamese, one line) to start a new session. Fires once per size tier per session.
# Warn-only; always exits 0. Thresholds in KB of transcript JSONL (override: SESSION_WARN_KB / SESSION_URGENT_KB).
. "$(dirname "$0")/lib.sh" 2>/dev/null || exit 0
input=$(cat 2>/dev/null) || input=""
tp=$(json_get_from "$input" transcript_path)
[ -n "$tp" ] && [ -f "$tp" ] || exit 0
kb=$(( $(stat -c %s "$tp" 2>/dev/null || echo 0) / 1024 ))
warn=${SESSION_WARN_KB:-1500}; urgent=${SESSION_URGENT_KB:-3000}
tier=0; [ "$kb" -ge "$warn" ] && tier=1; [ "$kb" -ge "$urgent" ] && tier=2
[ "$tier" -gt 0 ] || exit 0
key=$(json_get_from "$input" session_id); key=${key//[^A-Za-z0-9_-]/_}
stamp="${TMPDIR:-/tmp}/session-health-$key"
last=$(cat "$stamp" 2>/dev/null || echo 0)
[ "$tier" -gt "$last" ] || exit 0
printf '%s' "$tier" > "$stamp" 2>/dev/null
if [ "$tier" -eq 2 ]; then lvl="RẤT DÀI"; when="ngay sau bước hiện tại"; else lvl="dài"; when="sau mốc hoàn thành gần nhất"; fi
emit_context UserPromptSubmit "Session health: transcript ~${kb} KB (${lvl}). Per CLAUDE.md working rule 5, add ONE Vietnamese line to your reply: why quality may drop, suggest a new session ${when}, and what to carry over (item #N, todo path, unfinished state — write it to docs/todo or docs/notes first)."
exit 0
