import type http from 'node:http';
import { readBody } from '../helpers/http';
import { addClient, getHistorySnapshot, handleEvent, removeClient } from '../models/eventStore';
import { EVENT_BODY_LIMIT } from '../validations/requests';

export function postEvent(req: http.IncomingMessage, res: http.ServerResponse): void {
  readBody(req, EVENT_BODY_LIMIT, (body) => {
    handleEvent(body);
    res.writeHead(204);
    res.end();
  });
}

// SSE stream: a __history__ snapshot first, then live events.
export function streamEvents(req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(`data: ${JSON.stringify({ hook_event_name: '__history__', events: getHistorySnapshot() })}\n\n`);
  addClient(res);
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* client vanished; 'close'/'error' will clean up */
    }
  }, 25000);
  const cleanup = () => {
    clearInterval(heartbeat);
    removeClient(res);
  };
  req.on('close', cleanup);
  res.on('error', cleanup);
}
