import type http from 'node:http';
import { getAnalysis, getProviders, postExplain, postSettings } from './controllers/analysisController';
import { postEvent, streamEvents } from './controllers/eventsController';
import { getHistory, getSession, searchHistory } from './controllers/historyController';
import { getSetup } from './controllers/setupController';
import { getTerminal, postTerminal } from './controllers/terminalController';
import { getSessionUsage, getStats, getUsage } from './controllers/usageController';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, u: URL) => void;

const ROUTES: Record<string, Handler> = {
  'GET /usage': getUsage,
  'GET /stats': getStats,
  'GET /usage/session': getSessionUsage,
  'GET /history': getHistory,
  'GET /session': getSession,
  'GET /search': searchHistory,
  'GET /setup': getSetup,
  'GET /events': streamEvents,
  'POST /event': postEvent,
  'GET /terminal': getTerminal,
  'POST /terminal': postTerminal,
  'GET /analysis': getAnalysis,
  'GET /analysis/providers': getProviders,
  'POST /analysis/settings': postSettings,
  'POST /analysis/explain': postExplain,
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
