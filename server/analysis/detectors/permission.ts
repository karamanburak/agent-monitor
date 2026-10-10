// The same kind of call keeps triggering a permission prompt. Each prompt is matched to
// the tool call that was pending when it fired, then grouped into the allow-rule that
// would have skipped it. Risky commands get flagged instead of a ready-made rule.
import { clip } from '../redact';
import type { Detector, Evidence } from '../types';
import { INTERACTIVE_TOOLS, at, commandPrefix, isFailure, isNotification, isPost, isPre } from './util';
import type { Event } from '../../types';

const MIN_PROMPTS = 2;
const RISKY =
  /^(rm|sudo|chmod|chown|dd|mkfs|curl|wget|ssh|scp|git push|git reset|git clean|git checkout|docker rm|kubectl delete|aws)\b/;

// "for f in …; do …" → prefix "for", which no allow rule can sensibly match
const SHELL_KEYWORDS = /^(for|while|until|if|case|do|then|\{|\(|\[)$/;

function ruleFor(e: Event): string {
  if (e.tool_name === 'Bash') return `Bash(${commandPrefix(e.tool_input?.command)}:*)`;
  if (e.tool_name === 'WebFetch') {
    try {
      return `WebFetch(domain:${new URL(e.tool_input?.url).hostname})`;
    } catch {}
  }
  return String(e.tool_name || '?');
}

const isPermissionPrompt = (e: Event) =>
  isNotification(e) && (e.notification_type === 'permission_prompt' || /needs your permission/i.test(e.message || ''));

export const detectPermissionFriction: Detector = (events) => {
  const pending = new Map<string, Event>(); // tool_use_id → PreToolUse awaiting a result
  const groups = new Map<string, Evidence[]>();
  let editPrompts = 0;
  for (const e of events) {
    if (isPre(e) && e.tool_use_id) pending.set(e.tool_use_id, e);
    else if ((isPost(e) || isFailure(e)) && e.tool_use_id) pending.delete(e.tool_use_id);
    else if (isPermissionPrompt(e)) {
      const call = [...pending.values()].filter((p) => at(e) - at(p) < 60_000).pop();
      if (!call || INTERACTIVE_TOOLS.has(call.tool_name)) continue;
      if (['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(call.tool_name)) {
        editPrompts++;
        continue;
      }
      const rule = ruleFor(call);
      groups.set(rule, [
        ...(groups.get(rule) || []),
        { at: at(e), tool: call.tool_name, text: clip(call.tool_input?.command || rule, 120) },
      ]);
    }
  }

  const out: ReturnType<Detector> = [...groups.entries()]
    .filter(([, ev]) => ev.length >= MIN_PROMPTS)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)
    .map(([rule, ev]) => {
      const risky = RISKY.test(rule.replace(/^Bash\(|:\*\)$/g, ''));
      const compound = SHELL_KEYWORDS.test(rule.replace(/^Bash\(|:\*\)$/g, ''));
      const outside = ['Read', 'Glob', 'Grep'].includes(rule);
      return {
        detector: 'permission' as const,
        severity: ev.length >= 5 ? ('high' as const) : ('warn' as const),
        title: `${clip(rule, 70)} asked for permission ${ev.length}×`,
        detail: risky
          ? `This command can change or delete things outside the project, so it was left out of the suggestions — keep approving it by hand.`
          : compound
            ? 'These were compound shell commands (loops, conditionals); split them or wrap them in a script you can pre-approve.'
            : outside
              ? 'File access outside the project folder asks every time.'
              : `Pre-approving this in settings would have saved ${ev.length} interruptions.`,
        count: ev.length,
        evidence: ev.slice(0, 3),
        suggestion:
          risky || compound
            ? undefined
            : outside
              ? 'Add the folders it keeps reaching into to "permissions.additionalDirectories" in settings.'
              : `"permissions": { "allow": ["${rule}"] }`,
      };
    });
  if (editPrompts >= 3)
    out.push({
      detector: 'permission',
      severity: 'info',
      title: `File edits asked for permission ${editPrompts}×`,
      detail: 'Edit approvals interrupted the session repeatedly.',
      count: editPrompts,
      evidence: [],
      suggestion: 'Use "accept edits" mode (Shift+Tab) for sessions where you review the diff afterwards anyway.',
    });
  return out;
};
