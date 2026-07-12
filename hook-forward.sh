#!/bin/sh
# Forwards the JSON that Claude Code hooks deliver on stdin to the local
# monitoring server, tagged with which agent it came from. Set
# AGENT_MONITOR_SOURCE to reuse this for another agent. Gives up silently if
# the server is down; never blocks the agent (always exit 0).

SOURCE=${AGENT_MONITOR_SOURCE:-claude}
URL=${AGENT_MONITOR_URL:-http://127.0.0.1:3456/event}

PAYLOAD=$(cat)
case "$PAYLOAD" in
  \{*) PAYLOAD=$(printf '%s' "$PAYLOAD" | sed "s/^{/{\"source\":\"$SOURCE\",/") ;;
esac

printf '%s' "$PAYLOAD" | curl -sf -m 1 -X POST \
  -H "Content-Type: application/json" \
  --data-binary @- \
  "$URL" >/dev/null 2>&1
exit 0
