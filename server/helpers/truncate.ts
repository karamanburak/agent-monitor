import { MAX_FIELD_CHARS } from '../config';

// Cap long string values anywhere inside an event; only strings are shortened, so flags (is_error) survive.
export function truncateStrings(v: any, depth = 0): any {
  if (typeof v === 'string')
    return v.length > MAX_FIELD_CHARS
      ? v.slice(0, MAX_FIELD_CHARS) + '… (+' + (v.length - MAX_FIELD_CHARS) + ' chars truncated)'
      : v;
  if (v === null || typeof v !== 'object' || depth > 6) return v;
  if (Array.isArray(v)) return v.map((x) => truncateStrings(x, depth + 1));
  const out: Record<string, any> = {};
  for (const k of Object.keys(v)) out[k] = truncateStrings(v[k], depth + 1);
  return out;
}
