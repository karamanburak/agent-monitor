import type http from 'node:http';
import { analyzeSession } from '../analysis/analyze';
import { ExplainError, explain } from '../analysis/explain';
import {
  AUTO_ORDER,
  PROVIDERS,
  checkAvailability,
  loadSettings,
  pickProvider,
  sanitizeSettings,
  saveSettings,
} from '../analysis/providers';
import type { ProviderId } from '../analysis/providers/types';
import { fromDashboard, readBody, sendJson } from '../helpers/http';
import { eventsForSession } from '../models/db';
import { idParam } from '../validations/requests';

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;

// GET /analysis?id= — rule-based findings; pure and fast, never calls an LLM.
export function getAnalysis(_req: http.IncomingMessage, res: http.ServerResponse, u: URL): void {
  const id = idParam(u);
  if (!SESSION_ID.test(id)) {
    sendJson(res, 400, { error: 'bad id' });
    return;
  }
  try {
    sendJson(res, 200, analyzeSession(id, eventsForSession(id)));
  } catch {
    sendJson(res, 500, { error: 'analysis failed' });
  }
}

// GET /analysis/providers — what is installed, what auto would pick, current settings.
export async function getProviders(_req: http.IncomingMessage, res: http.ServerResponse, u: URL): Promise<void> {
  const settings = loadSettings();
  const avail = await checkAvailability(u.searchParams.get('refresh') === '1');
  const okMap = Object.fromEntries(Object.entries(avail).map(([k, v]) => [k, v.ok]));
  sendJson(res, 200, {
    settings,
    picked: pickProvider(settings, okMap),
    providers: PROVIDERS.map((p) => ({ id: p.id, label: p.label, local: p.local, ...avail[p.id] })),
  });
}

// POST /analysis/settings {provider?, cloudConsent?, models?} — partial update.
export function postSettings(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (!fromDashboard(req)) {
    sendJson(res, 403, { ok: false });
    return;
  }
  readBody(req, 4096, (body) => {
    let raw: unknown = {};
    try {
      raw = JSON.parse(body);
    } catch {}
    const next = sanitizeSettings(raw, loadSettings());
    try {
      saveSettings(next);
      sendJson(res, 200, { ok: true, settings: next });
    } catch {
      sendJson(res, 500, { ok: false });
    }
  });
}

// POST /analysis/explain {id, provider?} — runs the LLM layer (may cost money / take a while).
export function postExplain(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (!fromDashboard(req)) {
    sendJson(res, 403, { ok: false });
    return;
  }
  readBody(req, 4096, async (body) => {
    let q: { id?: unknown; provider?: unknown } = {};
    try {
      q = JSON.parse(body);
    } catch {}
    const id = typeof q.id === 'string' ? q.id : '';
    if (!SESSION_ID.test(id)) {
      sendJson(res, 400, { ok: false, reason: 'bad-id' });
      return;
    }
    const requested = AUTO_ORDER.includes(q.provider as ProviderId) ? (q.provider as ProviderId) : undefined;
    try {
      const analysis = analyzeSession(id, eventsForSession(id));
      sendJson(res, 200, { ok: true, ...(await explain(analysis, requested)) });
    } catch (err) {
      if (err instanceof ExplainError) sendJson(res, 200, { ok: false, reason: err.reason, message: err.message });
      else sendJson(res, 500, { ok: false, reason: 'failed', message: 'Unexpected error' });
    }
  });
}
