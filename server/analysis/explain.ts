// The optional LLM step: findings in, a validated and cited report out. Results are cached
// per session state + provider + model, so reopening a session does not call the model again.
import { REPORT_SCHEMA, SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import { checkAvailability, loadSettings, pickProvider, providerById } from './providers';
import type { ProviderId } from './providers/types';
import type { Analysis, ValidatedReport } from './types';
import { validateReport } from './validate';

export interface Explanation {
  provider: ProviderId;
  local: boolean;
  model: string;
  ms: number;
  report: ValidatedReport;
}

export class ExplainError extends Error {
  constructor(
    public reason: 'off' | 'unavailable' | 'consent' | 'failed',
    message: string,
  ) {
    super(message);
  }
}

const cache = new Map<string, Explanation>();
const MAX_CACHE = 200;

export async function explain(a: Analysis, requested?: ProviderId): Promise<Explanation> {
  const settings = loadSettings();
  const avail = await checkAvailability();
  const okMap = Object.fromEntries(Object.entries(avail).map(([k, v]) => [k, v.ok]));
  const id = requested ? (okMap[requested] ? requested : null) : pickProvider(settings, okMap);
  if (!id) {
    if (settings.provider === 'off' && !requested)
      throw new ExplainError('off', 'AI explanations are turned off in settings.');
    const wanted =
      requested || (settings.provider !== 'auto' && settings.provider !== 'off' ? settings.provider : null);
    throw new ExplainError(
      'unavailable',
      wanted
        ? `${providerById(wanted).label} is not available: ${avail[wanted].detail}.`
        : 'No LLM provider is available — log in to Claude Code, set ANTHROPIC_API_KEY, or start Ollama.',
    );
  }
  const provider = providerById(id);
  if (!provider.local && !settings.cloudConsent)
    throw new ExplainError('consent', `${provider.label} sends the findings to Anthropic. Allow it once to continue.`);

  const model = settings.models[id] || '';
  const key = `${a.sessionId}:${a.eventCount}:${id}:${model}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const t0 = Date.now();
  let raw: unknown;
  try {
    raw = await provider.complete({ system: SYSTEM_PROMPT, user: buildUserPrompt(a), schema: REPORT_SCHEMA, model });
  } catch (err) {
    throw new ExplainError('failed', `${provider.label} failed: ${(err as Error).message}`);
  }
  let report: ValidatedReport;
  try {
    report = validateReport(
      raw,
      a.findings.map((f) => f.id),
    );
  } catch (err) {
    throw new ExplainError('failed', `The reply could not be used: ${(err as Error).message}`);
  }
  const result: Explanation = {
    provider: id,
    local: provider.local,
    model: model || 'default',
    ms: Date.now() - t0,
    report,
  };
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}
