import { fmtDur } from '../lib/format';
import { legendFor } from '../lib/legends';
import { useNow } from '../hooks/useNow';
import type { Subagent } from '../lib/types';

function RunningCard({ sa, expanded, onToggle }: { sa: Subagent; expanded: boolean; onToggle: () => void }) {
  const now = useNow();
  const leg = legendFor(sa.id);
  const tool = sa.tool ? `${sa.tool.name}${sa.tool.detail ? ' — ' + sa.tool.detail : ''}` : 'thinking…';
  return (
    <button
      type="button"
      className={'agent' + (expanded ? ' expanded' : '')}
      title={expanded ? 'Click to collapse' : 'Click to expand'}
      aria-expanded={expanded}
      aria-label={`Subagent ${leg.f} (${sa.type}) — ${tool}`}
      onClick={onToggle}
    >
      <div className="ahead">
        <span className="adot"></span>
        <span className="aname">
          {leg.e} {leg.f}
        </span>
        <span className="aage mono">{fmtDur(now - sa.started)}</span>
      </div>
      <span className="arole" title={`${leg.f} — ${leg.t}`}>
        {leg.t}
      </span>
      <span className="atype">{sa.type}</span>
      <div className="atool mono" title={tool}>
        {tool}
      </div>
      <div className="aquote" data-tip={leg.q}>
        “{leg.q}”
      </div>
      <span className="aexpand" aria-hidden="true">
        {expanded ? '⤡' : '⤢'}
      </span>
    </button>
  );
}

function Chip({ sa, expanded, onToggle }: { sa: Subagent; expanded: boolean; onToggle: () => void }) {
  const leg = legendFor(sa.id);
  const dur = fmtDur((sa.stopped || sa.started) - sa.started);
  return (
    <button
      type="button"
      className={'chip' + (expanded ? ' expanded' : '')}
      title={expanded ? 'Click to collapse' : 'Click to expand'}
      aria-expanded={expanded}
      aria-label={`Finished subagent ${leg.f} (${sa.type}) — ${dur}`}
      onClick={onToggle}
    >
      <span className="chead">
        {leg.e} {leg.f}
        <span className="cd">{dur}</span>
      </span>
      <span className="cbody">
        <span className="crole">
          {leg.f} — {leg.t}
        </span>
        <span className="ctype">{sa.type}</span>
        <span className="cquote">“{leg.q}”</span>
      </span>
    </button>
  );
}

export default function AgentLane({
  subagents,
  expanded,
  onToggle,
}: {
  subagents: Subagent[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  // counts come from the full lists; rendered slices are capped, so surface the hidden ones
  const allRunning = subagents.filter((x) => x.running);
  const allDone = subagents.filter((x) => !x.running);
  const running = allRunning.slice(0, 16);
  const done = allDone.slice(-14);
  const hiddenRunning = allRunning.length - running.length;
  const hiddenDone = allDone.length - done.length;
  const count = allRunning.length
    ? `· ${allRunning.length} running`
    : allDone.length
      ? `· ${allDone.length} finished`
      : '';

  return (
    <section className={'dsubs' + (subagents.length > 0 ? ' has' : '')}>
      <h2>
        Subagents <span className="count">{count}</span>
      </h2>
      <div className="lane">
        {running.map((sa) => (
          <RunningCard
            key={sa.id}
            sa={sa}
            expanded={expanded.has(String(sa.id))}
            onToggle={() => onToggle(String(sa.id))}
          />
        ))}
        {hiddenRunning > 0 && (
          <span className="cmore" title={`${hiddenRunning} more running subagents not shown`}>
            +{hiddenRunning} more
          </span>
        )}
      </div>
      <div className="donechips">
        {hiddenDone > 0 && (
          <span className="chip more" title={`${hiddenDone} earlier finished subagents not shown`}>
            +{hiddenDone} more
          </span>
        )}
        {done.map((sa) => (
          <Chip key={sa.id} sa={sa} expanded={expanded.has(String(sa.id))} onToggle={() => onToggle(String(sa.id))} />
        ))}
      </div>
    </section>
  );
}
