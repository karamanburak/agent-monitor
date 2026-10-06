import { useEffect, useMemo, useState } from 'react';
import { useAppSelector } from '../store/hooks';
import { clock, fmtDur, fmtMoney, fmtTokens } from '../lib/format';
import { KIND_COLOR } from '../lib/constants';
import { agentTypeLabel, legendFor } from '../lib/legends';
import { buildTurns, turnStats } from '../lib/turns';
import { useNow } from '../hooks/useNow';
import Icon from './Icon';
import { toolIcon } from '../lib/toolIcon';
import type { Session, TimelineEntry, ToolEntry } from '../lib/types';

// keyboard parity for role="button" rows without making them real <button>s
const onRowKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// wrap filter-query matches in <mark> (case-insensitive, all words)
function Hl({ text, words }: { text: string; words: string[] }) {
  if (!words.length || !text) return <>{text}</>;
  const re = new RegExp('(' + words.map(escapeRe).join('|') + ')', 'gi');
  const parts = text.split(re);
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

// a running call shows its live elapsed time in place of a duration
function RunningFor({ since }: { since: number }) {
  const now = useNow();
  return (
    <span className="tdur run" title="Still running">
      {fmtDur(Math.max(0, now - since))}
    </span>
  );
}

function TlRow({
  en,
  words,
  onInspect,
  showTime = true,
  agentTag,
}: {
  en: TimelineEntry;
  words: string[];
  onInspect: (e: ToolEntry) => void;
  showTime?: boolean;
  agentTag?: (id: string) => { label: string; title: string };
}) {
  // repeated timestamps are kept for alignment but visually dropped — only changes show
  const time = (
    <span className={'tt mono' + (showTime ? '' : ' dup')} aria-hidden={showTime ? undefined : true}>
      {clock(en.t)}
    </span>
  );
  const [exp, setExp] = useState(false);

  if (en.kind === 'prompt')
    return (
      <div className="tprompt">
        {time}
        <span className="bar"></span>
        <span className="ptext" title={en.text}>
          <Hl text={en.text} words={words} />
        </span>
      </div>
    );

  if (en.kind === 'tool') {
    const color = en.ok === false ? KIND_COLOR.fail : en.dur === null ? 'var(--acc)' : 'var(--ink-2)';
    const tag = en.agent ? agentTag?.(en.agent) : undefined;
    return (
      <div
        className={'trow tool' + (en.ok === false ? ' failed' : '') + (en.dur === null ? ' running' : '')}
        role="button"
        tabIndex={0}
        title="Open full input / output"
        aria-label={`${en.name}${en.detail ? ' — ' + en.detail : ''} — open details`}
        onClick={() => onInspect(en)}
        onKeyDown={onRowKey(() => onInspect(en))}
        style={{ cursor: 'pointer' }}
      >
        {time}
        <span className="ticon" style={{ ['--c' as string]: color }}>
          <Icon name={toolIcon(en.name)} size={13} />
        </span>
        <span className="tname">
          <Hl text={en.name} words={words} />
        </span>
        {en.agent && (
          <span className="tag" title={tag?.title}>
            {tag?.label || legendFor(en.agent).f.split(' ').pop()}
          </span>
        )}
        <span className="tdet mono">
          <Hl text={en.detail} words={words} />
        </span>
        {en.dur === null ? (
          <RunningFor since={en.t} />
        ) : (
          // sub-second calls are the norm — their "0s" is noise, so only real durations show
          <span className={'tdur' + (en.ok === false ? ' fail' : '')} title={`${en.dur} ms`}>
            {en.ok === false ? 'failed' : ''}
            {en.ok === false && en.dur >= 1000 ? ' · ' : ''}
            {en.dur >= 1000 ? fmtDur(en.dur) : ''}
          </span>
        )}
      </div>
    );
  }

  if (en.kind === 'result') {
    if (!en.hasResult)
      return (
        <div className="trow sys">
          {time}
          <span className="tdot" style={{ ['--c' as string]: 'var(--mut)' }}></span>
          <span className="tname">Turn finished — idle</span>
        </div>
      );
    return (
      <div
        className={'trow tresult' + (exp ? ' exp' : '')}
        role="button"
        tabIndex={0}
        aria-expanded={exp}
        title="Expand / collapse the full result"
        onClick={() => setExp((v) => !v)}
        onKeyDown={onRowKey(() => setExp((v) => !v))}
      >
        {time}
        <span className="ticon" style={{ ['--c' as string]: 'var(--ok)' }}>
          <Icon name="check" size={13} />
        </span>
        <span className="rlabel">Result</span>
        {en.tok && (en.tok.in || en.tok.out) ? (
          <span className="rtok mono" title="tokens this turn (in+out)">
            {fmtTokens(en.tok.in + en.tok.out)} tok
          </span>
        ) : null}
        <div className="rmsg">
          <Hl text={en.text} words={words} />
        </div>
      </div>
    );
  }

  const color = KIND_COLOR[en.kind] || 'var(--mut)';
  const title = en.kind === 'agent' && en.result ? en.result.slice(0, 500) : undefined;
  return (
    <div className={'trow sys' + (en.kind === 'agent' ? ' agentrow' : '')} title={title}>
      {time}
      {en.kind === 'agent' ? (
        <span className="ticon" style={{ ['--c' as string]: color }}>
          <Icon name="bot" size={13} />
        </span>
      ) : (
        <span className="tdot" style={{ ['--c' as string]: color }}></span>
      )}
      <span className="tname">
        <Hl text={en.text} words={words} />
      </span>
    </div>
  );
}

// does this entry's own text mention every word in the query?
function matchesFilter(en: TimelineEntry, words: string[]): boolean {
  const hay = (
    en.kind === 'tool'
      ? en.name + ' ' + en.detail
      : en.kind === 'prompt' || en.kind === 'result' || en.kind === 'sys' || en.kind === 'agent'
        ? en.text
        : ''
  ).toLowerCase();
  return words.every((w) => hay.includes(w));
}

export default function Timeline({
  session,
  onInspect,
  failOnlyOverride,
  filterQuery,
}: {
  session: Session;
  onInspect: (e: ToolEntry) => void;
  failOnlyOverride?: boolean;
  filterQuery?: string;
}) {
  const failOnlyGlobal = useAppSelector((s) => s.ui.failOnly);
  const failOnly = failOnlyOverride ?? failOnlyGlobal;
  const words = (filterQuery || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const usage = useAppSelector((s) => s.usage);
  const now = useNow();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => setOpen({}), [session.id]);

  const { pre, turns } = useMemo(() => buildTurns(session), [session.timeline, session]);

  // tag subagent rows by type ("Explore"); add the codename only when two share a type
  const agentTag = useMemo(() => {
    const byType = new Map<string, number>();
    for (const sa of session.subagents) byType.set(sa.type, (byType.get(sa.type) || 0) + 1);
    const types = new Map(session.subagents.map((sa) => [String(sa.id), sa.type]));
    return (id: string) => {
      const type = types.get(id);
      const code = legendFor(id).f;
      const label = agentTypeLabel(type);
      return {
        label: type && (byType.get(type) || 0) > 1 ? `${label} · ${code.split(' ').pop()}` : label,
        title: `${label} subagent — codename ${code}`,
      };
    };
  }, [session.subagents]);

  // stable row keys (tool ids / time+kind) so expanding a row survives new rows arriving
  const rowKey = (en: TimelineEntry, j: number) => (en.kind === 'tool' ? en.id : `${en.kind}:${en.t}:${j}`);
  const rows = (list: TimelineEntry[], firstTime: string | null, prefix = '') => {
    let last = firstTime;
    return list.map((en, j) => {
      const c = clock(en.t);
      const show = c !== last;
      last = c;
      return (
        <TlRow
          key={prefix + rowKey(en, j)}
          en={en}
          words={words}
          onInspect={onInspect}
          showTime={show}
          agentTag={agentTag}
        />
      );
    });
  };

  const costByKey = useMemo(() => {
    const out: Record<string, { cost: number; tok: number }> = {};
    if (usage.sessionEntriesId === session.id && usage.sessionEntries.length && turns.length) {
      const bounds = turns.map((t, i) => ({
        key: t.key,
        start: t.prompt.t,
        end: turns[i + 1] ? turns[i + 1].prompt.t : Infinity,
      }));
      for (const u of usage.sessionEntries) {
        const b = bounds.find((bb) => u.ts >= bb.start && u.ts < bb.end);
        if (!b) continue;
        const c = out[b.key] || (out[b.key] = { cost: 0, tok: 0 });
        c.cost += u.cost || 0;
        c.tok += (u.in || 0) + (u.out || 0);
      }
    }
    return out;
  }, [usage.sessionEntries, usage.sessionEntriesId, session.id, turns]);

  const reversed = [...turns].reverse();
  let matchCount = 0;
  const rendered = reversed
    .map((turn, i) => {
      const st = turnStats(turn, now);
      if (failOnly && !st.fails) return null;
      let entries = failOnly ? turn.entries.filter((en) => en.kind === 'tool' && en.ok === false) : turn.entries;
      if (words.length) {
        const promptMatches = matchesFilter(turn.prompt, words);
        const filtered = entries.filter((en) => matchesFilter(en, words));
        if (filtered.length) entries = filtered;
        else if (!promptMatches) return null;
        matchCount += filtered.length || (promptMatches ? 1 : 0);
      }
      const isOpen = turn.key in open ? open[turn.key] : i === 0 || failOnly || words.length > 0;
      const c = costByKey[turn.key];
      return (
        <details
          key={turn.key}
          className="turn"
          open={isOpen}
          onToggle={(e) => {
            const d = e.currentTarget;
            setOpen((prev) => (prev[turn.key] === d.open ? prev : { ...prev, [turn.key]: d.open }));
          }}
        >
          <summary>
            <span className="tt mono">{clock(turn.prompt.t)}</span>
            <span className="bar"></span>
            <span className="ptext" title={turn.prompt.text}>
              <Hl text={turn.prompt.text} words={words} />
            </span>
            <span className="tsum">
              {st.tools} tool{st.tools === 1 ? '' : 's'}
              {st.agents ? ` · ${st.agents} agent${st.agents === 1 ? '' : 's'}` : ''}
              {st.dur ? ` · ${fmtDur(st.dur)}` : ''}
              {c?.cost ? (
                <>
                  {' · '}
                  <span className="tcost" title={`≈ API-equiv cost this turn · ${fmtTokens(c.tok)} tokens`}>
                    {fmtMoney(c.cost)}
                  </span>
                </>
              ) : (
                ''
              )}
              {st.fails ? (
                <>
                  {' · '}
                  <span className="bad">{st.fails} failed</span>
                </>
              ) : (
                ''
              )}
              {/* an open turn already shows its running row; the roll-up says it only when collapsed */}
              {st.running ? (
                <span className="runwrap">
                  {' · '}
                  <span className="runy">running</span>
                </span>
              ) : (
                ''
              )}
            </span>
            <span className="carr">▼</span>
          </summary>
          {/* closed turns keep their body out of the DOM — long sessions stay cheap to render */}
          {isOpen && <div className="tbody">{rows([...entries].reverse(), clock(turn.prompt.t))}</div>}
        </details>
      );
    })
    .filter(Boolean);

  const preFiltered = words.length ? pre.filter((en) => matchesFilter(en, words)) : pre;
  const preRows = !failOnly && preFiltered.length ? rows([...preFiltered].reverse(), null, 'pre:') : [];
  if (words.length) matchCount += preRows.length;

  if (!rendered.length && !preRows.length)
    return (
      <div className="tr-empty">
        {failOnly
          ? 'No failures in this session 🎉'
          : words.length
            ? 'No entries match this filter.'
            : 'No activity yet.'}
      </div>
    );

  return (
    <>
      {words.length > 0 && (
        <div className="tl-matchcount" aria-live="polite">
          {matchCount} match{matchCount === 1 ? '' : 'es'}
        </div>
      )}
      {rendered}
      {preRows}
    </>
  );
}
