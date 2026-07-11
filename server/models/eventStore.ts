import type http from 'node:http';
import { HISTORY_LIMIT, MAX_FIELD_CHARS } from '../config';
import { truncateStrings } from '../helpers/truncate';
import { insertEvent, recentEvents } from './db';
import type { Event } from '../types';

const history: Event[] = [];
const clients = new Set<http.ServerResponse>();

function broadcast(event: Event): void {
  const frame = `data: ${JSON.stringify(event)}\n\n`;
  // Guard each write: a socket destroyed before its 'close' handler fires throws, and unguarded would crash the daemon.
  for (const res of clients) {
    try {
      res.write(frame);
    } catch {
      clients.delete(res);
    }
  }
}

export function handleEvent(raw: string): void {
  let event: Event;
  try {
    event = JSON.parse(raw);
  } catch {
    event = { hook_event_name: 'Unparsed', raw: String(raw).slice(0, 2000) };
  }
  event.received_at = Date.now();
  if (event.tool_input) event.tool_input = truncateStrings(event.tool_input);
  if (event.tool_response) event.tool_response = truncateStrings(event.tool_response);
  if (event.tool_output) event.tool_output = truncateStrings(event.tool_output); // Cursor
  if (event.last_assistant_message) event.last_assistant_message = truncateStrings(event.last_assistant_message);
  if (typeof event.prompt === 'string' && event.prompt.length > MAX_FIELD_CHARS)
    event.prompt = event.prompt.slice(0, MAX_FIELD_CHARS);
  history.push(event);
  if (history.length > HISTORY_LIMIT) history.shift();
  // Persistence is best-effort: a SQLite error must not crash the daemon or block the live broadcast.
  try {
    insertEvent(event);
  } catch (err) {
    console.error('claude-agent-monitor: insertEvent failed (event still broadcast):', err);
  }
  broadcast(event);
}

// Reload recent events on startup so a restart still shows history.
function loadHistoryFromDb(): void {
  for (const e of recentEvents(HISTORY_LIMIT)) {
    history.push(e);
  }
}
loadHistoryFromDb();

export const getHistorySnapshot = (): Event[] => history;
export const addClient = (res: http.ServerResponse) => clients.add(res);
export const removeClient = (res: http.ServerResponse) => clients.delete(res);
