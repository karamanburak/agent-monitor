import type http from 'node:http';
import { sendJson } from '../helpers/http';
import { searchEvents, type SearchHit } from '../models/db';
import { buildHistory, sessionEvents } from '../models/historyStore';
import { idParam } from '../validations/requests';
import type { Event } from '../types';

export function getHistory(_req: http.IncomingMessage, res: http.ServerResponse): void {
  let sessions: any[] = [];
  try {
    sessions = buildHistory();
  } catch {}
  sendJson(res, 200, { sessions });
}

export function getSession(_req: http.IncomingMessage, res: http.ServerResponse, u: URL): void {
  let events: Event[] = [];
  try {
    events = sessionEvents(idParam(u));
  } catch {}
  sendJson(res, 200, { events });
}

// Full-text search across all recorded events, grouped per session (newest match first).
export function searchHistory(_req: http.IncomingMessage, res: http.ServerResponse, u: URL): void {
  const q = (u.searchParams.get('q') || '').slice(0, 200);
  let hits: SearchHit[] = [];
  try {
    hits = searchEvents(q, 400);
  } catch {}
  const map = new Map<string, { id: string; cwd: string; lastMatch: number; hits: number; snips: string[] }>();
  for (const h of hits) {
    let s = map.get(h.session_id);
    if (!s) {
      s = { id: h.session_id, cwd: h.cwd || '', lastMatch: h.received_at, hits: 0, snips: [] };
      map.set(h.session_id, s);
    }
    if (h.cwd && !s.cwd) s.cwd = h.cwd;
    if (h.received_at > s.lastMatch) s.lastMatch = h.received_at;
    s.hits++;
    if (s.snips.length < 3 && h.snip) s.snips.push(h.snip.slice(0, 300));
  }
  const sessions = [...map.values()].sort((a, b) => b.lastMatch - a.lastMatch).slice(0, 50);
  sendJson(res, 200, { sessions, total: hits.length });
}
