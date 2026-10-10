// The agent issues the exact same tool call again and again with nothing changing in
// between (no file edit, no new prompt) — it is polling or stuck. Re-running tests after an
// edit is normal work, so any mutation or user prompt breaks the chain.
import { clip } from '../redact';
import type { Detector } from '../types';
import { at, inputSummary, isMutation, isPre, isPrompt, stableJson } from './util';

const MIN_CHAIN = 3;
const IGNORE = new Set(['Read', 'TaskUpdate', 'TodoWrite', 'ToolSearch', 'TaskList', 'TaskGet']); // Read: see read-thrash

export const detectLoops: Detector = (events) => {
  const chains = new Map<string, { tool: string; ats: number[]; summary: string }>();
  const best = new Map<string, { tool: string; ats: number[]; summary: string }>();
  const settle = (key: string) => {
    const c = chains.get(key);
    if (c && c.ats.length >= MIN_CHAIN && c.ats.length > (best.get(key)?.ats.length ?? 0)) best.set(key, c);
    chains.delete(key);
  };

  for (const e of events) {
    if (isPrompt(e) || isMutation(e)) {
      for (const key of [...chains.keys()]) settle(key);
      continue;
    }
    if (!isPre(e) || !e.tool_name || IGNORE.has(e.tool_name)) continue;
    const key = e.tool_name + '\u0000' + stableJson(e.tool_input);
    const c = chains.get(key);
    if (c) c.ats.push(at(e));
    else chains.set(key, { tool: e.tool_name, ats: [at(e)], summary: inputSummary(e) });
  }
  for (const key of [...chains.keys()]) settle(key);

  return [...best.values()]
    .sort((a, b) => b.ats.length - a.ats.length)
    .slice(0, 5)
    .map((c) => ({
      detector: 'loop' as const,
      severity: c.ats.length >= 6 ? ('high' as const) : ('warn' as const),
      title: `Same ${c.tool} call repeated ${c.ats.length}× with no change in between`,
      detail: `The agent ran \`${clip(c.summary, 120)}\` ${c.ats.length} times without editing a file or getting a new prompt — it was likely polling or stuck.`,
      count: c.ats.length,
      evidence: c.ats.slice(0, 3).map((t) => ({ at: t, tool: c.tool, text: clip(c.summary, 120) })),
    }));
};
