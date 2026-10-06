import fs from 'node:fs';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from '../config';
import { sendJson } from '../helpers/http';
import { countEvents } from '../models/db';

// The hook events the forwarder should be registered for — keep in sync with README.md.
const HOOK_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'Stop',
  'SubagentStop',
  'PreToolUse',
  'PostToolUse',
  'Notification',
];

// Read-only setup probe for the first-run checklist: is the forwarder executable,
// and which events reference it in ~/.claude/settings.json? This endpoint only
// reads local files, never writes, and (like everything here) serves 127.0.0.1 only.
export function getSetup(_req: http.IncomingMessage, res: http.ServerResponse): void {
  const hookPath = path.join(ROOT, 'hook-forward.sh');

  let hookExecutable = false;
  try {
    fs.accessSync(hookPath, fs.constants.X_OK);
    hookExecutable = true;
  } catch {}

  let settingsFound = false;
  const registered: string[] = [];
  // a hook-forward.sh registered from a different folder (e.g. an old clone path)
  let otherPath = false;
  try {
    const raw = fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8');
    settingsFound = true;
    const hooks = (JSON.parse(raw) || {}).hooks || {};
    for (const ev of HOOK_EVENTS) {
      const matchers = Array.isArray(hooks[ev]) ? hooks[ev] : [];
      const cmds: string[] = [];
      for (const m of matchers) {
        const hs = m?.hooks;
        if (Array.isArray(hs)) for (const h of hs) cmds.push(String(h?.command || ''));
      }
      if (cmds.some((c) => c.includes(hookPath))) registered.push(ev);
      else if (cmds.some((c) => c.includes('hook-forward.sh'))) {
        registered.push(ev);
        otherPath = true;
      }
    }
  } catch {}

  let eventCount = 0;
  try {
    eventCount = countEvents();
  } catch {}

  sendJson(res, 200, {
    root: ROOT,
    hookPath,
    hookExecutable,
    settingsFound,
    registered,
    missing: HOOK_EVENTS.filter((e) => !registered.includes(e)),
    otherPath,
    eventCount,
  });
}
