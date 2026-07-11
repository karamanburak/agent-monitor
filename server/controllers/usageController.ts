import type http from 'node:http';
import { SCAN_EVERY_MS } from '../config';
import { sendJson } from '../helpers/http';
import {
  aggregateBySession,
  aggregateUsage,
  freshUsage,
  getLastScan,
  statsDays,
  usageEntriesForSession,
} from '../models/usageStore';
import { idParam } from '../validations/requests';

export function getUsage(_req: http.IncomingMessage, res: http.ServerResponse): void {
  freshUsage();
  sendJson(res, 200, {
    updated: getLastScan(),
    scanEveryMs: SCAN_EVERY_MS,
    ...aggregateUsage(),
    bySession: aggregateBySession(),
  });
}

export function getStats(_req: http.IncomingMessage, res: http.ServerResponse): void {
  freshUsage();
  sendJson(res, 200, { updated: getLastScan(), days: statsDays() });
}

export function getSessionUsage(_req: http.IncomingMessage, res: http.ServerResponse, u: URL): void {
  freshUsage();
  sendJson(res, 200, { updated: getLastScan(), entries: usageEntriesForSession(idParam(u)) });
}
