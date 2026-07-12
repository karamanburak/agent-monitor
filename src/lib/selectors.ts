import { displayStatus } from './constants';
import { basename } from './format';
import type { Session, StatusKind } from './types';

export function matchesQuery(s: Session, query: string): boolean {
  if (!query) return true;
  const hay = (
    basename(s.cwd) +
    ' ' +
    (s.cwd || '') +
    ' ' +
    (s.prompt || '') +
    ' ' +
    (s.currentTool ? s.currentTool.name + ' ' + s.currentTool.detail : '')
  ).toLowerCase();
  return hay.includes(query);
}

export function sessionOneLiner(s: Session, st: StatusKind): string {
  if (st === 'waiting') return s.waitMsg || 'Needs your input';
  if (st === 'working' && s.currentTool)
    return s.currentTool.name + (s.currentTool.detail ? ' — ' + s.currentTool.detail : '');
  const running = s.subagents.filter((x) => x.running).length;
  if (st === 'working' && running) return running + ' subagent' + (running === 1 ? '' : 's') + ' running';
  if (st === 'working') return 'Thinking…';
  return s.prompt || 'Idle';
}

export type RailStatusFilter = 'all' | 'needs' | 'working' | 'failed';

function matchesStatus(s: Session, filter: RailStatusFilter): boolean {
  if (filter === 'all') return true;
  const st = displayStatus(s);
  if (filter === 'needs') return st === 'waiting';
  if (filter === 'working') return st === 'working';
  if (filter === 'failed') return s.failCount > 0;
  return true;
}

// The status filter narrows only the live list; the Finished group is unaffected.
export function partitionSessions(sessions: Record<string, Session>, query: string, status: RailStatusFilter = 'all') {
  const all = Object.values(sessions);
  const live = all
    .filter((s) => displayStatus(s) !== 'ended' && matchesQuery(s, query) && matchesStatus(s, status))
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, 40);
  const finished = all
    .filter((s) => displayStatus(s) === 'ended' && matchesQuery(s, query))
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, 50);
  return { live, finished };
}
