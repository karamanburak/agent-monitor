// Unit tests for the event-ingestion reducer — the heart of the monitor.
// applyEvent() is pure (mutates a plain SessionsState, records side-effects as
// `effects[]` instead of firing them), so we can feed synthetic hook-event
// sequences and assert the resulting state deterministically. These guard the
// status machine, subagent reconciliation, dedup and the timeline caps against
// regressions when Claude Code's hook payloads change.
//
//   bun test

import { beforeEach, describe, expect, test } from 'bun:test';
import {
  applyEvent,
  reconcileSubs,
  replaySession,
  settlePending,
  tickHousekeeping,
  type SessionsState,
} from '../src/lib/ingest';
import type { HookEvent, Session } from '../src/lib/types';

const SID = 'sess-1';

function state(booted = true): SessionsState {
  return { sessions: {}, eventTimes: [], booted, lastAppliedAt: 0, effects: [], dismissed: {} };
}

// monotonically increasing timestamps within a test (reset before each)
let t = 0;
beforeEach(() => {
  t = 1_700_000_000_000;
});
function ev(name: string, extra: Partial<HookEvent> = {}): HookEvent {
  t += 1000;
  return { hook_event_name: name, session_id: SID, received_at: t, ...extra } as HookEvent;
}

// build a fully-shaped Session by replaying a SessionStart (avoids duplicating
// the Session interface in the test).
function makeSession(s: SessionsState, id: string): Session {
  applyEvent(s, { hook_event_name: 'SessionStart', session_id: id, received_at: Date.now() } as HookEvent, false);
  return s.sessions[id];
}

describe('session lifecycle', () => {
  test('SessionStart creates a working session with a sys timeline entry', () => {
    const s = state();
    applyEvent(s, ev('SessionStart', { cwd: '/proj/foo' }), true);
    const sess = s.sessions[SID];
    expect(sess).toBeDefined();
    expect(sess.status).toBe('working');
    expect(sess.cwd).toBe('/proj/foo');
    expect(sess.workStart).toBeGreaterThan(0);
    expect(sess.timeline.at(-1)).toMatchObject({ kind: 'sys', text: 'Session started' });
  });

  test('getSession captures model / permission mode / effort from any event', () => {
    const s = state();
    applyEvent(s, ev('SessionStart', { model: 'claude-opus-4-8', permission_mode: 'acceptEdits' }), true);
    const sess = s.sessions[SID];
    expect(sess.model).toBe('claude-opus-4-8');
    expect(sess.permMode).toBe('acceptEdits');
  });

  test('effort may arrive as an object {level} or a bare string', () => {
    const s = state();
    applyEvent(s, ev('SessionStart', { effort: { level: 'high' } }), true);
    expect(s.sessions[SID].effort).toBe('high');
    applyEvent(s, ev('UserPromptSubmit', { prompt: 'x', effort: 'max' }), true);
    expect(s.sessions[SID].effort).toBe('max');
  });

  test('Stop marks the session idle and records a result entry with tokens', () => {
    const s = state();
    applyEvent(s, ev('UserPromptSubmit', { prompt: 'do it' }), true);
    const stop = ev('Stop', {
      last_assistant_message: 'All done.',
      input_tokens: 10,
      output_tokens: 20,
      cache_read_tokens: 5,
      cache_write_tokens: 3,
    });
    applyEvent(s, stop, true);
    const sess = s.sessions[SID];
    expect(sess.status).toBe('idle');
    expect(sess.doneAt).toBe(stop.received_at);
    expect(sess.lastResult).toBe('All done.');
    const tl = sess.timeline.at(-1) as { kind: string; hasResult: boolean; tok: unknown };
    expect(tl.kind).toBe('result');
    expect(tl.hasResult).toBe(true);
    expect(tl.tok).toEqual({ in: 10, out: 20, cache: 8 });
    expect(s.effects.some((e) => e.kind === 'done')).toBe(true);
  });

  test('SessionEnd ends the session and stops all subagents', () => {
    const s = state();
    applyEvent(s, ev('SubagentStart', { agent_id: 'a1' }), true);
    applyEvent(s, ev('SessionEnd', { reason: 'terminal closed' }), true);
    const sess = s.sessions[SID];
    expect(sess.status).toBe('ended');
    expect(sess.subagents.every((x) => !x.running)).toBe(true);
    expect((sess.timeline.at(-1) as { text: string }).text).toContain('terminal closed');
  });
});

describe('prompts', () => {
  test('UserPromptSubmit records the prompt, sets working, adds a prompt entry', () => {
    const s = state();
    applyEvent(s, ev('UserPromptSubmit', { prompt: 'Fix the bug', prompt_id: 'p1' }), true);
    const sess = s.sessions[SID];
    expect(sess.status).toBe('working');
    expect(sess.prompt).toBe('Fix the bug');
    expect(sess.promptId).toBe('p1');
    expect(sess.timeline.at(-1)).toMatchObject({ kind: 'prompt', text: 'Fix the bug', promptId: 'p1' });
  });

  test('very long prompts are clipped to 2000 chars', () => {
    const s = state();
    applyEvent(s, ev('UserPromptSubmit', { prompt: 'x'.repeat(5000) }), true);
    expect(s.sessions[SID].prompt.length).toBe(2000);
  });
});

describe('tool calls', () => {
  test('PreToolUse opens a pending tool on the main agent', () => {
    const s = state();
    applyEvent(s, ev('PreToolUse', { tool_name: 'Bash', tool_use_id: 'tu1', tool_input: { command: 'ls -la' } }), true);
    const sess = s.sessions[SID];
    expect(sess.toolCount).toBe(1);
    expect(sess.currentTool?.name).toBe('Bash');
    expect(sess.currentTool?.detail).toContain('ls -la');
    expect(sess.pending.tu1).toBeDefined();
    const tl = sess.timeline.at(-1) as { kind: string; dur: number | null; ok: boolean | null };
    expect(tl.kind).toBe('tool');
    expect(tl.dur).toBeNull();
    expect(tl.ok).toBeNull();
  });

  test('PostToolUse settles the pending tool with the reported duration and ok=true', () => {
    const s = state();
    applyEvent(s, ev('PreToolUse', { tool_name: 'Read', tool_use_id: 'tu1', tool_input: { file_path: '/a' } }), true);
    applyEvent(
      s,
      ev('PostToolUse', { tool_name: 'Read', tool_use_id: 'tu1', tool_response: { stdout: 'ok' }, duration_ms: 1234 }),
      true,
    );
    const sess = s.sessions[SID];
    expect(sess.pending.tu1).toBeUndefined();
    expect(sess.currentTool).toBeNull();
    const tl = sess.timeline.find((x) => x.kind === 'tool' && x.id === 'tu1') as { dur: number; ok: boolean };
    expect(tl.dur).toBe(1234);
    expect(tl.ok).toBe(true);
  });

  test('without duration_ms the duration is derived from timestamps', () => {
    const s = state();
    applyEvent(
      s,
      {
        hook_event_name: 'PreToolUse',
        session_id: SID,
        received_at: 1000,
        tool_name: 'Read',
        tool_use_id: 'tu1',
      } as HookEvent,
      true,
    );
    applyEvent(
      s,
      {
        hook_event_name: 'PostToolUse',
        session_id: SID,
        received_at: 1500,
        tool_name: 'Read',
        tool_use_id: 'tu1',
      } as HookEvent,
      true,
    );
    const tl = s.sessions[SID].timeline.find((x) => x.kind === 'tool' && x.id === 'tu1') as { dur: number };
    expect(tl.dur).toBe(500);
  });

  test('PostToolUse with is_error marks a failure and bumps failCount', () => {
    const s = state();
    applyEvent(s, ev('PreToolUse', { tool_name: 'Bash', tool_use_id: 'tu1', tool_input: { command: 'x' } }), true);
    applyEvent(
      s,
      ev('PostToolUse', { tool_name: 'Bash', tool_use_id: 'tu1', tool_response: { is_error: true } }),
      true,
    );
    const sess = s.sessions[SID];
    expect(sess.failCount).toBe(1);
    expect((sess.timeline.find((x) => x.kind === 'tool' && x.id === 'tu1') as { ok: boolean }).ok).toBe(false);
  });

  test('the PostToolUseFailure hook name counts as a failure', () => {
    const s = state();
    applyEvent(s, ev('PreToolUse', { tool_name: 'Edit', tool_use_id: 'tu1' }), true);
    applyEvent(s, ev('PostToolUseFailure', { tool_name: 'Edit', tool_use_id: 'tu1' }), true);
    expect(s.sessions[SID].failCount).toBe(1);
  });

  test('PostToolUse falls back to matching the newest same-name pending tool when no id', () => {
    const s = state();
    applyEvent(s, ev('PreToolUse', { tool_name: 'Grep', tool_use_id: 'tu1' }), true);
    applyEvent(s, ev('PostToolUse', { tool_name: 'Grep', tool_response: { stdout: 'hit' } }), true); // no tool_use_id
    expect(s.sessions[SID].pending.tu1).toBeUndefined();
  });
});

describe('subagents', () => {
  test('a subagent PreToolUse attributes the tool to the subagent, not the main agent', () => {
    const s = state();
    applyEvent(s, ev('SubagentStart', { agent_id: 'a1', agent_type: 'Explore' }), true);
    applyEvent(
      s,
      ev('PreToolUse', { agent_id: 'a1', tool_name: 'Grep', tool_use_id: 'tu1', tool_input: { pattern: 'foo' } }),
      true,
    );
    const sess = s.sessions[SID];
    expect(sess.currentTool).toBeNull();
    const sa = sess.subagents.find((x) => x.id === 'a1');
    expect(sa?.tool?.name).toBe('Grep');
    expect(sa?.running).toBe(true);
    expect(sess.pending.tu1.agent).toBe('a1');
  });

  test('SubagentStop stops the subagent, stores its result, and settles its pending tools', () => {
    const s = state();
    applyEvent(s, ev('SubagentStart', { agent_id: 'a1', agent_type: 'Explore' }), true);
    applyEvent(s, ev('PreToolUse', { agent_id: 'a1', tool_name: 'Grep', tool_use_id: 'tu1' }), true);
    applyEvent(s, ev('SubagentStop', { agent_id: 'a1', last_assistant_message: 'done exploring' }), true);
    const sess = s.sessions[SID];
    const sa = sess.subagents.find((x) => x.id === 'a1');
    expect(sa?.running).toBe(false);
    expect(sa?.result).toBe('done exploring');
    expect(sess.pending.tu1).toBeUndefined();
  });

  test('reconcileSubs adds running roster members and retires ones no longer listed', () => {
    const s = state();
    const sess = makeSession(s, SID);
    reconcileSubs(sess, {
      received_at: t + 1,
      background_tasks: [
        { id: 'a1', type: 'subagent', status: 'running', agent_type: 'Explore', description: 'search' },
        { id: 'a2', type: 'subagent', status: 'running', agent_type: 'Plan' },
      ],
    } as HookEvent);
    expect(sess.subagents.map((x) => x.id).sort()).toEqual(['a1', 'a2']);
    expect(sess.subagents.every((x) => x.running)).toBe(true);

    reconcileSubs(sess, {
      received_at: t + 2,
      background_tasks: [{ id: 'a1', type: 'subagent', status: 'running' }],
    } as HookEvent);
    expect(sess.subagents.find((x) => x.id === 'a2')?.running).toBe(false);
    expect(sess.subagents.find((x) => x.id === 'a1')?.running).toBe(true);
  });
});

describe('waiting / notifications', () => {
  test('a permission Notification sets waiting and queues a needsAttention effect when booted', () => {
    const s = state(true);
    applyEvent(s, ev('Notification', { message: 'Claude needs your permission to run Bash' }), true);
    const sess = s.sessions[SID];
    expect(sess.status).toBe('waiting');
    expect(sess.waitMsg).toContain('permission');
    expect(s.effects.some((e) => e.kind === 'needsAttention')).toBe(true);
  });

  test('a historical (un-booted) permission Notification changes state but fires no alert', () => {
    const s = state(false);
    applyEvent(s, ev('Notification', { message: 'waiting for your input' }), true);
    expect(s.sessions[SID].status).toBe('waiting');
    expect(s.effects.some((e) => e.kind === 'needsAttention')).toBe(false);
  });

  test('a non-permission Notification does not change status', () => {
    const s = state();
    applyEvent(s, ev('SessionStart'), true);
    applyEvent(s, ev('Notification', { message: 'Background task started' }), true);
    expect(s.sessions[SID].status).toBe('working');
  });

  test('every live non-Notification event queues a dismiss effect; Notification does not', () => {
    const s = state();
    applyEvent(s, ev('SessionStart'), true);
    const afterStart = s.effects.filter((e) => e.kind === 'dismiss').length;
    expect(afterStart).toBe(1);
    applyEvent(s, ev('Notification', { message: 'hi' }), true);
    expect(s.effects.filter((e) => e.kind === 'dismiss').length).toBe(afterStart);
  });
});

describe('alternate client vocabularies', () => {
  test('camelCase hook names (preToolUse) are normalized', () => {
    const s = state();
    applyEvent(s, ev('preToolUse', { tool_name: 'Bash', tool_use_id: 'tu1', tool_input: { command: 'ls' } }), true);
    expect(s.sessions[SID].toolCount).toBe(1);
    expect(s.sessions[SID].pending.tu1).toBeDefined();
  });

  test('workspace_roots fills cwd when cwd is absent', () => {
    const s = state();
    applyEvent(s, ev('SessionStart', { workspace_roots: ['/ws/root'] }), true);
    expect(s.sessions[SID].cwd).toBe('/ws/root');
  });

  test('tool_output is treated as tool_response (Cursor-style payload)', () => {
    const s = state();
    applyEvent(s, ev('PreToolUse', { tool_name: 'Bash', tool_use_id: 'tu1' }), true);
    applyEvent(s, ev('PostToolUse', { tool_name: 'Bash', tool_use_id: 'tu1', tool_output: { is_error: true } }), true);
    expect(s.sessions[SID].failCount).toBe(1);
  });
});

describe('history replay & dedup', () => {
  test('__history__ replay is idempotent — re-applying the same frame does not double count', () => {
    const s = state(false);
    const hist = {
      hook_event_name: '__history__',
      received_at: 0,
      events: [
        ev('SessionStart'),
        ev('PreToolUse', { tool_name: 'Read', tool_use_id: 'tu1' }),
        ev('PostToolUse', { tool_name: 'Read', tool_use_id: 'tu1', duration_ms: 100 }),
      ],
    } as HookEvent;
    applyEvent(s, hist, true);
    expect(s.sessions[SID].toolCount).toBe(1);
    s.booted = true; // the slice flips this after the first frame
    applyEvent(s, hist, true); // reconnect delivers the same frame again
    expect(s.sessions[SID].toolCount).toBe(1);
  });

  test('replaySession builds an isolated session map from an event list', () => {
    const evs = [ev('SessionStart'), ev('Notification', { message: 'needs your permission' })];
    const map = replaySession(evs);
    expect(map[SID]).toBeDefined();
    expect(map[SID].status).toBe('waiting');
  });
});

describe('pending scoping & timeline bounds', () => {
  test('settlePending resolves only tools in the requested scope', () => {
    const s = state();
    applyEvent(s, ev('SubagentStart', { agent_id: 'a1' }), true);
    applyEvent(s, ev('PreToolUse', { tool_name: 'X', tool_use_id: 'main1' }), true);
    applyEvent(s, ev('PreToolUse', { agent_id: 'a1', tool_name: 'Y', tool_use_id: 'sub1' }), true);
    const sess = s.sessions[SID];
    settlePending(sess, t + 999, undefined); // main-agent scope only
    expect(sess.pending.main1).toBeUndefined();
    expect(sess.pending.sub1).toBeDefined();
    settlePending(sess, t + 1000, '*'); // everything
    expect(sess.pending.sub1).toBeUndefined();
  });

  test('the timeline is capped at 120 entries and dropped pending tools are cleaned up', () => {
    const s = state();
    for (let i = 0; i < 130; i++) {
      applyEvent(s, ev('PreToolUse', { tool_name: 'T', tool_use_id: 'id' + i }), true);
    }
    const sess = s.sessions[SID];
    expect(sess.timeline.length).toBeLessThanOrEqual(120);
    expect(sess.pending.id0).toBeUndefined(); // oldest dropped from timeline → removed from pending
    expect(sess.pending.id129).toBeDefined(); // newest still pending
  });
});

describe('dismissal (hidden sessions survive refresh)', () => {
  test('events at or before the dismiss time are ignored — the session stays hidden', () => {
    const s = state();
    s.dismissed[SID] = 5000;
    applyEvent(
      s,
      {
        hook_event_name: 'PreToolUse',
        session_id: SID,
        received_at: 4000,
        tool_name: 'Read',
        tool_use_id: 'tu1',
      } as HookEvent,
      true,
    );
    expect(s.sessions[SID]).toBeUndefined();
    expect(s.dismissed[SID]).toBe(5000);
  });

  test('genuinely newer activity un-dismisses and recreates the session', () => {
    const s = state();
    s.dismissed[SID] = 5000;
    applyEvent(
      s,
      { hook_event_name: 'UserPromptSubmit', session_id: SID, received_at: 6000, prompt: 'back' } as HookEvent,
      true,
    );
    expect(s.sessions[SID]).toBeDefined();
    expect(s.dismissed[SID]).toBeUndefined();
  });

  test('a later SessionEnd (e.g. from the reaper) does NOT resurrect a dismissed session', () => {
    const s = state();
    s.dismissed[SID] = 5000;
    applyEvent(
      s,
      { hook_event_name: 'SessionEnd', session_id: SID, received_at: 6000, synthetic: true } as HookEvent,
      true,
    );
    expect(s.sessions[SID]).toBeUndefined();
    expect(s.dismissed[SID]).toBe(5000);
  });
});

describe('tickHousekeeping', () => {
  test('prunes day-old sessions, reaps stalled subagents, and trims the 60s event window', () => {
    const now = Date.now();
    const s = state();
    const old = makeSession(s, 'old');
    old.lastSeen = now - 25 * 3600 * 1000; // >24h idle
    const live = makeSession(s, 'live');
    live.lastSeen = now;
    live.subagents.push({ id: 'a1', type: 'x', running: true, started: now - 300_000, lastSeen: now - 300_000 });
    s.eventTimes = [now - 90_000, now - 1_000];

    tickHousekeeping(s);

    expect(s.sessions.old).toBeUndefined();
    expect(s.sessions.live.subagents[0].running).toBe(false);
    expect(s.eventTimes).toEqual([now - 1_000]);
  });
});

