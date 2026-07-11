import type http from 'node:http';
import { postEvent, streamEvents } from './controllers/eventsController';
import { getHistory, getSession } from './controllers/historyController';
import { getSessionUsage, getStats, getUsage } from './controllers/usageController';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, u: URL) => void;

const ROUTES: Record<string, Handler> = {
  'GET /usage': getUsage,
  'GET /stats': getStats,
  'GET /usage/session': getSessionUsage,
  'GET /history': getHistory,
  'GET /session': getSession,
  'GET /events': streamEvents,
  'POST /event': postEvent,
};

export function route(req: http.IncomingMessage, res: http.ServerResponse): void {
  // Malformed targets (e.g. "//") make `new URL` throw; an unguarded throw here would crash the daemon.
  let u: URL;
  try {
    u = new URL(req.url || '/', 'http://localhost');
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  const handler = ROUTES[`${req.method} ${u.pathname}`];
  if (handler) handler(req, res, u);
  else {
    res.writeHead(404);
    res.end();
  }
}
