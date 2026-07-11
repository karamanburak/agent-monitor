// Local SQLite event store (bun:sqlite). Hybrid schema: fields we filter/sort on
// are typed columns; the full event JSON lives in `payload`, preserving the loose event shape.
import { Database } from 'bun:sqlite';
import { DB_FILE, RETENTION_DAYS } from '../config';
import type { Event } from '../types';

const db = new Database(DB_FILE, { create: true });
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY,
    received_at INTEGER NOT NULL,
    session_id  TEXT,
    hook_event  TEXT,
    cwd         TEXT,
    tool_name   TEXT,
    payload     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, received_at);
  CREATE INDEX IF NOT EXISTS idx_events_time    ON events(received_at);
`);

const insertStmt = db.prepare(
  'INSERT INTO events (received_at, session_id, hook_event, cwd, tool_name, payload) VALUES (?, ?, ?, ?, ?, ?)',
);

export function insertEvent(event: Event): void {
  insertStmt.run(
    event.received_at ?? 0,
    event.session_id ?? null,
    event.hook_event_name ?? null,
    event.cwd ?? null,
    event.tool_name ?? null,
    JSON.stringify(event),
  );
}

export function pruneOldEvents(): void {
  if (!(RETENTION_DAYS > 0)) return;
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const info = db.query('DELETE FROM events WHERE received_at < ?').run(cutoff);
  if (info.changes > 0) {
    db.exec('VACUUM;');
    console.log(`claude-agent-monitor: pruned ${info.changes} events older than ${RETENTION_DAYS}d`);
  }
}

// Most recent `limit` events, oldest-first (boot replay order).
export function recentEvents(limit: number): Event[] {
  const rows = db.query('SELECT payload FROM events ORDER BY id DESC LIMIT ?').all(limit) as { payload: string }[];
  const out: Event[] = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    try {
      out.push(JSON.parse(rows[i].payload));
    } catch {}
  }
  return out;
}

export function recentSessionIds(limit: number): string[] {
  const rows = db
    .query(
      'SELECT session_id, MAX(received_at) AS mx FROM events WHERE session_id IS NOT NULL GROUP BY session_id ORDER BY mx DESC LIMIT ?',
    )
    .all(limit) as { session_id: string }[];
  return rows.map((r) => r.session_id);
}

export function eventsForSessions(ids: string[]): Event[] {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .query(`SELECT payload FROM events WHERE session_id IN (${placeholders}) ORDER BY received_at`)
    .all(...ids) as { payload: string }[];
  return parseRows(rows);
}

export function eventsForSession(id: string): Event[] {
  const rows = db.query('SELECT payload FROM events WHERE session_id = ? ORDER BY received_at').all(id) as {
    payload: string;
  }[];
  return parseRows(rows);
}

// Cheap signature that changes when new rows land, to invalidate History caches.
export function eventsSig(): string {
  const r = db.query('SELECT MAX(id) AS mx, COUNT(*) AS n FROM events').get() as {
    mx: number | null;
    n: number;
  };
  return `${r.mx ?? 0}:${r.n}`;
}

function parseRows(rows: { payload: string }[]): Event[] {
  const out: Event[] = [];
  for (const r of rows) {
    try {
      out.push(JSON.parse(r.payload));
    } catch {}
  }
  return out;
}
