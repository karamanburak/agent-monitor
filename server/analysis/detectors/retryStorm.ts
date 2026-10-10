// The same kind of tool call fails again and again. Failures come from PostToolUseFailure,
// an is_error response, or a PreToolUse that never got a result and was not waiting on a permission prompt.
import { clip } from '../redact';
import type { Detector, Evidence } from '../types';
import { at, commandPrefix, inputSummary, isFailure, isNotification, isPost, isPre } from './util';
import type { Event } from '../../types';

const MIN_FAILS = 3;

function failKey(e: Event): string {
  if (e.tool_name === 'Bash') return 'Bash: ' + commandPrefix(e.tool_input?.command);
  const file = e.tool_input?.file_path || e.tool_input?.path;
  return file ? `${e.tool_name}: ${file}` : String(e.tool_name || '?');
}

function errorText(e: Event): string {
  const r = e.tool_response;
  return String(e.error || r?.error || r?.stderr || (typeof r === 'string' ? r : '') || 'no result recorded');
}

export const detectRetryStorms: Detector = (events) => {
  // a call that got a result, or that hit a permission prompt (a "no" there is a choice, not a failure)
  const settled = new Set<string>();
  const pending = new Set<string>();
  for (const e of events) {
    if (isPre(e) && e.tool_use_id) pending.add(e.tool_use_id);
    else if ((isPost(e) || isFailure(e)) && e.tool_use_id) {
      settled.add(e.tool_use_id);
      pending.delete(e.tool_use_id);
    } else if (isNotification(e) && e.notification_type === 'permission_prompt') {
      for (const id of pending) settled.add(id);
      pending.clear();
    }
  }
  const lastAt = events.length ? at(events[events.length - 1]) : 0;

  const groups = new Map<string, Evidence[]>();
  const add = (e: Event, text: string) => {
    const key = failKey(e);
    const list = groups.get(key) || [];
    list.push({ at: at(e), tool: e.tool_name, text: clip(text, 140) });
    groups.set(key, list);
  };
  for (const e of events) {
    if (isFailure(e)) add(e, `${clip(inputSummary(e), 60)} → ${errorText(e)}`);
    // an unanswered call counts only once the session has clearly moved on
    else if (isPre(e) && e.tool_use_id && !settled.has(e.tool_use_id) && lastAt - at(e) > 60_000)
      add(e, `${clip(inputSummary(e), 60)} → no result (failed or interrupted)`);
  }

  return [...groups.entries()]
    .filter(([, ev]) => ev.length >= MIN_FAILS)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)
    .map(([key, ev]) => ({
      detector: 'retry-storm' as const,
      severity: ev.length >= 5 ? ('high' as const) : ('warn' as const),
      title: `${clip(key, 70)} failed ${ev.length}×`,
      detail: `Repeated failures of the same kind of call. The agent kept retrying instead of changing approach.`,
      count: ev.length,
      evidence: ev.slice(0, 3),
      suggestion: key.startsWith('Bash: ')
        ? `If \`${key.slice(6)}\` needs setup (env, install, working dir), document it in CLAUDE.md.`
        : undefined,
    }));
};
