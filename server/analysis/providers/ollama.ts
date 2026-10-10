// A local model through Ollama — the only provider where nothing leaves the machine.
// Ollama's `format` accepts a JSON schema and constrains decoding to it.
import type { Availability, CompleteArgs, LLMProvider } from './types';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const TIMEOUT_MS = 300_000; // small machines can be slow on the first (cold) call

async function installedModels(): Promise<string[]> {
  const r = await fetch(OLLAMA_URL + '/api/tags', { signal: AbortSignal.timeout(2000) });
  if (!r.ok) throw new Error(`Ollama answered ${r.status}`);
  const j = (await r.json()) as { models?: { name: string }[] };
  return (j.models || []).map((m) => m.name);
}

export const ollama: LLMProvider = {
  id: 'ollama',
  label: 'Ollama (local)',
  local: true,

  async available(): Promise<Availability> {
    try {
      const models = await installedModels();
      return models.length
        ? { ok: true, detail: `${models.length} model${models.length === 1 ? '' : 's'} installed`, models }
        : { ok: false, detail: 'Ollama is running but has no models — try `ollama pull qwen3:4b`', models };
    } catch {
      return { ok: false, detail: `Ollama not reachable at ${OLLAMA_URL}` };
    }
  },

  async complete({ system, user, schema, model }: CompleteArgs): Promise<unknown> {
    const name = model || (await installedModels())[0];
    if (!name) throw new Error('No Ollama model installed.');
    const r = await fetch(OLLAMA_URL + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: name,
        stream: false,
        format: schema,
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!r.ok) throw new Error(`Ollama answered ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = (await r.json()) as { message?: { content?: string } };
    return j.message?.content ?? '';
  },
};
