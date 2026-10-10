import type {
  AnalystProviders,
  AnalystSettings,
  ExplainResponse,
  HistorySession,
  HookEvent,
  SearchSession,
  SessionAnalysis,
  SessionUsageEntry,
  SetupInfo,
  StatsDay,
  UsageResponse,
} from './types';

export async function getUsage(): Promise<UsageResponse> {
  return (await fetch('/usage')).json();
}

export async function getStats(): Promise<{ days: StatsDay[] }> {
  return (await fetch('/stats')).json();
}

export async function getSessionUsage(id: string): Promise<{ entries: SessionUsageEntry[] }> {
  return (await fetch('/usage/session?id=' + encodeURIComponent(id))).json();
}

export async function getHistory(): Promise<{ sessions: HistorySession[] }> {
  return (await fetch('/history')).json();
}

export async function getSessionEvents(id: string): Promise<{ events: HookEvent[] }> {
  return (await fetch('/session?id=' + encodeURIComponent(id))).json();
}

export async function searchHistory(q: string): Promise<{ sessions: SearchSession[]; total: number }> {
  return (await fetch('/search?q=' + encodeURIComponent(q))).json();
}

export async function getSetup(): Promise<SetupInfo> {
  return (await fetch('/setup')).json();
}

export async function getAnalysis(id: string): Promise<SessionAnalysis> {
  return (await fetch('/analysis?id=' + encodeURIComponent(id))).json();
}

export async function getAnalystProviders(refresh = false): Promise<AnalystProviders> {
  return (await fetch('/analysis/providers' + (refresh ? '?refresh=1' : ''))).json();
}

export async function saveAnalystSettings(
  patch: Partial<AnalystSettings>,
): Promise<{ ok: boolean; settings: AnalystSettings }> {
  const r = await fetch('/analysis/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return r.json();
}

export async function explainSession(id: string): Promise<ExplainResponse> {
  const r = await fetch('/analysis/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  return r.json();
}
