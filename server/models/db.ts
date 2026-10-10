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

// Full-text search over the human-readable parts of each event (prompts, tool
// details, notifications, results). FTS5 ships with bun:sqlite; if this build
// lacks it, search degrades to a plain LIKE scan over payloads.
let ftsReady = false;
try {
  db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(text)');
  ftsReady = true;
} catch {
  console.warn('claude-agent-monitor: SQLite FTS5 unavailable — history search falls back to a slower scan');
}

// The searchable text for one event, clipped so the index stays lean.
function searchText(event: Event): string {
  const parts: unknown[] = [
    event.prompt,
    event.tool_name,
    event.message,
    event.notification,
    event.last_assistant_message,
    event.cwd,
  ];
  const ti = event.tool_input;
  if (ti && typeof ti === 'object') {
    for (const k of ['file_path', 'path', 'command', 'description', 'pattern', 'query', 'url', 'prompt'])
      if (typeof (ti as Record<string, unknown>)[k] === 'string') parts.push((ti as Record<string, unknown>)[k]);
  } else if (typeof ti === 'string') parts.push(ti);
  return parts
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .join(' ')
    .slice(0, 4000);
}

const insertStmt = db.prepare(
  'INSERT INTO events (received_at, session_id, hook_event, cwd, tool_name, payload) VALUES (?, ?, ?, ?, ?, ?)',
);
const insertFtsStmt = ftsReady ? db.prepare('INSERT INTO events_fts (rowid, text) VALUES (?, ?)') : null;

export function insertEvent(event: Event): void {
  const info = insertStmt.run(
    event.received_at ?? 0,
    event.session_id ?? null,
    event.hook_event_name ?? null,
    event.cwd ?? null,
    event.tool_name ?? null,
    JSON.stringify(event),
  );
  if (insertFtsStmt) {
    const text = searchText(event);
    if (text)
      try {
        insertFtsStmt.run(info.lastInsertRowid as number, text);
      } catch {}
  }
}

// Index any events recorded before the FTS table existed (one-time, on boot).
if (ftsReady) {
  try {
    const missing = db.query('SELECT id, payload FROM events WHERE id NOT IN (SELECT rowid FROM events_fts)').all() as {
      id: number;
      payload: string;
    }[];
    if (missing.length) {
      const fill = db.transaction((rows: { id: number; payload: string }[]) => {
        for (const r of rows) {
          try {
            const text = searchText(JSON.parse(r.payload));
            insertFtsStmt?.run(r.id, text || '');
          } catch {}
        }
      });
      fill(missing);
      console.log(`claude-agent-monitor: indexed ${missing.length} events for full-text search`);
    }
  } catch (err) {
    console.warn('claude-agent-monitor: FTS backfill failed (search may be incomplete):', err);
  }
}

export function pruneOldEvents(): void {
  if (!(RETENTION_DAYS > 0)) return;
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const info = db.query('DELETE FROM events WHERE received_at < ?').run(cutoff);
  if (info.changes > 0) {
    if (ftsReady)
      try {
        db.query('DELETE FROM events_fts WHERE rowid NOT IN (SELECT id FROM events)').run();
      } catch {}
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

// Where a session ran: its project folder, the agent it came from and the terminal
// details hook-forward.sh attaches (tty / tmux pane / app) — for "Go to terminal".
export interface SessionPlace {
  cwd: string;
  source: string;
  term: Record<string, string> | null;
}

export function sessionPlace(id: string): SessionPlace | null {
  const c = db
    .query(
      "SELECT cwd, payload FROM events WHERE session_id = ? AND cwd IS NOT NULL AND cwd <> '' ORDER BY id DESC LIMIT 1",
    )
    .get(id) as { cwd: string; payload: string } | null;
  if (!c) return null;
  const t = db
    .query(
      `SELECT payload FROM events WHERE session_id = ?
         AND hook_event IN ('SessionStart', 'UserPromptSubmit', 'Notification') AND payload LIKE '%"term":{%'
       ORDER BY id DESC LIMIT 1`,
    )
    .get(id) as { payload: string } | null;
  let source = 'claude';
  let term: Record<string, string> | null = null;
  try {
    source = String(JSON.parse(c.payload).source || 'claude');
  } catch {}
  try {
    const raw = t ? JSON.parse(t.payload).term : null;
    if (raw && typeof raw === 'object')
      term = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v ?? '')]));
  } catch {}
  return { cwd: c.cwd, source, term };
}

export interface SearchHit {
  session_id: string;
  received_at: number;
  hook_event: string | null;
  cwd: string | null;
  snip: string;
}

// Escape each word as a quoted prefix token so user input can never break the
// FTS5 query syntax ("foo bar" → «"foo"* "bar"*», i.e. all words must prefix-match).
function ftsQuery(q: string): string {
  return q
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((t) => '"' + t.replace(/"/g, '') + '"*')
    .join(' ');
}

// Newest-first matches; snippets mark matched words with \x01…\x02 for the UI to highlight.
export function searchEvents(q: string, limit: number): SearchHit[] {
  const trimmed = q.trim();
  if (!trimmed) return [];
  if (ftsReady) {
    const match = ftsQuery(trimmed);
    if (!match) return [];
    try {
      return db
        .query(
          `SELECT e.session_id, e.received_at, e.hook_event, e.cwd,
                  snippet(events_fts, 0, char(1), char(2), '…', 14) AS snip
           FROM events_fts JOIN events e ON e.id = events_fts.rowid
           WHERE events_fts MATCH ? AND e.session_id IS NOT NULL
           ORDER BY e.received_at DESC LIMIT ?`,
        )
        .all(match, limit) as SearchHit[];
    } catch {
      return [];
    }
  }
  // no FTS5 in this SQLite build: slower LIKE scan over raw payloads, no snippets
  const rows = db
    .query(
      `SELECT session_id, received_at, hook_event, cwd, '' AS snip
       FROM events WHERE session_id IS NOT NULL AND payload LIKE ? ESCAPE '\\'
       ORDER BY received_at DESC LIMIT ?`,
    )
    .all('%' + trimmed.replace(/[\\%_]/g, (c) => '\\' + c) + '%', limit) as SearchHit[];
  return rows;
}

export function countEvents(): number {
  const r = db.query('SELECT COUNT(*) AS n FROM events').get() as { n: number };
  return r.n;
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
