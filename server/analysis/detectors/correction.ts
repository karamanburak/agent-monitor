// The human had to correct the agent ("no, …", "I said …"). Matched in English, German
// and Turkish; the first prompt of a session is never a correction.
import { clip } from '../redact';
import type { Detector } from '../types';
import { at, isPrompt } from './util';

const PATTERNS = [
  // English
  /^(no|nope|wrong|stop|undo|revert|that'?s (not|wrong)|not (what|like that)|don'?t|why did you)\b/i,
  /\b(i (said|told you|asked for)|you were supposed to|not what i asked)\b/i,
  // German
  /^(nein|falsch|stopp|halt|nicht so|mach das rückgängig|warum hast du)\b/i,
  /\b(ich (habe|hab) (doch )?gesagt|das (ist|war) falsch|nicht das,? was ich)\b/i,
  // Turkish (with and without diacritics)
  /^(hayır|hayir|yanlış|yanlis|dur|olmadı|olmadi|öyle değil|oyle degil|geri al)(\s|[.,!]|$)/i,
  /(dedim|söyledim|soyledim|demiştim|demistim|istemedim|bunu değil|bunu degil)(\s|[.,!]|$)/i,
];

export const isCorrection = (text: string): boolean => {
  const t = text.trim();
  return t.length > 0 && t.length < 2000 && PATTERNS.some((re) => re.test(t));
};

export const detectCorrections: Detector = (events) => {
  const prompts = events.filter(isPrompt).slice(1);
  const hits = prompts.filter((e) => isCorrection(String(e.prompt || '')));
  if (!hits.length) return [];
  return [
    {
      detector: 'correction',
      severity: hits.length >= 4 ? 'high' : hits.length >= 2 ? 'warn' : 'info',
      title: `You corrected the agent ${hits.length}×`,
      detail: 'Corrections that repeat across sessions usually point at a preference the agent never got written down.',
      count: hits.length,
      evidence: hits.slice(0, 3).map((e) => ({ at: at(e), text: clip(e.prompt, 140) })),
      suggestion: 'Turn the recurring correction into one rule in CLAUDE.md so the next session starts with it.',
    },
  ];
};
