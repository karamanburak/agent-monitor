// Shared shapes for the Session Analyst: rule-based findings first, an optional LLM
// layer second. Findings are the single source of truth — every LLM claim must cite one.
import type { Event } from '../types';

export type Severity = 'info' | 'warn' | 'high';

export type DetectorId =
  | 'loop'
  | 'edit-revert'
  | 'retry-storm'
  | 'read-thrash'
  | 'waiting'
  | 'permission'
  | 'correction';

// One concrete moment in the session that backs a finding (the UI can jump to it).
export interface Evidence {
  at: number; // received_at of the event
  tool?: string;
  text: string; // short, redacted, human-readable
}

export interface Finding {
  id: string; // stable within one analysis: "<detector>-<n>"
  detector: DetectorId;
  severity: Severity;
  title: string;
  detail: string;
  count: number;
  evidence: Evidence[];
  suggestion?: string; // ready-to-paste fix (permission rule, CLAUDE.md line, …)
}

export type Detector = (events: Event[]) => Omit<Finding, 'id'>[];

export interface SessionDigest {
  project: string;
  durationMs: number;
  prompts: number;
  toolCalls: number;
  failedCalls: number;
  subagents: number;
  topTools: { tool: string; calls: number }[];
  firstPrompt: string;
  lastResult: string;
}

export interface Analysis {
  sessionId: string;
  eventCount: number;
  health: number; // 0–100, 100 = nothing found
  findings: Finding[];
  digest: SessionDigest;
}

// What the LLM must return (validated against the findings before it reaches the UI).
export interface LLMCitedItem {
  text: string;
  findingIds: string[];
}

export interface LLMRecommendation extends LLMCitedItem {
  kind: 'claude_md' | 'permission' | 'skill' | 'workflow';
  snippet?: string;
}

export interface LLMReport {
  summary: string;
  rootCauses: LLMCitedItem[];
  recommendations: LLMRecommendation[];
}

export interface ValidatedReport extends LLMReport {
  dropped: number; // items removed because they cited nothing or an unknown finding
}
