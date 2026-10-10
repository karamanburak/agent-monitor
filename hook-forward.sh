#!/bin/sh
# Forwards the JSON that Claude Code hooks deliver on stdin to the local
# monitoring server, tagged with which agent it came from. Set
# AGENT_MONITOR_SOURCE to reuse this for another agent. Gives up silently if
# the server is down; never blocks the agent (always exit 0).

# The Session Analyst runs `claude -p` with this set — don't record the analysis itself.
[ -n "$AGENT_MONITOR_SKIP" ] && { cat >/dev/null; exit 0; }

SOURCE=${AGENT_MONITOR_SOURCE:-claude}
URL=${AGENT_MONITOR_URL:-http://127.0.0.1:3456/event}

PAYLOAD=$(cat)

# Where this session's terminal lives (tty, tmux pane, terminal app), so the
# dashboard's "Go to terminal" can jump straight back to it. Only on the events
# that start or resume a turn — the tool events don't need it, and it keeps the
# ps walk off the hot path. Values are reduced to path-safe characters.
TERM_JSON=''
case "$PAYLOAD" in
  *SessionStart* | *UserPromptSubmit* | *Notification*)
    safe() { printf '%s' "$1" | tr -cd 'A-Za-z0-9._/:%,@+=-'; }
    TTY=''
    P=$PPID
    i=0
    while [ -n "$P" ] && [ "$P" -gt 1 ] 2>/dev/null && [ $i -lt 4 ]; do
      T=$(ps -o tty= -p "$P" 2>/dev/null | tr -d ' ')
      case "$T" in '' | '??') ;; *) TTY="/dev/$T"; break ;; esac
      P=$(ps -o ppid= -p "$P" 2>/dev/null | tr -d ' ')
      i=$((i + 1))
    done
    TERM_JSON="\"term\":{\"tty\":\"$(safe "$TTY")\",\"program\":\"$(safe "$TERM_PROGRAM")\",\"app\":\"$(safe "$__CFBundleIdentifier")\",\"tmux\":\"$(safe "$TMUX")\",\"pane\":\"$(safe "$TMUX_PANE")\"},"
    ;;
esac

case "$PAYLOAD" in
  \{*) PAYLOAD="{\"source\":\"$SOURCE\",$TERM_JSON${PAYLOAD#?}" ;;
esac

printf '%s' "$PAYLOAD" | curl -sf -m 1 -X POST \
  -H "Content-Type: application/json" \
  --data-binary @- \
  "$URL" >/dev/null 2>&1
exit 0
