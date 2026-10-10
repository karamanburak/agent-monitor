// Time the agent sat blocked mid-task on a permission prompt, from the prompt until the
// session moved on. Idle prompts are left out: they fire after the agent finished its
// turn, so they measure the human's pace, not friction.
import type { Detector, Evidence } from '../types';
import { INTERACTIVE_TOOLS, at, fmtMinutes, isNotification, isPre } from './util';
import type { Event } from '../../types';

const MIN_TOTAL_MS = 3 * 60_000;
const AWAY_MS = 2 * 60 * 60_000; // longer than this the human was away, not blocked

const isPermissionWait = (e: Event): boolean =>
  isNotification(e) &&
  (e.notification_type === 'permission_prompt' || /needs your permission|wants to use/i.test(String(e.message || '')));

export const detectWaiting: Detector = (events) => {
  let total = 0;
  let longest = 0;
  let waits = 0;
  const evidence: Evidence[] = [];
  let lastTool = '';
  for (let i = 0; i < events.length; i++) {
    if (isPre(events[i])) lastTool = String(events[i].tool_name || '');
    if (!isPermissionWait(events[i]) || INTERACTIVE_TOOLS.has(lastTool)) continue;
    const next = events.slice(i + 1).find((e) => !isNotification(e));
    if (!next) continue; // still waiting right now — not a finished wait
    const ms = at(next) - at(events[i]);
    if (ms <= 0 || ms > AWAY_MS) continue;
    total += ms;
    waits++;
    if (ms > longest) longest = ms;
    if (ms >= 60_000) evidence.push({ at: at(events[i]), text: `blocked on permission · ${fmtMinutes(ms)}` });
  }
  if (total < MIN_TOTAL_MS) return [];
  return [
    {
      detector: 'waiting',
      severity: total >= 10 * 60_000 ? 'warn' : 'info',
      title: `Agent sat blocked on permissions for ${fmtMinutes(total)}`,
      detail: `${waits} permission prompts paused the work mid-task; the longest wait was ${fmtMinutes(longest)}.`,
      count: waits,
      evidence: evidence.sort((a, b) => b.at - a.at).slice(0, 3),
      suggestion: 'Pre-approve the safe commands from the permission findings to keep the agent moving.',
    },
  ];
};
