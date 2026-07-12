import { useEffect, useMemo, useState } from 'react';
import { useAppSelector } from '../store/hooks';
import { clock, fmtDur, fmtMoney, fmtTokens } from '../lib/format';
import { KIND_COLOR } from '../lib/constants';
import { legendFor } from '../lib/legends';
import { buildTurns, turnStats } from '../lib/turns';
import { useNow } from '../hooks/useNow';
import type { Session, TimelineEntry, ToolEntry } from '../lib/types';

// keyboard parity for role="button" rows without making them real <button>s
const onRowKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
};

function TlRow({ en, onInspect }: { en: TimelineEntry; onInspect: (e: ToolEntry) => void }) {
  const time = <span className="tt mono">{clock(en.t)}</span>;
  const [exp, setExp] = useState(false);

  if (en.kind === 'prompt')
    return (
      <div className="tprompt">
        {time}
        <span className="bar"></span>
        <span className="ptext" title={en.text}>
          {en.text}
        </span>
      </div>
    );

  if (en.kind === 'tool') {
    const color = en.ok === false ? KIND_COLOR.fail : KIND_COLOR.tool;
    return (
      <div
        className="trow"
        role="button"
        tabIndex={0}
        title="Open full input / output"
        aria-label={`${en.name}${en.detail ? ' — ' + en.detail : ''} — open details`}
        onClick={() => onInspect(en)}
        onKeyDown={onRowKey(() => onInspect(en))}
        style={{ cursor: 'pointer' }}
      >
        {time}
        <span className="tdot" style={{ ['--c' as string]: color }}></span>
        <span className="tname">{en.name}</span>
        {en.agent && <span className="tag">{legendFor(en.agent).f.split(' ').pop()}</span>}
        <span className="tdet mono">{en.detail}</span>
        {en.dur === null ? (
          <span className="tdur run">running</span>
        ) : (
          <span className={'tdur' + (en.ok === false ? ' fail' : '')}>
            {en.ok === false ? 'failed · ' : ''}
            {fmtDur(en.dur)}
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
        <span className="tdot" style={{ ['--c' as string]: 'var(--ok,#3fb950)' }}></span>
        <span className="rlabel">✓ Result</span>
        {en.tok && (en.tok.in || en.tok.out) ? (
          <span className="rtok mono" title="tokens this turn (in+out)">
            {fmtTokens(en.tok.in + en.tok.out)} tok
          </span>
        ) : null}
        <div className="rmsg">{en.text}</div>
      </div>
    );
  }

  const color = KIND_COLOR[en.kind] || 'var(--mut)';
  const title = en.kind === 'agent' && en.result ? en.result.slice(0, 500) : undefined;
  return (
    <div className="trow sys" title={title}>
      {time}
      <span className="tdot" style={{ ['--c' as string]: color }}></span>
      <span className="tname">{en.text}</span>
    </div>
  );
}

export default function Timeline({
  session,
  onInspect,
  failOnlyOverride,
}: {
  session: Session;
  onInspect: (e: ToolEntry) => void;
  failOnlyOverride?: boolean;
}) {
  const failOnlyGlobal = useAppSelector((s) => s.ui.failOnly);
  const failOnly = failOnlyOverride ?? failOnlyGlobal;
  const usage = useAppSelector((s) => s.usage);
  const now = useNow();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => setOpen({}), [session.id]);

  const { pre, turns } = useMemo(() => buildTurns(session), [session.timeline, session]);

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
  const rendered = reversed
    .map((turn, i) => {
      const st = turnStats(turn, now);
      if (failOnly && !st.fails) return null;
      const entries = failOnly ? turn.entries.filter((en) => en.kind === 'tool' && en.ok === false) : turn.entries;
      const isOpen = turn.key in open ? open[turn.key] : i === 0 || failOnly;
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
              {turn.prompt.text}
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
              {st.running ? (
                <>
                  {' · '}
                  <span className="runy">running</span>
                </>
              ) : (
                ''
              )}
            </span>
            <span className="carr">▼</span>
          </summary>
          <div className="tbody">
            {[...entries].reverse().map((en, j) => (
              <TlRow key={j} en={en} onInspect={onInspect} />
            ))}
          </div>
        </details>
      );
    })
    .filter(Boolean);

  const preRows =
    !failOnly && pre.length
      ? [...pre].reverse().map((en, j) => <TlRow key={'pre' + j} en={en} onInspect={onInspect} />)
      : [];

  if (!rendered.length && !preRows.length)
    return <div className="tr-empty">{failOnly ? 'No failures in this session 🎉' : 'No activity yet.'}</div>;

  return (
    <>
      {rendered}
      {preRows}
    </>
  );
}
