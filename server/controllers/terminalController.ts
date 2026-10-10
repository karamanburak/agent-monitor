import type http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fromDashboard, readBody, sendJson } from '../helpers/http';
import { SUPPORTED, focusSession, installedApps, openTerminal, resolveApp } from '../helpers/terminal';
import { sessionPlace } from '../models/db';

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const ACTIONS = new Set(['focus', 'open', 'resume']);

export function getTerminal(_req: http.IncomingMessage, res: http.ServerResponse): void {
  sendJson(res, 200, { supported: SUPPORTED, apps: SUPPORTED ? installedApps() : [] });
}

// POST /terminal {id, action: focus|open|resume, app?} — only a session id goes in;
// the folder and terminal details are read from what that session recorded.
export function postTerminal(req: http.IncomingMessage, res: http.ServerResponse): void {
  // drives apps on the desktop, so only the dashboard itself may call it
  if (!fromDashboard(req)) {
    sendJson(res, 403, { ok: false });
    return;
  }
  readBody(req, 4096, async (body) => {
    let q: { id?: unknown; action?: unknown; app?: unknown } = {};
    try {
      q = JSON.parse(body);
    } catch {}
    const id = typeof q.id === 'string' ? q.id : '';
    const action = typeof q.action === 'string' ? q.action : '';
    if (!SESSION_ID.test(id) || !ACTIONS.has(action)) {
      sendJson(res, 400, { ok: false });
      return;
    }
    const place = sessionPlace(id);
    if (!place) {
      sendJson(res, 404, { ok: false });
      return;
    }
    try {
      if (action === 'focus') {
        sendJson(res, 200, await focusSession(place.term, place.cwd));
        return;
      }
      let cwd = place.cwd;
      if (!path.isAbsolute(cwd) || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
        sendJson(res, 200, { ok: false, reason: 'no-folder' });
        return;
      }
      cwd = fs.realpathSync(cwd);
      // only Claude Code sessions can be resumed; the id was validated above
      const cmd = action === 'resume' && place.source === 'claude' ? `claude --resume ${id}` : '';
      const app = resolveApp(typeof q.app === 'string' ? q.app : 'auto', place.term);
      sendJson(res, 200, await openTerminal(app, cwd, cmd));
    } catch {
      sendJson(res, 200, { ok: false, reason: 'failed' });
    }
  });
}
