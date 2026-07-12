import type { ToolResponse } from './types';

export function esc(s: unknown): string {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }) as Record<string, string>)[c],
  );
}

export function hashStr(s: unknown): number {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function basename(p?: string): string {
  if (!p) return '?';
  const parts = String(p).split('/').filter(Boolean);
  return parts[parts.length - 1] || p;
}

export function rel(ts: number): string {
  const d = Math.max(0, Date.now() - ts) / 1000;
  if (d < 5) return 'now';
  if (d < 60) return Math.floor(d) + 's';
  if (d < 3600) return Math.floor(d / 60) + 'm';
  return Math.floor(d / 3600) + 'h';
}

export function fmtDur(ms: number): string {
  if (ms < 9500) return (ms / 1000).toFixed(1).replace(/\.0$/, '') + 's';
  const s = Math.round(ms / 1000);
  return s < 90 ? s + 's' : Math.round(s / 60) + 'm';
}

export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour12: false });
}

export function stamp(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

// KEEP IN SYNC with modelFamily() in server.ts.
export function shortModel(m?: string): string {
  const raw = String(m || '');
  if (!raw) return '';
  const mm = raw.replace(/\[[^\]]*\]/g, '').toLowerCase();
  const mt = mm.match(/(opus|sonnet|haiku|fable)(?:[-_ ]?(\d+)(?:[-_.](\d+))?)?/);
  if (mt) {
    const fam = mt[1][0].toUpperCase() + mt[1].slice(1);
    return mt[2] ? fam + ' ' + (mt[3] ? mt[2] + '.' + mt[3] : mt[2]) : fam;
  }
  return raw
    .replace(/^claude-/, '')
    .replace(/-\d{6,}$/, '')
    .slice(0, 18);
}

export const PERM_LABEL: Record<string, [string, string]> = {
  acceptEdits: ['accept edits', 'warn'],
  plan: ['plan mode', 'warn'],
  bypassPermissions: ['bypass perms', 'danger'],
  dangerouslySkipPermissions: ['skip perms', 'danger'],
};

export function toolDetail(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const o = input as Record<string, unknown>;
  const keys = ['file_path', 'command', 'pattern', 'query', 'path', 'url', 'description', 'prompt', 'skill'];
  for (const k of keys) if (typeof o[k] === 'string' && (o[k] as string).trim()) return (o[k] as string).slice(0, 500);
  for (const v of Object.values(o)) if (typeof v === 'string' && v.trim()) return v.slice(0, 500);
  return '';
}

export function clipVal(v: unknown, max = 6000): string {
  if (v === null || v === undefined || v === '') return '';
  let s: string;
  if (typeof v === 'string') s = v;
  else {
    try {
      s = JSON.stringify(v, null, 2);
    } catch {
      s = String(v);
    }
  }
  return s.length > max ? s.slice(0, max) + '\n… (' + (s.length - max) + ' more chars)' : s;
}

export function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  if (n < 1e9) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  return (n / 1e9).toFixed(2).replace(/\.00$/, '') + 'B';
}

export function fmtMoney(n: number): string {
  n = n || 0;
  if (n === 0) return '$0';
  if (n < 0.01) return '<$0.01';
  if (n < 1000) return '$' + n.toFixed(2);
  if (n < 1e6) return '$' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return '$' + (n / 1e6).toFixed(2).replace(/\.00$/, '') + 'M';
}

export function nowActivity(name?: string): { kind: string; verb: string } {
  const n = String(name || '');
  if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(n)) return { kind: 'code', verb: 'Writing code' };
  if (n === 'Bash') return { kind: 'shell', verb: 'Running command' };
  if (/^(Read|NotebookRead)$/.test(n)) return { kind: 'read', verb: 'Reading' };
  if (/^(Grep|Glob|LS)$/.test(n)) return { kind: 'read', verb: 'Searching files' };
  if (/^(WebFetch|WebSearch)$/.test(n)) return { kind: 'read', verb: 'Searching the web' };
  if (/^(Task|Agent)$/.test(n)) return { kind: 'read', verb: 'Delegating' };
  return { kind: 'tool', verb: 'Working' };
}

export function extractEdits(name: string | undefined, input: unknown) {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, any>;
  const cap = (s: unknown) => String(s ?? '').slice(0, 4000);
  const n = String(name || '');
  if (n === 'Edit' && (o.old_string != null || o.new_string != null))
    return [{ file: o.file_path, old: cap(o.old_string), new: cap(o.new_string) }];
  if (n === 'MultiEdit' && Array.isArray(o.edits))
    return o.edits
      .slice(0, 20)
      .map((ed: any) => ({ file: o.file_path, old: cap(ed.old_string), new: cap(ed.new_string) }));
  if ((n === 'Write' || n === 'NotebookEdit') && (o.content != null || o.new_source != null))
    return [{ file: o.file_path || o.notebook_path, old: '', new: cap(o.content ?? o.new_source) }];
  return null;
}

export function lineDiff(oldS: string, newS: string): { t: 'ctx' | 'del' | 'add'; s: string }[] {
  const a = String(oldS).split('\n');
  const b = String(newS).split('\n');
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let sa = a.length;
  let sb = b.length;
  while (sa > p && sb > p && a[sa - 1] === b[sb - 1]) {
    sa--;
    sb--;
  }
  const rows: { t: 'ctx' | 'del' | 'add'; s: string }[] = [];
  for (let i = 0; i < p; i++) rows.push({ t: 'ctx', s: a[i] });
  for (let i = p; i < sa; i++) rows.push({ t: 'del', s: a[i] });
  for (let i = p; i < sb; i++) rows.push({ t: 'add', s: b[i] });
  for (let i = sa; i < a.length; i++) rows.push({ t: 'ctx', s: a[i] });
  return rows;
}

// Claude Code never emits "PostToolUseFailure"; failure is inferred from the PostToolUse payload.
export function isToolFailure(e: { hook_event_name?: string; tool_response?: ToolResponse | null }): boolean {
  if (e.hook_event_name === 'PostToolUseFailure') return true;
  const r = e.tool_response;
  if (!r || typeof r !== 'object') return false;
  if (r.is_error === true || r.success === false || (typeof r.error === 'string' && r.error.trim())) return true;
  if (typeof r.status === 'string' && /error|fail|cancel|abort/i.test(r.status)) return true;
  const hasErr = typeof r.stderr === 'string' && r.stderr.trim();
  const hasOut = typeof r.stdout === 'string' && r.stdout.trim();
  if (hasErr && !hasOut && r.noOutputExpected !== true && r.interrupted !== true) return true;
  return false;
}
