// Uses the developer's own Claude Code login via headless `claude -p` — no API key needed.
// Runs with no tools, no saved session, from a temp dir (so no project CLAUDE.md leaks in),
// and with AGENT_MONITOR_SKIP set so hook-forward.sh does not record the analysis itself.
import { execFile } from 'node:child_process';
import os from 'node:os';
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
    const out = JSON.parse(await run(args, TIMEOUT_MS));
    if (out?.is_error) throw new Error(String(out.result || 'claude -p reported an error').slice(0, 500));
    // --json-schema puts the validated object in structured_output; fall back to the text result
    return out?.structured_output ?? out?.result;
  },
};
