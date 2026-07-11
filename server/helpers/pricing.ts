import type { Usage } from '../types';

// List prices (USD per million tokens) — a local estimate, ignores discounts; edit to match your plan.
// cw = cache write (5m), cr = cache read.
export const PRICES: Record<string, { in: number; out: number; cw: number; cr: number }> = {
  opus: { in: 15, out: 75, cw: 18.75, cr: 1.5 },
  sonnet: { in: 3, out: 15, cw: 3.75, cr: 0.3 },
  haiku: { in: 1, out: 5, cw: 1.25, cr: 0.1 },
  default: { in: 3, out: 15, cw: 3.75, cr: 0.3 },
};

export function priceFor(model: string) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus')) return PRICES.opus;
  if (m.includes('sonnet')) return PRICES.sonnet;
  if (m.includes('haiku')) return PRICES.haiku;
  return PRICES.default;
}

export function costOf(u: Usage): number {
  const p = priceFor(u.m);
  return (u.in * p.in + u.out * p.out + u.cc * p.cw + u.cr * p.cr) / 1e6;
}

export function dateKey(dt: Date): number {
  return dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate();
}

// KEEP IN SYNC with shortModel() in src/lib/format.ts.
export function modelFamily(model: string): string {
  const raw = String(model || '');
  if (!raw) return 'Unknown';
  const m = raw.replace(/\[[^\]]*\]/g, '').toLowerCase();
  const mt = m.match(/(opus|sonnet|haiku|fable)(?:[-_ ]?(\d+)(?:[-_.](\d+))?)?/);
  if (mt) {
    const fam = mt[1][0].toUpperCase() + mt[1].slice(1);
    return mt[2] ? `${fam} ${mt[3] ? `${mt[2]}.${mt[3]}` : mt[2]}` : fam;
  }
  return (
    raw
      .replace(/^claude-/, '')
      .replace(/-\d{6,}$/, '')
      .slice(0, 18) || 'Unknown'
  );
}
