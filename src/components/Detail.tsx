import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setFailOnly, setViewMode } from '../store/uiSlice';
import { clearSessionUsage, sessionUsageLoaded } from '../store/usageSlice';
import { getSessionUsage } from '../lib/api';
import Icon from './Icon';
import { AVATAR_COLORS, STATUS_LABEL, displayStatus } from '../lib/constants';
import {
  basename,
  clock,
  fmtDur,
  fmtMoney,
  fmtTokens,
  hashStr,
  nowActivity,
  PERM_LABEL,
  rel,
  shortModel,
} from '../lib/format';
import { downloadSessionMarkdown } from '../lib/markdown';
import { useNow } from '../hooks/useNow';
import { useToast } from './Toast';
import AgentLane from './AgentLane';
import Analysis from './Analysis';
import TerminalActions from './TerminalActions';
import { useTerminal } from '../hooks/useTerminal';
import Timeline from './Timeline';
import Trace from './Trace';
import type { Session, ToolEntry } from '../lib/types';

type SessionUsage = { input: number; output: number; cache: number; cost: number; model?: string };

// Wide screens: the session's vital signs in one glanceable column next to the timeline.
function SummaryCard({
  session: s,
  st,
  usage: u,
  now,
  failOnly,
  onToggleFails,
  onCopyId,
}: {
  session: Session;
  st: string;
  usage?: SessionUsage;
  now: number;
  failOnly: boolean;
  onToggleFails: () => void;
  onCopyId: () => void;
}) {
  const turns = s.timeline.filter((en) => en.kind === 'prompt').length;
  const running = s.subagents.filter((x) => x.running).length;
  const live = st === 'working' || st === 'waiting';
  const row = (label: string, value: React.ReactNode, cls = '') => (
    <div className={'dsrow ' + cls}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
  return (
    <aside className="dside" aria-label="Session summary">
      <dl className="dscard">
        {row(live ? 'Running for' : 'Duration', fmtDur((live ? now : s.lastSeen) - s.firstSeen))}
        {row('Last event', rel(s.lastSeen) + ' ago')}
        {row('Prompts', turns)}
        {row('Tool calls', s.toolCount)}
        {s.failCount > 0
          ? row(
              'Failed',
              <button
                className={'dslink bad' + (failOnly ? ' on' : '')}
                aria-pressed={failOnly}
                title={failOnly ? 'Show everything' : 'Show only the failed tool calls'}
                onClick={onToggleFails}
              >
                {s.failCount} {failOnly ? '· showing' : '· show'}
              </button>,
            )
          : row('Failed', '0')}
        {row('Subagents', s.subagents.length ? `${s.subagents.length}${running ? ` · ${running} running` : ''}` : '0')}
      </dl>
      {u && (
        <dl
          className="dscard"
          title={`in ${fmtTokens(u.input)} · out ${fmtTokens(u.output)} · cache ${fmtTokens(u.cache)} — API-equivalent estimate, not your plan bill`}
        >
          {row('Tokens', fmtTokens(u.input + u.output))}
          {row('Est. cost', fmtMoney(u.cost), 'money')}
        </dl>
      )}
      <dl className="dscard">
        {row('Started', clock(s.firstSeen))}
        {row(
          'Session',
          <button className="dslink id mono" title={`${s.id} — click to copy`} onClick={onCopyId}>
            {s.id.slice(0, 8)}
          </button>,
        )}
      </dl>
    </aside>
  );
}

export default function Detail({ session: s, onInspect }: { session: Session; onInspect: (e: ToolEntry) => void }) {
  const dispatch = useAppDispatch();
  const { copyText, toast } = useToast();
  const viewMode = useAppSelector((u) => u.ui.viewMode);
  const failOnly = useAppSelector((u) => u.ui.failOnly);
  const usageBySession = useAppSelector((u) => u.usage.data?.bySession);
  const usageUpdated = useAppSelector((u) => u.usage.updated);
  const now = useNow();
  const term = useTerminal();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [fitKey, setFitKey] = useState(0);
  const [tlFilter, setTlFilter] = useState('');

  // reset failures-only filter on session change (component is keyed by id)
  useEffect(() => {
    dispatch(setFailOnly(false));
  }, [dispatch]);

  useEffect(() => {
    dispatch(clearSessionUsage());
    let cancelled = false;
    getSessionUsage(s.id)
      .then((j) => {
        if (!cancelled) dispatch(sessionUsageLoaded({ id: s.id, entries: j.entries || [] }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [s.id, dispatch, usageUpdated]);

  const st = displayStatus(s);
  const nm = basename(s.cwd);
  const color = AVATAR_COLORS[hashStr(nm) % AVATAR_COLORS.length];
  const u = usageBySession?.[s.id];
  // hook events don't always carry the model; fall back to the usage-scan model
  const mdl = shortModel(s.model || u?.model || '');
  const pm = PERM_LABEL[s.permMode];
  const tool = st === 'working' ? s.currentTool : null;
  const act = tool ? nowActivity(tool.name) : null;

  const toggleAgent = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const switchView = (m: 'list' | 'trace') => {
    dispatch(setViewMode(m));
    setFitKey((k) => k + 1);
  };

  return (
    <div className={'dwrap detail-view swap ' + st + (viewMode === 'trace' ? ' tracemode' : '')}>
      <div className="dhead">
        <div
          className="davatar"
          style={{ background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 55%, black))` }}
        >
          {nm.slice(0, 1)}
        </div>
        <div className="dnames">
          <div className="dtitle">
            <h1>{nm}</h1>
            <span className="dstatus">
              <span className="pdot"></span>
              <span>{STATUS_LABEL[st] || st}</span>
            </span>
          </div>
          <div className="dmeta">
            <span
              className="dpath mono"
              title={`${s.cwd || '?'} — click to copy`}
              onClick={() => s.cwd && copyText(s.cwd, 'Path')}
            >
              {s.cwd || '?'}
            </span>
            {mdl && (
              <span className="dbadge" title={`Model: ${s.model}`}>
                {mdl}
              </span>
            )}
            {pm && (
              <span className={'dbadge ' + pm[1]} title={`Permission mode: ${s.permMode}`}>
                {pm[0]}
              </span>
            )}
            {s.effort && (
              <span className="dbadge" title="Reasoning effort">
                effort: {s.effort}
              </span>
            )}
            {s.failCount > 0 && (
              <button
                className={'dfails' + (failOnly ? ' on' : '')}
                title={
                  failOnly ? 'Showing failures only — click to show everything' : 'Show only the failed tool calls'
                }
                aria-pressed={failOnly}
                onClick={() => dispatch(setFailOnly(!failOnly))}
              >
                ✗ {s.failCount} failed
              </button>
            )}
          </div>
        </div>
        <TerminalActions s={s} />
      </div>

      <div className="dbanner" role="alert" aria-live="assertive">
        <Icon name="hourglass" size={13} />
        <span className="bmsg">{s.waitMsg || 'Claude is waiting for your input'}</span>
        {s.waitingSince ? <span className="bwait">waiting {rel(s.waitingSince)}</span> : null}
        {term.supported && (
          <button
            className="bterm"
            title={`Jump to the ${s.termLabel || 'terminal'} tab where Claude is waiting (T)`}
            onClick={() => term.run(s, 'focus')}
          >
            <Icon name="square-terminal" size={12} /> Go to terminal
          </button>
        )}
        <button
          className="bcopy"
          title="Copy this message"
          aria-label="Copy message"
          onClick={() => s.waitMsg && copyText(s.waitMsg, 'Prompt')}
        >
          <Icon name="copy" size={11} />
        </button>
      </div>

      <div className="dbody">
        <div className="dmain">
          <div className={'dnow' + (tool ? ' show' : '')} data-kind={act?.kind}>
            <div className="dnow-head">
              <span className="spinner"></span>
              <span className="nverb">{act?.verb}</span>
              <b>{tool?.name}</b>
              <span className="ndetail mono" data-tip={tool?.detail}>
                {tool?.detail}
              </span>
              <span className="nsince">{tool && s.toolStart ? fmtDur(now - s.toolStart) : ''}</span>
            </div>
          </div>

          <AgentLane subagents={s.subagents} expanded={expanded} onToggle={toggleAgent} />

          <Analysis session={s} />

          <section className="dtl">
            <h2>
              Timeline
              <span className="h2right">
                <span className="trhint trmode-only">drag to pan · ⌘/Ctrl+scroll to zoom</span>
                <button className="fitbtn trmode-only" onClick={() => setFitKey((k) => k + 1)}>
                  Fit
                </button>
                <span className="tlsearch">
                  <Icon name="search" size={11} />
                  <input
                    type="search"
                    placeholder="Filter timeline…"
                    aria-label="Filter this session's timeline"
                    autoComplete="off"
                    spellCheck={false}
                    value={tlFilter}
                    onChange={(e) => setTlFilter(e.target.value)}
                  />
                </span>
                <span className="seg">
                  <button className={viewMode === 'list' ? 'on' : ''} onClick={() => switchView('list')}>
                    List
                  </button>
                  <button className={viewMode === 'trace' ? 'on' : ''} onClick={() => switchView('trace')}>
                    Trace
                  </button>
                </span>
                <button
                  className="fitbtn iconbtn"
                  title="Export this session's timeline as Markdown"
                  aria-label="Export timeline as Markdown"
                  onClick={() => downloadSessionMarkdown(s, toast)}
                >
                  <Icon name="download" size={12} />
                </button>
              </span>
            </h2>
            {viewMode === 'trace' ? (
              <Trace session={s} st={st} fitKey={fitKey} onInspect={onInspect} />
            ) : (
              <div className="tl">
                <Timeline session={s} onInspect={onInspect} filterQuery={tlFilter} />
              </div>
            )}
          </section>
        </div>
        <SummaryCard
          session={s}
          st={st}
          usage={u}
          now={now}
          failOnly={failOnly}
          onToggleFails={() => dispatch(setFailOnly(!failOnly))}
          onCopyId={() => copyText(s.id, 'Session id')}
        />
      </div>

      <div className="dfoot">
        <span className="fmain">
          First seen {clock(s.firstSeen)} · {s.toolCount} tool calls · {s.subagents.length} subagent
          {s.subagents.length === 1 ? '' : 's'} · last event {rel(s.lastSeen)} ago ·{' '}
          <span className="fid" title={`${s.id} — click to copy`} onClick={() => copyText(s.id, 'Session id')}>
            {s.id.slice(0, 8)}
          </span>
        </span>
        <span
          className="ftok mono"
          title={
            u
              ? `this session — in ${fmtTokens(u.input)} · out ${fmtTokens(u.output)} · cache ${fmtTokens(u.cache)} · ${fmtMoney(u.cost)} API-equiv (not your plan bill)`
              : ''
          }
        >
          {u ? (
            <>
              <b>{fmtTokens(u.input + u.output)}</b> tokens · <b>{fmtMoney(u.cost)}</b>
            </>
          ) : (
            ''
          )}
        </span>
      </div>
    </div>
  );
}
