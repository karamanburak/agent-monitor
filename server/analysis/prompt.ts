// What the LLM sees and must return. The input is the detectors' findings plus a small
// digest — never raw events — so even a 4B local model gets a short, clean prompt.
import type { Analysis } from './types';

export const SYSTEM_PROMPT = `You review one session of an AI coding agent (Claude Code) for the developer who ran it.
You receive rule-based findings that were already detected and verified, plus a short digest of the session.

Rules:
- Use only the findings and digest. Do not invent events, files, commands or numbers.
- Every root cause and every recommendation must cite the ids of the findings it is based on in "findingIds".
- Give at most 3 root causes and at most 4 recommendations, most useful first. Fewer is fine.
- Recommendations must be concrete and actionable. Use kind:
  "claude_md" for a line to add to CLAUDE.md (put the exact line in "snippet"),
  "permission" for a settings allow rule (put the JSON fragment in "snippet"),
  "skill" for a reusable skill or slash command worth writing,
  "workflow" for a change in how the developer prompts or works.
- The summary is 1–2 plain sentences about how the session went and the biggest source of friction.
- If there are no findings, say the session looks healthy and return empty arrays.
- Reply with JSON only, matching the schema.`;

export const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    rootCauses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          findingIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['text', 'findingIds'],
        additionalProperties: false,
      },
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['claude_md', 'permission', 'skill', 'workflow'] },
          text: { type: 'string' },
          snippet: { type: 'string' },
          findingIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['kind', 'text', 'findingIds'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'rootCauses', 'recommendations'],
  additionalProperties: false,
} as const;

// Everything in here is already redacted by the detectors and the digest builder.
export function buildUserPrompt(a: Analysis): string {
  const findings = a.findings.map((f) => ({
    id: f.id,
    severity: f.severity,
    title: f.title,
    detail: f.detail,
    count: f.count,
    examples: f.evidence.map((e) => e.text),
    ...(f.suggestion ? { suggestion: f.suggestion } : {}),
  }));
  return JSON.stringify({ digest: a.digest, health: a.health, findings }, null, 2);
}
