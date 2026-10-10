// Gatekeeper between any LLM and the UI: parse whatever came back, keep only well-formed
// items that cite findings which really exist, and count what was thrown away.
import { redact } from './redact';
import type { LLMCitedItem, LLMRecommendation, ValidatedReport } from './types';

const KINDS = new Set(['claude_md', 'permission', 'skill', 'workflow']);
const MAX_TEXT = 600;

// Models sometimes wrap JSON in ``` fences or add a sentence around it.
export function extractJson(raw: unknown): unknown {
  if (raw && typeof raw === 'object') return raw;
  const s = String(raw ?? '').trim();
  try {
    return JSON.parse(s);
  } catch {}
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(s.slice(start, end + 1));
  throw new Error('LLM reply contained no JSON object');
}

const text = (v: unknown, max = MAX_TEXT): string => (typeof v === 'string' ? redact(v).trim().slice(0, max) : '');

function cited(v: unknown, known: Set<string>): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((id): id is string => typeof id === 'string' && known.has(id)))];
}

export function validateReport(raw: unknown, findingIds: string[]): ValidatedReport {
  const obj = extractJson(raw) as Record<string, unknown>;
  if (!obj || typeof obj !== 'object') throw new Error('LLM reply is not an object');
  const known = new Set(findingIds);
  let dropped = 0;

  const rootCauses: LLMCitedItem[] = [];
  for (const item of Array.isArray(obj.rootCauses) ? obj.rootCauses : []) {
    const t = text(item?.text);
    const ids = cited(item?.findingIds, known);
    if (t && ids.length) rootCauses.push({ text: t, findingIds: ids });
    else dropped++;
  }

  const recommendations: LLMRecommendation[] = [];
  for (const item of Array.isArray(obj.recommendations) ? obj.recommendations : []) {
    const t = text(item?.text);
    const ids = cited(item?.findingIds, known);
    if (!t || !ids.length) {
      dropped++;
      continue;
    }
    const snippet = text(item?.snippet, 1200);
    recommendations.push({
      kind: KINDS.has(item?.kind) ? item.kind : 'workflow',
      text: t,
      findingIds: ids,
      ...(snippet ? { snippet } : {}),
    });
  }

  return {
    summary: text(obj.summary) || 'No summary returned.',
    rootCauses: rootCauses.slice(0, 3),
    recommendations: recommendations.slice(0, 4),
    dropped,
  };
}
