# Connecting other agents

The dashboard is agent-agnostic. It only consumes JSON events POSTed to
`http://127.0.0.1:3456/event` — anything that can emit them shows up live, side
by side with Claude Code. Claude Code and Cursor work out of the box; anything
else connects through the same contract below.

## The contract

Send one JSON object per event, `POST`ed to `/event`:

```sh
printf '%s' "$JSON" | curl -sf -X POST \
  -H "Content-Type: application/json" --data-binary @- \
  http://127.0.0.1:3456/event
```

`hook-forward.sh` already does exactly this. To reuse it for another agent, set
`AGENT_MONITOR_SOURCE` and point the agent's lifecycle command at it:

```sh
AGENT_MONITOR_SOURCE=gemini /ABSOLUTE/PATH/TO/hook-forward.sh
```

## Event schema

| field             | required | meaning                                                        |
| ----------------- | -------- | -------------------------------------------------------------- |
| `hook_event_name` | yes      | one of the canonical events below                              |
| `session_id`      | yes      | stable id per agent session (groups all its events)            |
| `source`          | no       | which agent (`claude`, `cursor`, `gemini`, …); shown as a badge |
| `cwd`             | no       | working directory (the rail shows its basename as the name)    |
| `prompt`          | no       | user prompt text (on `UserPromptSubmit`)                       |
| `tool_name`       | no       | tool being called (on `PreToolUse` / `PostToolUse`)            |
| `tool_input`      | no       | tool arguments                                                 |
| `tool_response`   | no       | tool result (`is_error: true` marks a failure)                 |
| `duration_ms`     | no       | tool duration                                                  |
| `model`           | no       | model id                                                       |

Any extra fields are stored and ignored.

## Canonical events

`SessionStart` · `SessionEnd` · `UserPromptSubmit` · `PreToolUse` ·
`PostToolUse` · `PostToolUseFailure` · `Stop` · `SubagentStart` ·
`SubagentStop` · `Notification`

Event names are matched loosely: case and separators are ignored, so
`PreToolUse`, `preToolUse`, `pre_tool_use` and `PRE-TOOL-USE` all resolve to the
same event. A handful of common aliases (`beforeSubmitPrompt`, `toolStart`,
`toolError`, …) are mapped too. If your agent's names differ beyond that, map
them in the adapter before forwarding.

## Minimal example

A shell wrapper that reports one tool call:

```sh
post() { printf '%s' "$1" | curl -sf -X POST -H 'Content-Type: application/json' \
  --data-binary @- http://127.0.0.1:3456/event >/dev/null 2>&1; }

SID=$(date +%s)
post "{\"source\":\"myagent\",\"session_id\":\"$SID\",\"hook_event_name\":\"SessionStart\",\"cwd\":\"$PWD\"}"
post "{\"source\":\"myagent\",\"session_id\":\"$SID\",\"hook_event_name\":\"PreToolUse\",\"tool_name\":\"shell\",\"tool_input\":{\"cmd\":\"ls\"}}"
post "{\"source\":\"myagent\",\"session_id\":\"$SID\",\"hook_event_name\":\"PostToolUse\",\"tool_name\":\"shell\",\"duration_ms\":42}"
```
