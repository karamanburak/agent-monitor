// Unit tests for the Session Analyst. The detectors, redaction, the LLM-reply validator and
// the provider pick rule are all pure, so synthetic hook-event sequences pin their behaviour.
//
//   bun test

import { beforeEach, describe, expect, test } from 'bun:test';
import { analyzeSession } from '../server/analysis/analyze';
import { detectCorrections, isCorrection } from '../server/analysis/detectors/correction';
import { detectEditReverts } from '../server/analysis/detectors/editRevert';
import { detectLoops } from '../server/analysis/detectors/loop';
import { detectPermissionFriction } from '../server/analysis/detectors/permission';
import { detectReadThrash } from '../server/analysis/detectors/readThrash';
import { detectRetryStorms } from '../server/analysis/detectors/retryStorm';
import { commandPrefix } from '../server/analysis/detectors/util';
import { detectWaiting } from '../server/analysis/detectors/waiting';
import { buildUserPrompt } from '../server/analysis/prompt';
import { DEFAULT_SETTINGS, pickProvider, sanitizeSettings } from '../server/analysis/providers';
import { redact } from '../server/analysis/redact';
import { validateReport } from '../server/analysis/validate';
import type { Event } from '../server/types';

let t = 0;
let n = 0;
beforeEach(() => {
  t = 1_700_000_000_000;
  n = 0;
});
const ev = (name: string, extra: Record<string, unknown> = {}, gap = 1000): Event => {
  t += gap;
  return { hook_event_name: name, session_id: 's1', received_at: t, ...extra };
};
// a tool call and its result
function call(tool: string, input: Record<string, unknown>, result: 'ok' | 'fail' | 'none' = 'ok'): Event[] {
  const id = `tu-${++n}`;
  const pre = ev('PreToolUse', { tool_name: tool, tool_input: input, tool_use_id: id });
  if (result === 'none') return [pre];
  if (result === 'fail')
    return [pre, ev('PostToolUseFailure', { tool_name: tool, tool_input: input, tool_use_id: id, error: 'exit 1' })];
  return [pre, ev('PostToolUse', { tool_name: tool, tool_input: input, tool_use_id: id, tool_response: {} })];
}
const prompt = (text: string) => ev('UserPromptSubmit', { prompt: text });

describe('loop', () => {
  test('flags the same call repeated with nothing in between', () => {
    const events = [
      prompt('go'),
      ...call('Bash', { command: 'gh run view 1' }),
      ...call('Bash', { command: 'gh run view 1' }),
      ...call('Bash', { command: 'gh run view 1' }),
    ];
    const [f] = detectLoops(events);
    expect(f.count).toBe(3);
    expect(f.severity).toBe('warn');
  });

  test('an edit between runs breaks the chain (re-running tests is normal)', () => {
    const events = [
      ...call('Bash', { command: 'bun test' }),
      ...call('Edit', { file_path: '/a.ts', old_string: 'a', new_string: 'b' }),
      ...call('Bash', { command: 'bun test' }),
      ...call('Edit', { file_path: '/a.ts', old_string: 'b', new_string: 'c' }),
      ...call('Bash', { command: 'bun test' }),
    ];
    expect(detectLoops(events)).toEqual([]);
  });

  test('key order in the input does not matter', () => {
    const events = [1, 2, 3].flatMap((i) =>
      call('Grep', i % 2 ? { pattern: 'x', path: '/src' } : { path: '/src', pattern: 'x' }),
    );
    expect(detectLoops(events)[0]?.count).toBe(3);
  });
});

describe('edit-revert', () => {
  test('finds an edit that exactly undoes an earlier one', () => {
    const events = [
      ...call('Edit', { file_path: '/a.ts', old_string: 'foo', new_string: 'bar' }),
      ...call('Edit', { file_path: '/a.ts', old_string: 'bar', new_string: 'foo' }),
    ];
    const [f] = detectEditReverts(events);
    expect(f.detector).toBe('edit-revert');
    expect(f.count).toBe(1);
  });

  test('a different file is not a revert', () => {
    const events = [
      ...call('Edit', { file_path: '/a.ts', old_string: 'foo', new_string: 'bar' }),
      ...call('Edit', { file_path: '/b.ts', old_string: 'bar', new_string: 'foo' }),
    ];
    expect(detectEditReverts(events)).toEqual([]);
  });
});

describe('retry-storm', () => {
  test('groups failures by command prefix', () => {
    const events = [
      ...call('Bash', { command: 'bun test a' }, 'fail'),
      ...call('Bash', { command: 'cd x && bun test b' }, 'fail'),
      ...call('Bash', { command: 'bun test c' }, 'fail'),
    ];
    const [f] = detectRetryStorms(events);
    expect(f.title).toContain('bun test');
    expect(f.count).toBe(3);
  });

  test('a call that hit a permission prompt is not a failure', () => {
    const events: Event[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(...call('Bash', { command: 'docker exec x' }, 'none'));
      events.push(
        ev('Notification', { notification_type: 'permission_prompt', message: 'Claude needs your permission' }),
      );
    }
    events.push(ev('Stop', {}, 120_000));
    expect(detectRetryStorms(events)).toEqual([]);
  });

  test('an unanswered call counts once the session moved on', () => {
    const events = [1, 2, 3].flatMap(() => call('Bash', { command: 'make build' }, 'none'));
    events.push(ev('Stop', {}, 120_000));
    expect(detectRetryStorms(events)[0]?.count).toBe(3);
  });
});

describe('read-thrash', () => {
  test('counts re-reads of an unchanged file only', () => {
    const read = () => call('Read', { file_path: '/big.ts' });
    const events = [...read(), ...read(), ...read(), ...read()];
    expect(detectReadThrash(events)[0]?.count).toBe(3);
    const withEdit = [
      ...read(),
      ...read(),
      ...call('Edit', { file_path: '/big.ts', old_string: 'a', new_string: 'b' }),
      ...read(),
      ...read(),
    ];
    expect(detectReadThrash(withEdit)).toEqual([]);
  });
});

describe('permission friction', () => {
  test('suggests an allow rule for a safe command', () => {
    const events: Event[] = [];
    for (let i = 0; i < 3; i++) {
      const [pre] = call('Bash', { command: `bun run lint --fix ${i}` }, 'none');
      events.push(
        pre,
        ev('Notification', {
          notification_type: 'permission_prompt',
          message: 'Claude needs your permission to use Bash',
        }),
      );
    }
    const [f] = detectPermissionFriction(events);
    expect(f.suggestion).toBe('"permissions": { "allow": ["Bash(bun run:*)"] }');
  });

  test('never suggests pre-approving a risky command', () => {
    const events: Event[] = [];
    for (let i = 0; i < 3; i++) {
      const [pre] = call('Bash', { command: 'git push origin main' }, 'none');
      events.push(pre, ev('Notification', { notification_type: 'permission_prompt' }));
    }
    const [f] = detectPermissionFriction(events);
    expect(f.title).toContain('git push');
    expect(f.suggestion).toBeUndefined();
  });

  test('no allow rule for shell loops; reads outside the project point at additionalDirectories', () => {
    const events: Event[] = [];
    for (let i = 0; i < 2; i++) {
      const [loop] = call('Bash', { command: `for f in *.ts; do wc -l $f; done ${i}` }, 'none');
      events.push(loop, ev('Notification', { notification_type: 'permission_prompt' }));
      const [read] = call('Read', { file_path: `/elsewhere/${i}.md` }, 'none');
      events.push(read, ev('Notification', { notification_type: 'permission_prompt' }));
    }
    const byTitle = Object.fromEntries(detectPermissionFriction(events).map((f) => [f.title.split(' ')[0], f]));
    expect(byTitle['Bash(for:*)'].suggestion).toBeUndefined();
    expect(byTitle.Read.suggestion).toContain('additionalDirectories');
  });
});

describe('correction', () => {
  test('matches corrections in English, German and Turkish', () => {
    for (const p of [
      'no, use bun instead',
      'I said keep the API',
      'Nein, das ist falsch',
      'hayir hala 19 görünüyor',
      'bunu değil diğerini istedim',
    ])
      expect(isCorrection(p)).toBe(true);
    for (const p of ['nothing else to add', 'please add tests', 'Neue Funktion bitte', 'harika, devam et'])
      expect(isCorrection(p)).toBe(false);
  });

  test('the first prompt of a session is never a correction', () => {
    expect(detectCorrections([prompt('no tests yet, write some')])).toEqual([]);
    expect(detectCorrections([prompt('write tests'), prompt('no, use vitest')])[0]?.count).toBe(1);
  });
});

describe('waiting', () => {
  test('sums permission waits and ignores idle prompts', () => {
    const events = [
      ...call('Bash', { command: 'x' }, 'none'),
      ev('Notification', { notification_type: 'permission_prompt' }),
      ev('PostToolUse', { tool_name: 'Bash' }, 4 * 60_000),
      ev('Notification', { notification_type: 'idle_prompt' }),
      prompt('next'),
    ];
    t += 10 * 60 * 60_000; // an overnight idle gap must not count
    const [f] = detectWaiting(events);
    expect(f.title).toContain('4 min');
  });
});

describe('redaction', () => {
  test('masks common secret shapes', () => {
    const s = redact(
      'curl -H "Authorization: Bearer abcdefghijklmnop1234" https://u:hunter2@x.io sk-ant-abcdefghijklmnopqrst ' +
        'ghp_abcdefghijklmnopqrstuvwxyz123456 API_KEY=supersecret mysql -uroot -psomewordpress -D db me@example.com',
    );
    for (const leak of [
      'abcdefghijklmnop1234',
      'hunter2',
      'sk-ant-abc',
      'ghp_abc',
      'supersecret',
      'somewordpress',
      'me@example.com',
    ])
      expect(s).not.toContain(leak);
  });
});

describe('commandPrefix', () => {
  test('strips cd and env assignments, keeps subcommands', () => {
    expect(commandPrefix('cd app && FOO=1 bun test --watch')).toBe('bun test');
    expect(commandPrefix('git -C repo status')).toBe('git');
    expect(commandPrefix('/usr/bin/ls -la')).toBe('ls');
  });
});

describe('validateReport', () => {
  const ids = ['loop-1', 'permission-1'];
  test('keeps cited items and drops uncited or unknown citations', () => {
    const r = validateReport(
      {
        summary: 'Stuck polling CI.',
        rootCauses: [
          { text: 'Polled CI', findingIds: ['loop-1'] },
          { text: 'Invented cause', findingIds: ['made-up-9'] },
          { text: 'No citation', findingIds: [] },
        ],
        recommendations: [
          {
            kind: 'permission',
            text: 'Allow gh run',
            snippet: '"allow": ["Bash(gh run:*)"]',
            findingIds: ['permission-1', 'nope'],
          },
        ],
      },
      ids,
    );
    expect(r.rootCauses).toEqual([{ text: 'Polled CI', findingIds: ['loop-1'] }]);
    expect(r.recommendations[0].findingIds).toEqual(['permission-1']);
    expect(r.dropped).toBe(2);
  });

  test('accepts fenced JSON text and fixes an unknown kind', () => {
    const r = validateReport(
      '```json\n{"summary":"ok","rootCauses":[],"recommendations":[{"kind":"magic","text":"x","findingIds":["loop-1"]}]}\n```',
      ids,
    );
    expect(r.recommendations[0].kind).toBe('workflow');
  });

  test('throws when there is no JSON at all', () => {
    expect(() => validateReport('I cannot help with that.', ids)).toThrow();
  });
});

describe('provider pick', () => {
  test('auto prefers Claude Code, then the API, then Ollama', () => {
    expect(pickProvider(DEFAULT_SETTINGS, { 'claude-code': true, ollama: true })).toBe('claude-code');
    expect(pickProvider(DEFAULT_SETTINGS, { 'claude-api': true, ollama: true })).toBe('claude-api');
    expect(pickProvider(DEFAULT_SETTINGS, { ollama: true })).toBe('ollama');
    expect(pickProvider(DEFAULT_SETTINGS, {})).toBeNull();
  });

  test('an explicit choice is never silently swapped for another provider', () => {
    const s = { ...DEFAULT_SETTINGS, provider: 'ollama' as const };
    expect(pickProvider(s, { 'claude-code': true })).toBeNull();
    expect(pickProvider({ ...DEFAULT_SETTINGS, provider: 'off' }, { ollama: true })).toBeNull();
  });

  test('settings are sanitised', () => {
    const s = sanitizeSettings({
      provider: 'rm -rf',
      cloudConsent: 'yes',
      models: { ollama: 'qwen3:4b', 'claude-api': 'x; rm' },
    });
    expect(s.provider).toBe('auto');
    expect(s.cloudConsent).toBe(false);
    expect(s.models).toEqual({ ollama: 'qwen3:4b' });
  });
});

describe('analyzeSession', () => {
  test('ids, health and a prompt that contains no raw secret', () => {
    const events = [
      prompt('deploy it, token=abc123secret'),
      ...[1, 2, 3].flatMap(() => call('Bash', { command: 'gh run view 1' })),
      prompt('no, wait for the build'),
    ];
    const a = analyzeSession('s1', events);
    expect(a.findings.map((f) => f.id)).toEqual(['loop-1', 'correction-1']);
    expect(a.health).toBe(100 - 10 - 3);
    expect(buildUserPrompt(a)).not.toContain('abc123secret');
  });
});
