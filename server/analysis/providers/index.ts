// Provider registry, settings and the auto-pick rule. Auto prefers Claude (Claude Code login,
// then API key) and falls back to a local Ollama model; with none available the analyst still
// runs its detectors. Cloud providers stay locked until the user opts in once.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../config';
import { claudeApi } from './claudeApi';
import { claudeCode } from './claudeCode';
import { ollama } from './ollama';
import type { Availability, LLMProvider, ProviderId } from './types';

export const PROVIDERS: LLMProvider[] = [claudeCode, claudeApi, ollama];
export const AUTO_ORDER: ProviderId[] = ['claude-code', 'claude-api', 'ollama'];

export interface AnalystSettings {
  provider: 'auto' | 'off' | ProviderId;
  cloudConsent: boolean; // findings may be sent to Anthropic
  models: Partial<Record<ProviderId, string>>; // empty = provider default
}

export const DEFAULT_SETTINGS: AnalystSettings = { provider: 'auto', cloudConsent: false, models: {} };

const SETTINGS_FILE = process.env.AGENT_MONITOR_ANALYST_SETTINGS || path.join(ROOT, 'analyst-settings.json');

export function loadSettings(): AnalystSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    return sanitizeSettings(raw);
  } catch {
    return { ...DEFAULT_SETTINGS, models: {} };
  }
}

export function saveSettings(s: AnalystSettings): void {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2) + '\n');
}

const IDS = new Set<string>(AUTO_ORDER);

export function sanitizeSettings(raw: any, base: AnalystSettings = DEFAULT_SETTINGS): AnalystSettings {
  const provider =
    raw?.provider === 'auto' || raw?.provider === 'off' || IDS.has(raw?.provider) ? raw.provider : base.provider;
  const models: AnalystSettings['models'] = { ...base.models };
  if (raw?.models && typeof raw.models === 'object')
    for (const id of AUTO_ORDER) {
      const m = raw.models[id];
      if (typeof m === 'string' && /^[\w.:/-]{0,100}$/.test(m)) models[id] = m;
    }
  return {
    provider,
    cloudConsent: typeof raw?.cloudConsent === 'boolean' ? raw.cloudConsent : base.cloudConsent,
    models,
  };
}

// Pure so it can be unit-tested: which provider to use given what is available.
export function pickProvider(
  settings: AnalystSettings,
  available: Partial<Record<ProviderId, boolean>>,
): ProviderId | null {
  if (settings.provider === 'off') return null;
  if (settings.provider !== 'auto') return available[settings.provider] ? settings.provider : null;
  return AUTO_ORDER.find((id) => available[id]) ?? null;
}

export const providerById = (id: ProviderId): LLMProvider => PROVIDERS.find((p) => p.id === id)!;

// Availability checks spawn a process / hit a port, so cache them briefly.
let availCache: { at: number; value: Record<ProviderId, Availability> } | null = null;

export async function checkAvailability(force = false): Promise<Record<ProviderId, Availability>> {
  if (!force && availCache && Date.now() - availCache.at < 30_000) return availCache.value;
  const entries = await Promise.all(
    PROVIDERS.map(
      async (p) => [p.id, await p.available().catch(() => ({ ok: false, detail: 'check failed' }))] as const,
    ),
  );
  const value = Object.fromEntries(entries) as Record<ProviderId, Availability>;
  availCache = { at: Date.now(), value };
  return value;
}
