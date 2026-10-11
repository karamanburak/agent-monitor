// Uses the developer's own Claude Code login via headless `claude -p` — no API key needed.
// Runs with no tools, no saved session, from a temp dir (so no project CLAUDE.md leaks in),
// and with AGENT_MONITOR_SKIP set so hook-forward.sh does not record the analysis itself.
import { execFile } from 'node:child_process';
import os from 'node:os';
import { clip, redact } from '../redact';
import type { Availability, CompleteArgs, LLMProvider } from './types';

const TIMEOUT_MS = 180_000;

function run(args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile(
      'claude',
      args,
      {
        timeout,
        cwd: os.tmpdir(),
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, AGENT_MONITOR_SKIP: '1' },
      },
      (err, stdout, stderr) => (err ? reject(new Error(String(stderr || err.message).slice(0, 500))) : resolve(stdout)),
    ),
  );
}

type Message = Record<string, unknown>;

// Older CLI versions print one result object; newer ones print every message of the run as an
// array (init, assistant turns, …) with the final { type: "result" } message last.
export function resultMessage(parsed: unknown): Message {
  if (Array.isArray(parsed)) {
    const messages = parsed.filter((m): m is Message => Boolean(m) && typeof m === 'object').reverse();
    return (
      messages.find((m) => m.type === 'result') ?? messages.find((m) => 'structured_output' in m || 'result' in m) ?? {}
    );
  }
  return parsed && typeof parsed === 'object' ? (parsed as Message) : {};
}

export const claudeCode: LLMProvider = {
  id: 'claude-code',
  label: 'Claude Code (your login)',
  local: false,

  async available(): Promise<Availability> {
    try {
      const v = (await run(['--version'], 5000)).trim();
      return { ok: true, detail: v || 'claude CLI found' };
    } catch {
      return { ok: false, detail: '`claude` CLI not found on PATH' };
    }
  },

  async complete({ system, user, schema, model }: CompleteArgs): Promise<unknown> {
    const args = [
      '-p',
      user,
      '--system-prompt',
      system,
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(schema),
      '--tools',
      '',
      '--no-session-persistence',
    ];
    if (model) args.push('--model', model);
    const stdout = await run(args, TIMEOUT_MS);
    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new Error(`claude -p did not return JSON output: "${clip(redact(stdout.trim()), 200)}"`);
    }
    const out = resultMessage(parsed);
    if (out?.is_error) throw new Error(String(out.result || 'claude -p reported an error').slice(0, 500));
    // --json-schema puts the validated object in structured_output; fall back to the text result
    const reply = out.structured_output ?? out.result;
    if (reply && typeof reply === 'object') return reply;
    const text = String(reply ?? '');
    if (!text.includes('{')) {
      // say what came back instead, so a CLI or model change is diagnosable from the UI
      const keys = Object.keys(out).join(', ');
      throw new Error(
        `Claude Code returned no JSON (fields: ${keys}). Reply started with: "${clip(redact(text.trim()), 200) || '(empty)'}"`,
      );
    }
    return text;
  },
};
