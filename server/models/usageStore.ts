// Token usage aggregated from local transcripts under ~/.claude/projects/**/*.jsonl.
// Deduped by message id so resumed sessions are not double counted.
import fs from 'node:fs';
import path from 'node:path';
import { PROJECTS_DIR, SCAN_EVERY_MS } from '../config';
import { costOf, dateKey, modelFamily } from '../helpers/pricing';
import type { Usage } from '../types';

const usageByMsg = new Map<string, Usage>();
const fileState = new Map<string, { offset: number }>(); // file → incremental read offset
let lastUsageScan = 0;

export const getLastScan = () => lastUsageScan;

function listJsonlFiles(dir: string, out: string[]): string[] {
  let ents: fs.Dirent[];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of ents) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) listJsonlFiles(p, out);
    else if (ent.isFile() && ent.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

// <proj>/<session_id>.jsonl (main) or <proj>/<session_id>/subagents/agent-*.jsonl
function sessionIdForFile(f: string): string | null {
  const rel = path.relative(PROJECTS_DIR, f).split(path.sep);
  if (rel.length < 2) return null;
  return rel[1].endsWith('.jsonl') ? rel[1].slice(0, -6) : rel[1];
}

function ingestUsageLine(line: string, sid: string | null): void {
  if (!line) return;
  let obj: any;
  try {
    obj = JSON.parse(line);
  } catch {
    return;
  }
  const msg = obj?.message;
  const u = msg?.usage;
  if (!u || !obj.timestamp) return;
  const id = msg.id || obj.uuid;
  if (!id) return;
  const t = new Date(obj.timestamp);
  if (Number.isNaN(t.getTime())) return;
  usageByMsg.set(id, {
    d: dateKey(t),
    ts: t.getTime(),
    sid,
    m: msg.model || '',
    in: u.input_tokens || 0,
    out: u.output_tokens || 0,
    cc: u.cache_creation_input_tokens || 0,
    cr: u.cache_read_input_tokens || 0,
  });
}

function scanUsage(): void {
  for (const f of listJsonlFiles(PROJECTS_DIR, [])) {
    let st: fs.Stats;
    try {
      st = fs.statSync(f);
    } catch {
      continue;
    }
    const prev = fileState.get(f) || { offset: 0 };
    const start = st.size < prev.offset ? 0 : prev.offset; // rewritten file → full re-read
    if (st.size === start) continue;
    let fd: number | undefined;
    try {
      fd = fs.openSync(f, 'r');
      const buf = Buffer.alloc(st.size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      let text = buf.toString('utf8');
      let consumed = buf.length;
      const lastNl = text.lastIndexOf('\n');
      if (lastNl === -1) {
        text = '';
        consumed = 0;
      } else if (lastNl !== text.length - 1) {
        text = text.slice(0, lastNl + 1);
        consumed = Buffer.byteLength(text);
      }
      const sid = sessionIdForFile(f);
      for (const line of text.split('\n')) ingestUsageLine(line.trim(), sid);
      fileState.set(f, { offset: start + consumed });
    } catch {
    } finally {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {}
      }
    }
  }
  pruneUsage();
}

// Keep the current calendar year AND the rolling 31-day window; drop the rest.
function pruneUsage(): void {
  const jan1 = new Date().getFullYear() * 10000 + 101;
  const floor = Math.min(jan1, dateKey(new Date(Date.now() - 31 * 864e5)));
  for (const [id, u] of usageByMsg) if (u.d < floor) usageByMsg.delete(id);
}

// Rescan at most once per SCAN_EVERY_MS; keep serving stale data on error.
export function freshUsage(): void {
  const now = Date.now();
  if (now - lastUsageScan > SCAN_EVERY_MS) {
    try {
      scanUsage();
    } catch {}
    lastUsageScan = now;
  }
}

export function aggregateUsage() {
  const now = new Date();
  const d7 = new Date(now);
  d7.setDate(now.getDate() - 6);
  const d30 = new Date(now);
  d30.setDate(now.getDate() - 29);
  const keys = { today: dateKey(now), week: dateKey(d7), month: dateKey(d30), year: now.getFullYear() * 10000 + 101 };
  const mk = () => ({ input: 0, output: 0, cache: 0, total: 0, cost: 0 });
  const res = { today: mk(), week: mk(), month: mk(), year: mk() };
  const add = (b: ReturnType<typeof mk>, u: Usage) => {
    b.input += u.in;
    b.output += u.out;
    b.cache += u.cc + u.cr;
    b.total += u.in + u.out + u.cc + u.cr;
    b.cost += costOf(u);
  };
  for (const u of usageByMsg.values()) {
    if (u.d >= keys.year) add(res.year, u);
    if (u.d >= keys.month) add(res.month, u);
    if (u.d >= keys.week) add(res.week, u);
    if (u.d === keys.today) add(res.today, u);
  }
  return res;
}

export function aggregateBySession() {
  const m: Record<string, { input: number; output: number; cache: number; cost: number; model: string }> = {};
  const modelTs: Record<string, number> = {}; // ts of the model we kept, per session
  for (const u of usageByMsg.values()) {
    if (!u.sid) continue;
    const b = m[u.sid] || (m[u.sid] = { input: 0, output: 0, cache: 0, cost: 0, model: '' });
    b.input += u.in;
    b.output += u.out;
    b.cache += u.cc + u.cr;
    b.cost += costOf(u);
    // Keep most recent model per session; the UI falls back to this when hook events omit it.
    if (u.m && u.ts >= (modelTs[u.sid] || 0)) {
      b.model = u.m;
      modelTs[u.sid] = u.ts;
    }
  }
  return m;
}

export function usageEntriesForSession(sid: string) {
  const out: { ts: number; in: number; out: number; cache: number; cost: number }[] = [];
  for (const u of usageByMsg.values()) {
    if (u.sid !== sid || !u.ts) continue;
    out.push({ ts: u.ts, in: u.in, out: u.out, cache: u.cc + u.cr, cost: costOf(u) });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

export function statsDays() {
  const byDay = new Map<number, any>();
  for (const u of usageByMsg.values()) {
    let r = byDay.get(u.d);
    if (!r) {
      r = { d: u.d, total: 0, msgs: 0, byModel: {}, sids: {}, hours: new Array(24).fill(0) };
      byDay.set(u.d, r);
    }
    const tok = u.in + u.out + u.cc + u.cr;
    r.total += tok;
    r.msgs += 1;
    if (u.sid) r.sids[u.sid] = 1;
    const fam = modelFamily(u.m);
    const bm = r.byModel[fam] || (r.byModel[fam] = { t: 0, in: 0, out: 0 });
    bm.t += tok;
    bm.in += u.in;
    bm.out += u.out;
    if (u.ts) r.hours[new Date(u.ts).getHours()] += tok;
  }
  return [...byDay.values()]
    .map((r) => ({
      d: r.d,
      total: r.total,
      msgs: r.msgs,
      byModel: r.byModel,
      sids: Object.keys(r.sids),
      hours: r.hours,
    }))
    .sort((a, b) => a.d - b.d);
}
