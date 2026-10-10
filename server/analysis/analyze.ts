// Runs every detector over one session's events and condenses the session into a small
// digest. Pure and synchronous: no LLM, no I/O — this part always works offline.
import { clip } from './redact';
import type { Event } from '../types';
import type { Analysis, Detector, Finding, SessionDigest, Severity } from './types';
import { detectCorrections } from './detectors/correction';
import { detectEditReverts } from './detectors/editRevert';
import { detectLoops } from './detectors/loop';
import { detectPermissionFriction } from './detectors/permission';
import { detectReadThrash } from './detectors/readThrash';
import { detectRetryStorms } from './detectors/retryStorm';
import { detectWaiting } from './detectors/waiting';
import { at, isFailure, isPre, isPrompt, kind } from './detectors/util';

export const DETECTORS: Detector[] = [
  detectLoops,
  detectEditReverts,
  detectRetryStorms,
  detectReadThrash,
  detectPermissionFriction,
  detectCorrections,
  detectWaiting,
];

const RANK: Record<Severity, number> = { high: 0, warn: 1, info: 2 };
const PENALTY: Record<Severity, number> = { high: 20, warn: 10, info: 3 };

export function digestOf(events: Event[]): SessionDigest {
  const tools = new Map<string, number>();
  let prompts = 0;
  let failed = 0;
  let subagents = 0;
  let firstPrompt = '';
  let lastResult = '';
  let cwd = '';
  for (const e of events) {
    if (e.cwd) cwd = e.cwd;
    if (isPre(e) && e.tool_name) tools.set(e.tool_name, (tools.get(e.tool_name) || 0) + 1);
    if (isFailure(e)) failed++;
    if (kind(e) === 'subagentstart') subagents++;
    if (isPrompt(e)) {
      prompts++;
      if (!firstPrompt) firstPrompt = clip(e.prompt, 300);
    }
    if (kind(e) === 'stop' && e.last_assistant_message) lastResult = clip(e.last_assistant_message, 300);
  }
  return {
    project: cwd.split('/').filter(Boolean).pop() || '?',
    durationMs: events.length ? at(events[events.length - 1]) - at(events[0]) : 0,
    prompts,
    toolCalls: [...tools.values()].reduce((a, b) => a + b, 0),
    failedCalls: failed,
    subagents,
    topTools: [...tools.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tool, calls]) => ({ tool, calls })),
    firstPrompt,
    lastResult,
  };
}

export function analyzeSession(sessionId: string, events: Event[]): Analysis {
  const raw: Omit<Finding, 'id'>[] = [];
  for (const detect of DETECTORS) {
    try {
      raw.push(...detect(events));
    } catch (err) {
      console.warn('claude-agent-monitor: detector failed (skipped):', err);
    }
  }
  raw.sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.count - a.count);
  const perDetector = new Map<string, number>();
  const findings: Finding[] = raw.map((f) => {
    const n = (perDetector.get(f.detector) || 0) + 1;
    perDetector.set(f.detector, n);
    return { ...f, id: `${f.detector}-${n}` };
  });
  const health = Math.max(0, 100 - findings.reduce((s, f) => s + PENALTY[f.severity], 0));
  return { sessionId, eventCount: events.length, health, findings, digest: digestOf(events) };
}
