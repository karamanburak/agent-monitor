// Small helpers shared by the detectors. Hook payloads differ between agents
// ("PreToolUse", "preToolUse", "pre_tool_use"), so names are normalised once here.
import type { Event } from '../../types';

export const kind = (e: Event): string =>
  String(e.hook_event_name || '')
    .toLowerCase()
    .replace(/_/g, '');

export const isPre = (e: Event) => kind(e) === 'pretooluse';
export const isPost = (e: Event) => kind(e) === 'posttooluse';
export const isFailure = (e: Event) =>
  kind(e) === 'posttoolusefailure' || (isPost(e) && e.tool_response?.is_error === true);
export const isPrompt = (e: Event) => kind(e) === 'userpromptsubmit' || kind(e) === 'beforesubmitprompt';
export const isNotification = (e: Event) => kind(e) === 'notification';

// Tools that ask the human by design — their prompts are the point, not friction.
export const INTERACTIVE_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode', 'EnterPlanMode']);

export const MUTATING_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
export const isMutation = (e: Event) => isPre(e) && MUTATING_TOOLS.has(e.tool_name);

export const at = (e: Event): number => Number(e.received_at) || 0;

// Key-order-independent JSON, so {a,b} and {b,a} count as the same input.
export function stableJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? '';
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
  const o = v as Record<string, unknown>;
  return (
    '{' +
    Object.keys(o)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + stableJson(o[k]))
      .join(',') +
    '}'
  );
}

// The one-line description of a tool call a human would recognise.
export function inputSummary(e: Event): string {
  const ti = e.tool_input;
  if (!ti || typeof ti !== 'object') return typeof ti === 'string' ? ti : '';
  for (const k of ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description', 'prompt'])
    if (typeof ti[k] === 'string' && ti[k]) return ti[k];
  return stableJson(ti);
}

// Tools whose first argument is a subcommand worth keeping ("git push", "bun test").
const SUBCOMMAND_TOOLS = new Set([
  'git',
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'npx',
  'bunx',
  'docker',
  'gh',
  'cargo',
  'go',
  'make',
  'kubectl',
  'aws',
  'python',
  'python3',
  'node',
]);

// "cd app && FOO=1 bun test --watch" → "bun test"
export function commandPrefix(command: string): string {
  let c = String(command || '').trim();
  c = c.replace(/^(cd\s+\S+\s*(&&|;)\s*)+/, '');
  c = c.replace(/^([A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, '');
  const words = c.split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const first = words[0].replace(/^.*\//, '');
  const second = words[1];
  return SUBCOMMAND_TOOLS.has(first) && second && !second.startsWith('-') ? `${first} ${second}` : first;
}

export function fmtMinutes(ms: number): string {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
