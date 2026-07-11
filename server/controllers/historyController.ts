import type http from 'node:http';
import { sendJson } from '../helpers/http';
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
