import type { StatusKind } from './types';

export const STATUS_LABEL: Record<string, string> = {
  working: 'Working',
  waiting: 'Needs you',
  idle: 'Idle',
  ended: 'Ended',
};

// categorical hues live in tokens.css (--cat-1..8) so they follow the theme
const CAT = (n: number) => `var(--cat-${n})`;
export const AVATAR_COLORS = [1, 3, 4, 2, 5, 6, 7, 8].map(CAT);

export const KIND_COLOR: Record<string, string> = {
  tool: 'var(--acc)',
  fail: 'var(--err)',
  sys: 'var(--mut)',
  note: 'var(--warn)',
  agent: 'var(--sub)',
  result: 'var(--ok)',
};

export const MODEL_COLORS = [1, 2, 3, 4, 5, 6, 7, 8].map(CAT);

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
const CANON_BY_FOLD: Record<string, string> = Object.fromEntries(CANONICAL_EVENTS.map((n) => [fold(n), n]));

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

export interface RadioStation {
  id: string; // stable key (the YouTube id for embeds, a slug for streams)
  title: string;
  label: string;
  hint: string;
  yt?: string; // YouTube live embed
  src?: string; // direct audio stream (Icecast et al.) — played via <audio>, no video
  home?: string; // where the ↗ link points for stream stations
  group?: string; // optional section heading rendered above the first station of the group
}

export const RADIO_STATIONS: RadioStation[] = [
  {
    id: 'tRsQsTMvPNg',
    yt: 'tRsQsTMvPNg',
    title: '📻 Claude FM',
    label: '📻 Claude FM',
    hint: "Claude's own live YouTube radio — click to play here",
  },
];
