import { basename, clock, fmtDur } from './format';
import { legendFor } from './legends';
import type { Session } from './types';

export function sessionMarkdown(s: Session): string {
  const one = (t: unknown) =>
    String(t || '')
      .replace(/\s+/g, ' ')
      .trim();
  const out: string[] = [
    `# ${basename(s.cwd)}`,
    '',
    `- **Path:** \`${s.cwd || '?'}\``,
    `- **Session:** \`${s.id}\``,
    `- **Tool calls:** ${s.toolCount} · **Failures:** ${s.failCount} · **Subagents:** ${s.subagents.length}`,
    `- **First seen:** ${clock(s.firstSeen)} · **Last event:** ${clock(s.lastSeen)}`,
  ];
  for (const en of s.timeline) {
    if (en.kind === 'prompt') {
      out.push('', `## 💬 ${clock(en.t)} — ${one(en.text).slice(0, 200)}`, '');
      continue;
    }
    if (en.kind === 'tool') {
      const st = en.dur === null ? 'running' : en.ok === false ? '**FAILED**' : fmtDur(en.dur);
      const who = en.agent ? ` _(${legendFor(en.agent).f.split(' ').pop()})_` : '';
      const det = en.detail ? ' — `' + one(en.detail).replace(/`/g, "'").slice(0, 160) + '`' : '';
      out.push(`- \`${clock(en.t)}\` **${en.name}**${det} · ${st}${who}`);
    } else if (en.kind === 'result') {
      if (en.hasResult)
        out.push(
          '',
          `### ✅ ${clock(en.t)} — Result`,
          '',
          String(en.text)
            .trim()
            .split('\n')
            .map((l) => '> ' + l)
            .join('\n'),
        );
      else out.push(`- \`${clock(en.t)}\` _Turn finished — idle_`);
    } else if (en.kind === 'agent') out.push(`- \`${clock(en.t)}\` 🧑‍💻 ${one(en.text)}`);
    else if (en.kind === 'note') out.push(`- \`${clock(en.t)}\` ⏳ ${one(en.text)}`);
    else out.push(`- \`${clock(en.t)}\` _${one(en.text)}_`);
  }
  return out.join('\n');
}

export function downloadSessionMarkdown(s: Session, toast: (msg: string, kind?: 'ok' | 'err') => void): void {
  const safe = (basename(s.cwd) || 'session').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  const name = `${safe || 'session'}-${s.id.slice(0, 8)}.md`;
  const url = URL.createObjectURL(new Blob([sessionMarkdown(s)], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Downloaded ' + name, 'ok');
}
