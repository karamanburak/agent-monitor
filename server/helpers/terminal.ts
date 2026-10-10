// macOS terminal integration: jump back to the exact terminal a session runs in, or
// open a new one in its project folder. Every external call is execFile with an
// argument array (never a shell), and AppleScript receives values through `argv`,
// so nothing a session recorded can ever be interpreted as code.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SUPPORTED = process.platform === 'darwin';

export type AppId = 'terminal' | 'iterm' | 'ghostty' | 'warp';

const APPS: Record<AppId, { name: string; bundle: string; paths: string[] }> = {
  terminal: {
    name: 'Terminal',
    bundle: 'com.apple.Terminal',
    paths: ['/System/Applications/Utilities/Terminal.app', '/Applications/Utilities/Terminal.app'],
  },
  iterm: { name: 'iTerm', bundle: 'com.googlecode.iterm2', paths: ['/Applications/iTerm.app'] },
  ghostty: { name: 'Ghostty', bundle: 'com.mitchellh.ghostty', paths: ['/Applications/Ghostty.app'] },
  warp: { name: 'Warp', bundle: 'dev.warp.Warp-Stable', paths: ['/Applications/Warp.app'] },
};
export const APP_IDS = Object.keys(APPS) as AppId[];

export interface JumpResult {
  ok: boolean;
  how?: 'tab' | 'app' | 'new';
  app?: string;
  reason?: 'no-term' | 'gone' | 'detached' | 'unsupported' | 'failed';
  clipboard?: string; // a command the UI should copy for the user (apps that can't run one)
}

function run(cmd: string, args: string[], timeout = 5000): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout }, (err, stdout) => (err ? reject(err) : resolve(String(stdout).trim()))),
  );
}
const osa = (script: string, ...args: string[]) => run('osascript', ['-e', script, ...args]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function appPath(id: AppId): string | null {
  const a = APPS[id];
  for (const p of [...a.paths, path.join(os.homedir(), 'Applications', path.basename(a.paths[0]))])
    if (fs.existsSync(p)) return p;
  return null;
}

export function installedApps(): { id: AppId; name: string }[] {
  return APP_IDS.filter((id) => appPath(id)).map((id) => ({ id, name: APPS[id].name }));
}

// "/Applications/Ghostty.app" or "com.mitchellh.ghostty" → "ghostty"
function appIdOf(appOrBundle: string | null | undefined): AppId | null {
  if (!appOrBundle) return null;
  const v = appOrBundle.toLowerCase();
  for (const id of APP_IDS) {
    const a = APPS[id];
    if (v === a.bundle.toLowerCase() || a.paths.some((p) => v === p.toLowerCase())) return id;
    if (v.endsWith('/' + path.basename(a.paths[0]).toLowerCase())) return id;
  }
  return null;
}

// tmux is often only on Homebrew's PATH, which a launchd-started server may not have
function tmuxBin(): string {
  for (const p of ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux', '/usr/bin/tmux']) if (fs.existsSync(p)) return p;
  return 'tmux';
}

const TTY_RE = /^\/dev\/ttys?\d+$/;
const PANE_RE = /^%\d+$/;

async function procsOnTty(tty: string): Promise<{ pid: number; comm: string }[]> {
  try {
    const out = await run('ps', ['-t', tty.replace('/dev/', ''), '-o', 'pid=,comm=']);
    return out
      .split('\n')
      .map((l) => l.trim().match(/^(\d+)\s+(.*)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => ({ pid: Number(m[1]), comm: m[2] }));
  } catch {
    return [];
  }
}
const isAgent = (comm: string) => /(^|\/)(claude|node)$/i.test(comm.trim());

// Walk up from a process to the .app that owns it (the terminal emulator).
async function appOfPid(pid: number): Promise<string | null> {
  let p = pid;
  for (let i = 0; i < 12 && p > 1; i++) {
    let line = '';
    try {
      line = await run('ps', ['-o', 'ppid=,comm=', '-p', String(p)]);
    } catch {
      return null;
    }
    const m = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!m) return null;
    const app = m[2].match(/^(\/.*?\.app)\//);
    if (app) return app[1];
    p = Number(m[1]);
  }
  return null;
}

// Make the tmux client that shows this pane display it; returns that client's tty.
async function tmuxJump(
  socket: string,
  pane: string,
): Promise<{ tty: string; pid: number } | { reason: 'gone' | 'detached' }> {
  const tmux = (args: string[]) => run(tmuxBin(), ['-S', socket, ...args]);
  let sessId = '';
  try {
    sessId = await tmux(['display-message', '-p', '-t', pane, '#{session_id}']);
  } catch {
    return { reason: 'gone' };
  }
  let clients: { tty: string; activity: number; sess: string; pid: number }[] = [];
  try {
    clients = (await tmux(['list-clients', '-F', '#{client_tty}\t#{client_activity}\t#{session_id}\t#{client_pid}']))
      .split('\n')
      .map((l) => l.split('\t'))
      .filter((f) => f.length === 4 && TTY_RE.test(f[0]))
      .map(([tty, act, sess, pid]) => ({ tty, activity: Number(act), sess, pid: Number(pid) }))
      .sort((a, b) => b.activity - a.activity);
  } catch {}
  const client = clients.find((c) => c.sess === sessId) || clients[0];
  if (!client) return { reason: 'detached' };
  if (client.sess !== sessId) await tmux(['switch-client', '-c', client.tty, '-t', sessId]).catch(() => {});
  await tmux(['select-window', '-t', pane]).catch(() => {});
  await tmux(['select-pane', '-t', pane]).catch(() => {});
  return { tty: client.tty, pid: client.pid };
}

const TERMINAL_FOCUS = `on run argv
  set tt to item 1 of argv
  tell application "Terminal"
    repeat with w in windows
      repeat with tb in tabs of w
        if tty of tb is tt then
          set selected of tb to true
          set index of w to 1
          activate
          return "ok"
        end if
      end repeat
    end repeat
  end tell
  return ""
end run`;

const ITERM_FOCUS = `on run argv
  set tt to item 1 of argv
  tell application "iTerm"
    repeat with w in windows
      repeat with tb in tabs of w
        repeat with s in sessions of tb
          if tty of s is tt then
            select w
            select tb
            select s
            activate
            return "ok"
          end if
        end repeat
      end repeat
    end repeat
  end tell
  return ""
end run`;

const GHOSTTY_LIST = `on run argv
  set sepTab to character id 9
  set sepLine to character id 10
  set out to ""
  tell application "Ghostty"
    repeat with term in terminals
      set out to out & (id of term) & sepTab & (name of term) & sepLine
    end repeat
  end tell
  return out
end run`;

const GHOSTTY_FOCUS_NAMED = `on run argv
  set mk to item 1 of argv
  tell application "Ghostty"
    repeat with t in terminals
      if name of t is mk then
        focus t
        activate
        return id of t
      end if
    end repeat
  end tell
  return ""
end run`;

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const writeTitle = (tty: string, title: string) => {
  const fd = fs.openSync(tty, fs.constants.O_WRONLY | fs.constants.O_NOCTTY);
  try {
    // control characters would end the title sequence early, so they are dropped
    const clean = [...title].filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127).join('');
    fs.writeSync(fd, `${ESC}]2;${clean}${BEL}`);
  } finally {
    fs.closeSync(fd);
  }
};

// Ghostty can't look a terminal up by tty, so briefly title the tty with a unique
// marker, focus the terminal carrying it, then put the previous title back.
async function ghosttyFocusTty(tty: string): Promise<boolean> {
  const before = new Map<string, string>();
  for (const line of (await osa(GHOSTTY_LIST).catch(() => '')).split('\n')) {
    const [id, ...name] = line.split('\t');
    if (id) before.set(id, name.join('\t'));
  }
  const marker = `agent-monitor-${process.pid}-${Date.now()}`;
  try {
    writeTitle(tty, marker);
  } catch {
    return false;
  }
  let id = '';
  for (let i = 0; i < 6 && !id; i++) {
    await sleep(60);
    id = await osa(GHOSTTY_FOCUS_NAMED, marker).catch(() => '');
  }
  try {
    writeTitle(tty, (id && before.get(id)) || '');
  } catch {}
  return !!id;
}

async function focusOuter(tty: string, pid: number, hint: Record<string, string>, cwd: string): Promise<JumpResult> {
  const appP = (await appOfPid(pid)) || null;
  const id = appIdOf(appP) || appIdOf(hint.app);
  const name = id ? APPS[id].name : appP ? path.basename(appP, '.app') : '';
  if (id === 'terminal' && (await osa(TERMINAL_FOCUS, tty).catch(() => '')) === 'ok')
    return { ok: true, how: 'tab', app: name };
  if (id === 'iterm' && (await osa(ITERM_FOCUS, tty).catch(() => '')) === 'ok')
    return { ok: true, how: 'tab', app: name };
  if (id === 'ghostty' && (await ghosttyFocusTty(tty))) return { ok: true, how: 'tab', app: name };
  // no per-tab scripting (Warp) or an editor's terminal: bring the app (editors: the project window) forward
  const target = appP || (id ? appPath(id) : null);
  if (!target) return { ok: false, reason: 'failed' };
  const editor = hint.program === 'vscode';
  await run('open', editor && cwd ? ['-a', target, cwd] : ['-a', target]).catch(() => {});
  return { ok: true, how: 'app', app: name };
}

export async function focusSession(term: Record<string, string> | null, cwd: string): Promise<JumpResult> {
  if (!SUPPORTED) return { ok: false, reason: 'unsupported' };
  if (!term) return { ok: false, reason: 'no-term' };
  const socket = (term.tmux || '').split(',')[0];
  if (PANE_RE.test(term.pane || '') && path.isAbsolute(socket) && fs.existsSync(socket)) {
    const r = await tmuxJump(socket, term.pane);
    if ('reason' in r) return { ok: false, reason: r.reason };
    return focusOuter(r.tty, r.pid, term, cwd);
  }
  if (!TTY_RE.test(term.tty || '')) return { ok: false, reason: 'no-term' };
  const procs = await procsOnTty(term.tty);
  // the tty may have been closed (and even reused by another tab) since the session ended
  if (!procs.some((p) => isAgent(p.comm))) return { ok: false, reason: 'gone' };
  return focusOuter(term.tty, procs[0].pid, term, cwd);
}

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

const TERMINAL_OPEN = `on run argv
  tell application "Terminal"
    do script (item 1 of argv)
    activate
  end tell
end run`;

const ITERM_OPEN = `on run argv
  tell application "iTerm"
    set w to (create window with default profile)
    tell current session of w to write text (item 1 of argv)
    activate
  end tell
end run`;

// new tab in the front window (new window if none), started in the folder, with the
// command typed in as initial input
const GHOSTTY_OPEN = `on run argv
  tell application "Ghostty"
    set cfg to new surface configuration
    set initial working directory of cfg to (item 1 of argv)
    if (item 2 of argv) is not "" then set initial input of cfg to (item 2 of argv) & (character id 10)
    if (count of windows) > 0 then
      new tab in front window with configuration cfg
    else
      new window with configuration cfg
    end if
    activate
  end tell
end run`;

// Open a new terminal in `cwd`, optionally running `cmd` (built by the caller from validated parts).
export async function openTerminal(app: AppId, cwd: string, cmd: string): Promise<JumpResult> {
  if (!SUPPORTED) return { ok: false, reason: 'unsupported' };
  if (!appPath(app)) return { ok: false, reason: 'failed' };
  const name = APPS[app].name;
  const line = `cd ${shq(cwd)}` + (cmd ? ` && ${cmd}` : '');
  try {
    if (app === 'terminal') await osa(TERMINAL_OPEN, line);
    else if (app === 'iterm') await osa(ITERM_OPEN, line);
    else if (app === 'ghostty') await osa(GHOSTTY_OPEN, cwd, cmd);
    else {
      // Warp has no scripting API: its URI scheme opens a tab in the folder; the command goes to the clipboard
      await run('open', [`warp://action/new_tab?path=${encodeURIComponent(cwd)}`]);
      return { ok: true, how: 'new', app: name, clipboard: cmd || undefined };
    }
  } catch {
    return { ok: false, reason: 'failed' };
  }
  return { ok: true, how: 'new', app: name };
}

// "auto" = the app the session itself ran in (when known and installed), else Terminal
export function resolveApp(choice: string, term: Record<string, string> | null): AppId {
  if (APP_IDS.includes(choice as AppId) && appPath(choice as AppId)) return choice as AppId;
  const own = appIdOf(term?.app);
  return own && appPath(own) ? own : 'terminal';
}
