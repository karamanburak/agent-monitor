// Single source of truth for keyboard shortcuts: the global key handler (useHotkeys)
// and the "?" cheatsheet both read this list, so they can't drift apart.

const isMac = typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.platform);

export interface Combo {
  key: string; // KeyboardEvent.key, compared case-insensitively
  mod?: boolean; // ⌘ on macOS, Ctrl elsewhere
  shift?: boolean;
  anyShift?: boolean; // for keys whose glyph already implies Shift (e.g. "?")
}

export interface ShortcutDef {
  id: string;
  keys: string[]; // how the cheatsheet renders it
  desc: string;
  combo?: Combo; // omitted = handled locally by a component (listed for discoverability)
  whileTyping?: boolean; // fire even when focus is in a text field
}

export const SHORTCUTS: ShortcutDef[] = [
  {
    id: 'palette',
    keys: [isMac ? '⌘' : 'Ctrl', 'K'],
    desc: 'Open the command palette — jump to a session or run a command',
    combo: { key: 'k', mod: true },
    whileTyping: true,
  },
  { id: 'navigate', keys: ['↑', '↓'], desc: 'Move the selection between live sessions' },
  {
    id: 'grid',
    keys: ['G'],
    desc: 'Open the Grid — all live sessions as cards, plus a cross-session activity feed',
    combo: { key: 'g' },
  },
  { id: 'notes', keys: ['N'], desc: 'Open the Notes scratchpad', combo: { key: 'n' } },
  {
    id: 'close',
    keys: ['Esc'],
    desc: 'Close the open overlay, inspector, or palette',
    combo: { key: 'Escape', anyShift: true },
    whileTyping: true,
  },
  { id: 'radioNext', keys: ['R'], desc: 'Show the radio panel & jump to the next station', combo: { key: 'r' } },
  { id: 'radioPause', keys: ['P'], desc: 'Play / pause the current radio station in place', combo: { key: 'p' } },
  { id: 'radioStop', keys: ['⇧', 'R'], desc: 'Stop playback & hide the radio panel', combo: { key: 'r', shift: true } },
  { id: 'help', keys: ['?'], desc: 'Show this shortcuts panel', combo: { key: '?', anyShift: true } },
];

export function matchesCombo(c: Combo, e: KeyboardEvent): boolean {
  if (e.altKey) return false;
  if (!!c.mod !== (e.metaKey || e.ctrlKey)) return false;
  if (!c.anyShift && !!c.shift !== e.shiftKey) return false;
  return e.key.toLowerCase() === c.key.toLowerCase();
}

export function isTypingTarget(el: Element | null): boolean {
  return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}
