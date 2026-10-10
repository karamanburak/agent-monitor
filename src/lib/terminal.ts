import type { TermInfo } from './types';

// bundle id / $TERM_PROGRAM → a readable app name
const APP_NAMES: Record<string, string> = {
  'com.apple.terminal': 'Terminal',
  apple_terminal: 'Terminal',
  'com.googlecode.iterm2': 'iTerm',
  'iterm.app': 'iTerm',
  'com.mitchellh.ghostty': 'Ghostty',
  ghostty: 'Ghostty',
  'dev.warp.warp-stable': 'Warp',
  warpterminal: 'Warp',
  'com.microsoft.vscode': 'VS Code',
  'com.todesktop.230313mzl4w4u92': 'Cursor',
  vscode: 'VS Code',
};

// "Ghostty · tmux", "Terminal", "" (nothing reported)
export function terminalLabel(t: TermInfo): string {
  const app = APP_NAMES[(t.app || '').toLowerCase()] || APP_NAMES[(t.program || '').toLowerCase()] || '';
  const tmux = !!t.pane || t.program === 'tmux';
  return [app, tmux ? 'tmux' : ''].filter(Boolean).join(' · ') || (t.tty ? 'terminal' : '');
}

export type TermAction = 'focus' | 'open' | 'resume';
export interface TermApp {
  id: string;
  name: string;
}
export interface TermResult {
  ok: boolean;
  how?: 'tab' | 'app' | 'new';
  app?: string;
  reason?: 'no-term' | 'gone' | 'detached' | 'unsupported' | 'failed' | 'no-folder';
  clipboard?: string;
}

export async function getTerminalInfo(): Promise<{ supported: boolean; apps: TermApp[] }> {
  return (await fetch('/terminal')).json();
}

export async function terminalAction(id: string, action: TermAction, app: string): Promise<TermResult> {
  const r = await fetch('/terminal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, action, app }),
  });
  return r.json();
}
