# agent-monitor

A fully local, live dashboard for watching Claude Code sessions and their
subagents. Any other agent can feed it too — see [ADAPTERS.md](ADAPTERS.md).

The server binds to `127.0.0.1` only and the event log stays in this folder —
nothing ever leaves your machine.

## Setup

Requires [Bun](https://bun.sh). Cross-platform (macOS / Linux / Windows).

**1. Install & start the dashboard**

```sh
bun install       # first run only
bun run dev       # Vite UI (5173) + API/SSE server (3456) together, hot-reload
```

Then open **http://127.0.0.1:5173**. `bun run dev` proxies all API / SSE calls to
the backend on **3456**; both ports are bound to localhost only — nothing leaves
this Mac.

Stop it with `Ctrl-C` (or `lsof -ti :3456 :5173 | xargs kill`).

**2. Wire up the Claude Code hook** (required — without this the dashboard stays empty)

The dashboard is fed by a Claude Code hook that forwards every session event to
the local server. Make the forwarder executable, then register it for all
events in your **user-level** `~/.claude/settings.json` (applies to every
project):

```sh
chmod +x /ABSOLUTE/PATH/TO/agent-monitor/hook-forward.sh
```

```jsonc
// ~/.claude/settings.json  — merge this into the existing "hooks" object
{
  "hooks": {
    "SessionStart":     [{ "hooks": [{ "type": "command", "command": "/ABSOLUTE/PATH/TO/agent-monitor/hook-forward.sh" }] }],
    "SessionEnd":       [{ "hooks": [{ "type": "command", "command": "/ABSOLUTE/PATH/TO/agent-monitor/hook-forward.sh" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "/ABSOLUTE/PATH/TO/agent-monitor/hook-forward.sh" }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "/ABSOLUTE/PATH/TO/agent-monitor/hook-forward.sh" }] }],
    "SubagentStop":     [{ "hooks": [{ "type": "command", "command": "/ABSOLUTE/PATH/TO/agent-monitor/hook-forward.sh" }] }],
    "PreToolUse":       [{ "hooks": [{ "type": "command", "command": "/ABSOLUTE/PATH/TO/agent-monitor/hook-forward.sh" }] }],
    "PostToolUse":      [{ "hooks": [{ "type": "command", "command": "/ABSOLUTE/PATH/TO/agent-monitor/hook-forward.sh" }] }],
    "Notification":     [{ "hooks": [{ "type": "command", "command": "/ABSOLUTE/PATH/TO/agent-monitor/hook-forward.sh" }] }]
  }
}
```

Replace `/ABSOLUTE/PATH/TO/agent-monitor` with this folder's real path
(`pwd` prints it). The forwarder fails silently when the server is down, so it
never blocks or slows Claude Code. Start a new Claude Code session and events
will appear live.

## Architecture

```
Claude Code (any repo/directory)
  └─ hooks (~/.claude/settings.json — user-level, applies to ALL projects)
       └─ hook-forward.sh  → POST http://127.0.0.1:3456/event
            └─ server/server.ts   → events.db (SQLite) + SSE live broadcast (API only)
                 └─ Vite dev server (5173) serves the React app + proxies the API
                      └─ React app (Redux store ingests the SSE stream)
```

- **Backend** (`server/server.ts`): the same logic as the old `server.js`,
  ported to TypeScript. Collects hook events, broadcasts them over SSE, persists
  them to a local **SQLite** file (`events.db`, via built-in `bun:sqlite` — no
  server process, just a file in this folder), reads local token-usage from
  `~/.claude/projects/**/*.jsonl`, and replays past sessions with indexed
  queries. API only — the UI is served by Vite.
- **Frontend** (`src/`): React 19 with hooks. Redux Toolkit holds all state —
  `sessionsSlice` runs the event-ingestion reducer (Immer), `uiSlice` holds
  selection / view / filter, `usageSlice` holds token data. Tailwind is wired up
  for utility work; the detailed component look is preserved verbatim in
  `src/legacy.css` so the UI is visually identical to the original dashboard.
  Toasts use `goey-toast`.

### Source map

```
index.html              app entry (pre-paint theme script)
src/
  main.tsx              React root + providers + CSS imports
  App.tsx               layout, hook wiring, overlays, inspector
  store/                Redux Toolkit: sessions / ui / usage slices + typed hooks
  lib/                  types, ingest (applyEvent port), format utils, legends, turns, markdown, api
  hooks/                useEventStream, useTick, useUsage, useAlerts, useTheme, useNow, useFocusSession
  components/           TopBar, Rail, TokenFooter, Detail, AgentLane,
                        Timeline, Trace, Inspector, Overlay, StatsOverlay, HistoryOverlay, Toast
  legacy.css            original dashboard stylesheet, verbatim
  additions.css         #root layout grid (+ small extras)
server/
  server.ts             entry: http server
  config.ts · types.ts  constants + shared types
  routes.ts             method+path → controller
  helpers/              truncate, pricing, http utils
  models/               db (SQLite), eventStore, usageStore, historyStore (state + logic)
  validations/          request body limits + parsers
  controllers/          events, usage, history, focus handlers
```

## Features

Mission-control layout: a session list on the left, one always-live detail pane
on the right.

- **Session rail** — status dot (working / needs-you / idle), project name,
  one-line "what it's doing now", last-event age; filter box; ↑/↓ keyboard nav;
  finished sessions collapse into a `Finished` group.
- **Detail pane** — needs-you banner, live "now" strip, subagent lane (roomy
  cards with deterministic codenames + quotes; finished ones become chips),
  timeline (collapsible per-prompt turns with per-turn cost) and a **Trace**
  waterfall view (zoom / pan / minimap), a tool-call inspector drawer with real
  diffs, and Markdown export.
- **⏳ Needs you, system-wide** — tab title + favicon flip; enable **Alerts** for
  OS notifications and **Sound** for a chime when a session needs you or finishes
  a long task.
- **📊 Stats** — live analytics overlay: session/tool counts, failure rate,
  per-tool table, plus a token-usage card (Overview / Models, All / 30d / 7d).
- **🕓 History** — browse & replay past sessions from the on-disk log.
- **My token usage** (rail footer) — Today / 7d / 30d / Year from this machine's
  own local transcripts, priced at API list rates (an estimate, not your plan
  bill). Edit rates in `server/helpers/pricing.ts`.
## Monitored events

SessionStart · SessionEnd · UserPromptSubmit · Stop · PreToolUse · PostToolUse ·
SubagentStop · Notification

## Notes

- Event history lives in `events.db` (a local SQLite file — plain-text prompts
  inside, do not share it). All history is kept (no rotation); any single string
  field is truncated at `MAX_FIELD_CHARS` (20000) before storing.
- Change the port with `PORT=4000 bun run server/server.ts` (update
  `hook-forward.sh` and the proxy targets in `vite.config.ts` too).

## Uninstall

1. Delete the `"hooks"` block from `~/.claude/settings.json`.
2. `lsof -ti :3456 | xargs kill` and delete this folder.
