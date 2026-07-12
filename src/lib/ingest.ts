// Runs inside an Immer/Redux reducer, so it mutates plain objects and records
// side effects (chime/notify/dismiss) as `effects` for the UI to carry out.

import { normalizeEventName } from './constants';
import { clipVal, extractEdits, isToolFailure, toolDetail, fmtDur } from './format';
import { legendFor } from './legends';
import type { HookEvent, Session, TimelineEntry, ToolEntry, ToolInfo } from './types';

export type Effect =
  | { kind: 'needsAttention'; sessionId: string; waitMsg: string; cwd: string }
  | { kind: 'done'; sessionId: string; workMs: number; cwd: string }
  | { kind: 'dismiss'; sessionId: string };

export interface SessionsState {
  sessions: Record<string, Session>;
  eventTimes: number[];
  booted: boolean;
  lastAppliedAt: number;
  effects: Effect[];
  // dismissed session id → dismissal time; persisted so they stay hidden across refreshes/reconnects.
  dismissed: Record<string, number>;
}

function newSession(id: string, e: HookEvent): Session {
  return {
    id,
    cwd: e.cwd || '',
    source: typeof e.source === 'string' ? e.source : '',
    firstSeen: e.received_at,
    lastSeen: e.received_at,
    status: 'idle',
    prompt: '',
    currentTool: null,
    toolStart: 0,
    toolCount: 0,
    failCount: 0,
    workStart: 0,
    doneAt: 0,
    model: '',
    permMode: '',
    effort: '',
    lastResult: '',
    lastResultAt: 0,
    subagents: [],
    timeline: [],
    pending: {},
    turnOpen: {},
  };
}

function getSession(state: SessionsState, e: HookEvent): Session {
  const id = e.session_id || 'unknown';
  let s = state.sessions[id];
  if (!s) {
    s = newSession(id, e);
    state.sessions[id] = s;
  }
  if (e.cwd) s.cwd = e.cwd;
  if (typeof e.source === 'string' && e.source) s.source = e.source;
  if (e.model) s.model = e.model;
  if (e.permission_mode) s.permMode = e.permission_mode;
  if (e.effort) s.effort = typeof e.effort === 'object' && e.effort ? e.effort.level || '' : (e.effort as string);
  s.lastSeen = Math.max(s.lastSeen, e.received_at);
  return s;
}

// scope: undefined = main-agent entries only, "*" = all, otherwise an agent id
export function settlePending(s: Session, t: number, scope?: string): void {
  for (const k of Object.keys(s.pending)) {
    const en = s.pending[k];
    const match = scope === '*' || (scope === undefined ? !en.agent : en.agent === scope);
    if (!match) continue;
    en.dur = Math.max(0, t - en.t);
    en.ok = true;
    delete s.pending[k];
  }
}

function pushTl(s: Session, entry: TimelineEntry): void {
  s.timeline.push(entry);
  if (s.timeline.length > 120) {
    const dropped = s.timeline.shift();
    if (dropped && dropped.kind === 'tool' && dropped.dur === null) delete s.pending[dropped.id];
  }
}

// background_tasks[] is the authoritative roster of still-running subagents.
export function reconcileSubs(s: Session, e: HookEvent): void {
  if (!Array.isArray(e.background_tasks)) return;
  const runningIds = new Set<string>();
  for (const t of e.background_tasks) {
    if (t?.type !== 'subagent' || String(t.status).toLowerCase() !== 'running') continue;
    runningIds.add(t.id);
    let sa = s.subagents.find((x) => x.id === t.id);
    if (!sa) {
      sa = {
        id: t.id,
        type: t.agent_type || 'subagent',
        running: true,
        started: e.received_at,
        lastSeen: e.received_at,
        desc: t.description || '',
      };
      s.subagents.push(sa);
    } else {
      sa.running = true;
      sa.lastSeen = e.received_at;
      if (t.description && !sa.desc) sa.desc = t.description;
    }
  }
  for (const sa of s.subagents) {
    if (sa.running && !runningIds.has(sa.id)) {
      sa.running = false;
      sa.stopped = sa.stopped || e.received_at;
      settlePending(s, e.received_at, sa.id);
    }
  }
}

// live=false (History replay) skips effects like chime/notify.
export function applyEvent(state: SessionsState, e: HookEvent, live = true): void {
  if (!e || typeof e !== 'object') return;

  if (e.hook_event_name === '__history__') {
    const evs = e.events || [];
    if (!state.booted) {
      state.sessions = {};
      state.eventTimes = [];
      for (const ev of evs) {
        applyEvent(state, ev, live);
        if (ev.received_at > state.lastAppliedAt) state.lastAppliedAt = ev.received_at;
      }
    } else {
      for (const ev of evs)
        if (ev.received_at > state.lastAppliedAt) {
          applyEvent(state, ev, live);
          state.lastAppliedAt = ev.received_at;
        }
    }
    return;
  }

  const canon = normalizeEventName(e.hook_event_name);
  if (canon && canon !== e.hook_event_name) e = { ...e, hook_event_name: canon };
  if (!e.cwd && Array.isArray(e.workspace_roots) && e.workspace_roots[0]) e = { ...e, cwd: e.workspace_roots[0] };
  if (e.tool_response == null && e.tool_output != null) e = { ...e, tool_response: e.tool_output };
  if (e.duration_ms == null && e.duration != null) e = { ...e, duration_ms: e.duration };

  // skip old/replayed events for a dismissed session; genuinely newer activity un-dismisses it.
  const sid = e.session_id || 'unknown';
  if (state.dismissed && state.dismissed[sid] != null) {
    if (e.received_at > state.dismissed[sid] && e.hook_event_name !== 'SessionEnd') delete state.dismissed[sid];
    else return;
  }

  if (live) state.eventTimes.push(e.received_at);
  const s = getSession(state, e);
  if (live && e.hook_event_name !== 'Notification') state.effects.push({ kind: 'dismiss', sessionId: s.id });

  const aid = (e.agent_id || e.subagent_id) as string | undefined;

  switch (e.hook_event_name) {
    case 'SessionStart':
      s.status = 'working';
      s.waitMsg = null;
      s.workStart = e.received_at;
      pushTl(s, { kind: 'sys', t: e.received_at, text: 'Session started' });
      break;

    case 'UserPromptSubmit':
      s.status = 'working';
      s.waitMsg = null;
      s.workStart = e.received_at;
      s.prompt = (e.prompt || '').slice(0, 2000);
      s.promptId = e.prompt_id || null;
      settlePending(s, e.received_at);
      pushTl(s, { kind: 'prompt', t: e.received_at, text: s.prompt, promptId: s.promptId });
      break;

    case 'PreToolUse': {
      s.status = 'working';
      s.waitMsg = null;
      s.toolCount++;
      const tool: ToolInfo = { name: e.tool_name || '?', detail: toolDetail(e.tool_input) };
      const entry: ToolEntry = {
        kind: 'tool',
        id: e.tool_use_id || tool.name + ':' + e.received_at,
        t: e.received_at,
        name: tool.name,
        detail: tool.detail,
        agent: aid || null,
        dur: null,
        ok: null,
        promptId: e.prompt_id || s.promptId || null,
        inStr: clipVal(e.tool_input),
        outStr: '',
        edits: extractEdits(e.tool_name, e.tool_input),
      };
      s.pending[entry.id] = entry;
      pushTl(s, entry);
      if (aid) {
        let sa = s.subagents.find((x) => x.id === aid);
        if (!sa) {
          sa = { id: aid, type: e.agent_type || 'subagent', running: true, started: e.received_at };
          s.subagents.push(sa);
        }
        sa.tool = tool;
        sa.lastSeen = e.received_at;
      } else {
        s.currentTool = tool;
        s.toolStart = e.received_at;
      }
      break;
    }

    case 'PostToolUse':
    case 'PostToolUseFailure': {
      if (s.status === 'waiting') {
        s.status = 'working';
        s.waitMsg = null;
      }
      const failed = isToolFailure(e);
      let entry: ToolEntry | undefined = e.tool_use_id ? s.pending[e.tool_use_id] : undefined;
      if (!entry)
        entry = Object.values(s.pending)
          .reverse()
          .find((t) => t.name === e.tool_name && !!t.agent === !!aid);
      if (entry) {
        entry.dur =
          typeof e.duration_ms === 'number' && e.duration_ms >= 0
            ? e.duration_ms
            : Math.max(0, e.received_at - entry.t);
        entry.ok = !failed;
        entry.outStr = clipVal(e.tool_response);
        delete s.pending[entry.id];
      }
      if (failed) s.failCount++;
      if (aid) {
        const sa = s.subagents.find((x) => x.id === aid);
        if (sa) {
          sa.tool = null;
          sa.lastSeen = e.received_at;
        }
      } else s.currentTool = null;
      break;
    }

    case 'Notification': {
      const msg = e.message || e.notification || '';
      if (/permission|waiting for your (input|response)|approve/i.test(msg)) {
        s.status = 'waiting';
        s.waitMsg = msg.slice(0, 240);
        pushTl(s, { kind: 'note', t: e.received_at, text: msg.slice(0, 160) });
        // gated on booted so historical waiting states during __history__ replay don't chime.
        if (live && state.booted)
          state.effects.push({ kind: 'needsAttention', sessionId: s.id, waitMsg: s.waitMsg, cwd: s.cwd });
      }
      break;
    }

    case 'SubagentStart': {
      const id = aid || 'sa' + s.subagents.length;
      const type = e.agent_type || e.subagent_type || e.agent_name || 'subagent';
      let sa = s.subagents.find((x) => x.id === id);
      if (!sa) {
        sa = { id, type, running: true, started: e.received_at, lastSeen: e.received_at };
        s.subagents.push(sa);
      } else {
        sa.running = true;
        if (type !== 'subagent') sa.type = type;
        sa.lastSeen = e.received_at;
      }
      pushTl(s, { kind: 'agent', t: e.received_at, text: legendFor(id).f + ' started', agent: id });
      break;
    }

    case 'SubagentStop': {
      const sa = [...s.subagents].reverse().find((x) => x.running && (!aid || x.id === aid));
      if (sa) {
        sa.running = false;
        sa.stopped = e.received_at;
        if (e.last_assistant_message) sa.result = String(e.last_assistant_message);
        settlePending(s, e.received_at, sa.id);
        pushTl(s, {
          kind: 'agent',
          t: e.received_at,
          text: legendFor(sa.id).f + ' finished · ' + fmtDur((sa.stopped || 0) - sa.started),
          agent: sa.id,
          result: sa.result || '',
        });
      }
      reconcileSubs(s, e);
      break;
    }

    case 'Stop': {
      const workMs = s.workStart ? e.received_at - s.workStart : 0;
      s.status = 'idle';
      s.waitMsg = null;
      s.currentTool = null;
      s.doneAt = e.received_at;
      if (Array.isArray(e.background_tasks)) reconcileSubs(s, e);
      else
        s.subagents.forEach((x) => {
          if (x.running) {
            x.running = false;
            x.stopped = e.received_at;
          }
        });
      settlePending(s, e.received_at);
      for (const x of s.subagents) if (!x.running) settlePending(s, e.received_at, x.id);
      const result = e.last_assistant_message ? String(e.last_assistant_message) : '';
      if (result) {
        s.lastResult = result;
        s.lastResultAt = e.received_at;
      }
      const tok =
        typeof e.input_tokens === 'number' || typeof e.output_tokens === 'number'
          ? {
              in: e.input_tokens || 0,
              out: e.output_tokens || 0,
              cache: (e.cache_read_tokens || 0) + (e.cache_write_tokens || 0),
            }
          : null;
      pushTl(s, {
        kind: 'result',
        t: e.received_at,
        text: result || 'Turn finished — idle',
        hasResult: !!result,
        promptId: e.prompt_id || s.promptId || null,
        tok,
      });
      if (live && state.booted) state.effects.push({ kind: 'done', sessionId: s.id, workMs, cwd: s.cwd });
      break;
    }

    case 'SessionEnd':
      s.status = 'ended';
      s.waitMsg = null;
      s.currentTool = null;
      s.subagents.forEach((x) => {
        x.running = false;
      });
      settlePending(s, e.received_at, '*');
      pushTl(s, { kind: 'sys', t: e.received_at, text: 'Session ended' + (e.reason ? ' — ' + e.reason : '') });
      break;
  }
}

// Replay events into a throwaway map (History overlay) without touching live state.
export function replaySession(events: HookEvent[]): Record<string, Session> {
  const tmp: SessionsState = {
    sessions: {},
    eventTimes: [],
    booted: true,
    lastAppliedAt: 0,
    effects: [],
    dismissed: {},
  };
  for (const ev of events) applyEvent(tmp, ev, false);
  return tmp.sessions;
}

// Per-second housekeeping: prune old sessions and reap stalled subagents.
export function tickHousekeeping(state: SessionsState): void {
  const now = Date.now();
  for (const id of Object.keys(state.sessions)) {
    const s = state.sessions[id];
    if (now - s.lastSeen > 86400000) {
      delete state.sessions[id];
      continue;
    }
    for (const sa of s.subagents) {
      if (sa.running && now - (sa.lastSeen || sa.started) > 240000) {
        sa.running = false;
        sa.stopped = sa.lastSeen || sa.started;
        settlePending(s, sa.stopped, sa.id);
      }
    }
  }
  while (state.eventTimes.length && state.eventTimes[0] < now - 60000) state.eventTimes.shift();
}
