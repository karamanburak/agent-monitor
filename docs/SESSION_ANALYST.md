# Session Analyst — design & roadmap

Agent Monitor shows *what* an AI coding agent is doing. The Session Analyst says
*where it struggled and what to change*, without giving up the project's promise
that nothing leaves the machine unless you allow it.

## Principles

1. **Rules first, LLM second.** Deterministic detectors find the friction. They
   are pure functions — cheap, explainable, unit-tested — and they always work,
   with or without a model.
2. **The LLM interprets, it never discovers.** It receives findings and a small
   digest, not raw events. Every root cause and recommendation must cite finding
   ids; `validate.ts` drops anything uncited or citing an unknown id and reports
   how many claims were removed.
3. **Privacy is a default, not an option.** Evidence is clipped and passed
   through `redact()` before it is stored in a finding. Cloud providers require
   a one-time opt-in; the UI always shows 🔒 local or ☁️ cloud.
4. **Precision over recall.** A noisy detector is worse than none. Each
   detector was tuned against real sessions (see *Calibration*).

## Architecture

```
events (SQLite) ──► detectors/*  ──► analyze.ts ──► Analysis { health, findings[], digest }
                     pure rules        ranks, ids          │
                                                           ▼  (on demand)
                     prompt.ts ──► provider.complete() ──► validate.ts ──► cited report
                     findings + digest   Claude Code │       drop uncited claims
                     + JSON schema       Claude API  │
                                         Ollama      ┘
```

| File | Role |
|---|---|
| `server/analysis/detectors/*.ts` | one detector per file, `(events) => findings` |
| `server/analysis/analyze.ts` | runs detectors, sorts by severity, assigns ids, health score, digest |
| `server/analysis/redact.ts` | secret masking used for every piece of evidence |
| `server/analysis/prompt.ts` | system prompt, JSON schema of the report, user prompt builder |
| `server/analysis/validate.ts` | parses any reply, enforces citations, clips and redacts text |
| `server/analysis/providers/` | `LLMProvider` interface, three providers, settings, auto-pick |
| `server/analysis/explain.ts` | provider choice, consent gate, cache, error reasons |
| `server/controllers/analysisController.ts` | HTTP endpoints |
| `src/components/Analysis.tsx` | collapsible panel in the detail pane |

## Detectors

| Id | Finds | Guard against false positives |
|---|---|---|
| `loop` | the exact same call (tool + input) 3+ times in a row | any edit or new prompt breaks the chain — re-running tests after edits is normal |
| `edit-revert` | an Edit that exactly undoes an earlier Edit of the same file | exact old/new string match only |
| `retry-storm` | 3+ failures of the same kind of call (Bash grouped by command prefix) | calls that hit a permission prompt are a choice, not a failure; unanswered calls count only once the session moved on |
| `read-thrash` | the same file read 3+ extra times with no change in between | partial reads (offset/limit) skipped; a Bash command naming the file or its folder counts as a possible change |
| `permission` | the same allow-rule would have skipped 2+ prompts | risky commands (rm, sudo, git push, curl, …) never get a suggested rule; shell loops get no rule; reads outside the project point at `additionalDirectories`; AskUserQuestion / plan-mode prompts are excluded |
| `waiting` | 3+ minutes blocked on permission prompts | idle prompts (agent finished its turn) and gaps over 2 h (you were away) are ignored |
| `correction` | your follow-up prompts that correct the agent, in English, German and Turkish | never the first prompt of a session |

**Health** = 100 − 20 per high − 10 per warn − 3 per info finding (floor 0).

### Calibration (Oct 2026, 387 real sessions, ~50k events)

| Change | Effect |
|---|---|
| `waiting` counted idle prompts | a session left open overnight showed "waited 16 h" → idle prompts removed, 2 h cap |
| unanswered calls counted as failures | denied permissions showed up as retry storms → calls that hit a permission prompt are excluded |
| redaction missed `mysql -p<password>` | added a pattern + a regression test |
| `read-thrash` ignored files rewritten by Bash | 39 → 20 findings after treating "command names the file or folder" as a change |
| `AskUserQuestion` counted as permission friction | interactive tools excluded |

## Providers

Auto order: Claude Code → Claude API → Ollama → detectors only. An explicit
choice is never silently swapped for another provider.

| Provider | How | Structured output |
|---|---|---|
| Claude Code | `claude -p --output-format json --json-schema … --tools "" --no-session-persistence`, cwd = temp dir, `AGENT_MONITOR_SKIP=1` | `structured_output`, falls back to `result` text |
| Claude API | `@anthropic-ai/sdk`, `messages.create` with `output_config.format = json_schema`, effort `low` | guaranteed JSON text block |
| Ollama | `POST /api/chat` with `format: <schema>`, temperature 0 | constrained decoding |

Use your own accounts only — never an employer's API key or login for this
personal project.

## Status

- [x] Phase 0 — `PostToolUseFailure` hook documented, `AGENT_MONITOR_SKIP` in the forwarder
- [x] Phase 1 — seven detectors + unit tests (`tests/analysis.test.ts`)
- [x] Phase 2 — panel in the detail pane: health, findings, evidence, copyable suggestions
- [x] Phase 3 — provider layer, consent gate, JSON schema, citation validator, cache
- [ ] Phase 4 — eval harness and model comparison
- [ ] Phase 5 — repo playbook, README demo, write-up

Not yet verified end to end: a real LLM call through each provider (it was
built on a machine where that would have used an employer account). First thing
to do on the personal machine:

```sh
ollama pull qwen3:4b      # or any small model your machine runs
bun run dev               # open a session → Session analysis → Explain
```

## Phase 4 — eval harness (next)

Goal: numbers for the README, not vibes.

1. **Fixtures** — 20–30 sessions exported from `events.db`, anonymised
   (paths → `/repo/...`, prompts redacted), stored as JSON in `tests/fixtures/`.
2. **Detector labels** — for each fixture, the findings a human expects.
   Report precision / recall per detector.
3. **LLM grading** per provider and model on the same fixtures:
   - JSON valid (before repair) — %
   - citations valid — % of claims kept by `validate.ts`
   - usefulness — rubric 1–5 (specific? actionable? correct?) graded by hand
     or by a stronger model, with a sample checked by hand
   - latency p50 / p95, RAM (local), cost per session (cloud)
4. **Script** — `bun run eval` writes `docs/eval-results.md` with one table:
   `qwen3:4b · qwen3:8b · gemma3:4b · claude-haiku-5-5 · claude-opus-5-5`.

The headline the project is aiming for: *"a 4B local model keeps N % of the
cited, useful recommendations of a frontier model, at zero cost and with no data
leaving the laptop."* Whatever the real number is, report it honestly.

## Phase 5 — repo playbook

Aggregate findings per project folder across sessions: recurring corrections,
recurring permission prompts, recurring retry storms. Output one suggested
CLAUDE.md block and one `permissions.allow` list per repo, each line linked to
the sessions that justify it. This closes the loop from *observing* agents to
*improving* them.

## Ideas parked

- cost hotspots per subagent / cache-hit ratio (needs per-message usage joined to events)
- jump from an evidence row to the timeline entry
- weekly digest notification
