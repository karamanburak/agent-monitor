// The same file is read over and over although nothing changed it in between —
// context window spent on content the agent already had.
import { clip } from '../redact';
import type { Detector } from '../types';
import { at, isPre, MUTATING_TOOLS } from './util';

const MIN_REDUNDANT = 3;

export const detectReadThrash: Detector = (events) => {
  const seen = new Set<string>(); // read and unchanged since
  const redundant = new Map<string, number[]>();
  for (const e of events) {
    if (!isPre(e)) continue;
    // a shell command that names the file or works in its folder may have rewritten it (build, render, sed -i, …)
    if (e.tool_name === 'Bash' && typeof e.tool_input?.command === 'string') {
      const cmd = e.tool_input.command;
      for (const f of [...seen]) {
        const dir = f.slice(0, f.lastIndexOf('/'));
        if (cmd.includes(f.slice(f.lastIndexOf('/') + 1)) || (dir && cmd.includes(dir))) seen.delete(f);
      }
      continue;
    }
    const file = e.tool_input?.file_path;
    if (typeof file !== 'string') continue;
    if (MUTATING_TOOLS.has(e.tool_name)) seen.delete(file);
    else if (e.tool_name === 'Read') {
      // a partial read (offset/limit) of a big file is not a re-read
      if (e.tool_input?.offset || e.tool_input?.limit) continue;
      if (seen.has(file)) redundant.set(file, [...(redundant.get(file) || []), at(e)]);
      else seen.add(file);
    }
  }
  return [...redundant.entries()]
    .filter(([, ats]) => ats.length >= MIN_REDUNDANT)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)
    .map(([file, ats]) => ({
      detector: 'read-thrash' as const,
      severity: ats.length >= 6 ? ('warn' as const) : ('info' as const),
      title: `${clip(file.split('/').pop(), 60)} re-read ${ats.length}× unchanged`,
      detail: `\`${clip(file, 120)}\` was read again ${ats.length} times without any edit in between, filling the context with content the agent already had.`,
      count: ats.length,
      evidence: ats.slice(0, 3).map((t) => ({ at: t, tool: 'Read', text: clip(file, 120) })),
    }));
};
