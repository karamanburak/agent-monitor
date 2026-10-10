// An edit that exactly undoes an earlier edit of the same file (A→B, later B→A):
// the agent is going back and forth instead of converging.
import { clip } from '../redact';
import type { Detector } from '../types';
import { at, isPre } from './util';

export const detectEditReverts: Detector = (events) => {
  const edits = events.filter(
    (e) =>
      isPre(e) &&
      e.tool_name === 'Edit' &&
      typeof e.tool_input?.file_path === 'string' &&
      typeof e.tool_input?.old_string === 'string' &&
      typeof e.tool_input?.new_string === 'string' &&
      e.tool_input.old_string !== e.tool_input.new_string,
  );
  const byFile = new Map<string, number[]>();
  for (let j = 1; j < edits.length; j++) {
    const b = edits[j].tool_input;
    for (let i = 0; i < j; i++) {
      const a = edits[i].tool_input;
      if (a.file_path === b.file_path && a.old_string === b.new_string && a.new_string === b.old_string) {
        const list = byFile.get(b.file_path) || [];
        list.push(at(edits[j]));
        byFile.set(b.file_path, list);
        break;
      }
    }
  }
  return [...byFile.entries()].map(([file, ats]) => ({
    detector: 'edit-revert' as const,
    severity: ats.length >= 2 ? ('high' as const) : ('warn' as const),
    title: `Edit undone ${ats.length}× in ${clip(file.split('/').pop(), 60)}`,
    detail: `The agent changed \`${clip(file, 120)}\` and later reverted the exact same change — a sign it was unsure which version was right.`,
    count: ats.length,
    evidence: ats.slice(0, 3).map((t) => ({ at: t, tool: 'Edit', text: clip(file, 120) })),
    suggestion: 'State the intended behaviour (or the failing test) explicitly before the next attempt.',
  }));
};
