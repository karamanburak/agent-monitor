import type { StatusKind } from './types';

export const STATUS_LABEL: Record<string, string> = {
  working: 'Working',
  waiting: 'Needs you',
  idle: 'Idle',
  ended: 'Ended',
};

export const AVATAR_COLORS = ['#4c8dff', '#3fb950', '#d29922', '#a48bfa', '#f2718e', '#31b8bd', '#e0823d', '#8ca9c9'];

export const KIND_COLOR: Record<string, string> = {
  tool: 'var(--acc)',
  fail: 'var(--err)',
  sys: 'var(--mut)',
  note: 'var(--warn)',
  agent: 'var(--sub)',
  result: 'var(--ok, #3fb950)',
};

export const MODEL_COLORS = ['#4c8dff', '#a48bfa', '#3fb950', '#d29922', '#d55181', '#26c6da', '#f85149', '#8899a6'];

export const CANONICAL_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'Notification',
] as const;

// Explicit aliases that DON'T reduce to a canonical name by case/separator folding.
export const NAME_MAP: Record<string, string> = {
  beforeSubmitPrompt: 'UserPromptSubmit',
  userPrompt: 'UserPromptSubmit',
  prompt: 'UserPromptSubmit',
  toolStart: 'PreToolUse',
  toolEnd: 'PostToolUse',
  toolError: 'PostToolUseFailure',
  sessionResume: 'SessionStart',
  turnEnd: 'Stop',
};

// Fold to a comparison key so "PreToolUse"/"pre_tool_use"/"PRE-TOOL-USE" all match.
const fold = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const CANON_BY_FOLD: Record<string, string> = Object.fromEntries(
  CANONICAL_EVENTS.map((n) => [fold(n), n]),
);

export function normalizeEventName(raw: string | undefined): string {
  if (!raw) return '';
  if ((CANONICAL_EVENTS as readonly string[]).includes(raw)) return raw;
  if (NAME_MAP[raw]) return NAME_MAP[raw];
  const f = fold(raw);
  if (NAME_MAP[f]) return NAME_MAP[f];
  return CANON_BY_FOLD[f] || raw;
}

export const SOURCE_LABEL: Record<string, string> = {
  claude: 'Claude',
  'claude-code': 'Claude',
  cursor: 'Cursor',
  gemini: 'Gemini',
  codex: 'Codex',
  aider: 'aider',
  copilot: 'Copilot',
};

export function displayStatus(s: { status: StatusKind; lastSeen: number }): StatusKind {
  if (s.status === 'ended') return 'ended';
  const quiet = Date.now() - s.lastSeen;
  if (s.status === 'waiting') return quiet > 3600000 ? 'ended' : 'waiting';
  if (quiet > 1800000) return 'ended';
  if (s.status === 'working' && quiet > 600000) return 'idle';
  return s.status;
}
