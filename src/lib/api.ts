import type {
  HistorySession,
  HookEvent,
  SearchSession,
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
