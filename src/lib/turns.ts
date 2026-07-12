import type { PromptEntry, Session, TimelineEntry } from './types';

export interface Turn {
  key: string;
  prompt: PromptEntry;
  entries: TimelineEntry[];
}

// Group the flat timeline into per-prompt turns, with a "pre" bucket for rows before the first prompt.
export function buildTurns(s: Session): { pre: TimelineEntry[]; turns: Turn[] } {
  const turns: { key: string; prompt: PromptEntry | null; entries: TimelineEntry[] }[] = [];
  let cur: { key: string; prompt: PromptEntry | null; entries: TimelineEntry[] } = {
    key: 'pre',
    prompt: null,
    entries: [],
  };
  for (const en of s.timeline) {
    if (en.kind === 'prompt') {
      turns.push(cur);
      cur = { key: en.promptId ? 'p' + en.promptId : 't' + en.t, prompt: en, entries: [] };
    } else cur.entries.push(en);
  }
  turns.push(cur);
  const pre = turns.shift()!;
  return { pre: pre.entries, turns: turns.filter((t): t is Turn => t.prompt !== null) };
}

export function turnStats(turn: Turn, now: number) {
  let tools = 0;
  let fails = 0;
  let running = false;
  let end = turn.prompt.t;
  const agents = new Set<string>();
  for (const en of turn.entries) {
    if (en.kind === 'tool') {
      tools++;
      if (en.ok === false) fails++;
      if (en.dur === null) {
        running = true;
        end = Math.max(end, now);
      } else end = Math.max(end, en.t + en.dur);
      if (en.agent) agents.add(en.agent);
    } else {
      end = Math.max(end, en.t);
      if (en.kind === 'agent' && en.agent) agents.add(en.agent);
    }
  }
  return { tools, fails, running, agents: agents.size, dur: Math.max(0, end - turn.prompt.t) };
}
