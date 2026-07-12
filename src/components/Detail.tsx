import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setFailOnly, setViewMode } from '../store/uiSlice';
import { clearSessionUsage, sessionUsageLoaded } from '../store/usageSlice';
import { getSessionUsage } from '../lib/api';
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
import Timeline from './Timeline';
import Trace from './Trace';
import type { Session, ToolEntry } from '../lib/types';

export default function Detail({ session: s, onInspect }: { session: Session; onInspect: (e: ToolEntry) => void }) {
  const dispatch = useAppDispatch();
  const { copyText, toast } = useToast();
  const viewMode = useAppSelector((u) => u.ui.viewMode);
  const failOnly = useAppSelector((u) => u.ui.failOnly);
  const usageBySession = useAppSelector((u) => u.usage.data?.bySession);
  const usageUpdated = useAppSelector((u) => u.usage.updated);
  const now = useNow();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [fitKey, setFitKey] = useState(0);

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
          <h1>{nm}</h1>
          <div className="dpath mono" title={s.id} onClick={() => copyText(s.id, 'Session id')}>
            {(s.cwd || '?') + '  ·  ' + s.id.slice(0, 8)}
          </div>
        </div>
        <span className="dbadges">
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
        </span>
        {s.failCount > 0 && (
          <button
            className="dfails"
            title="Failed tool calls — click to filter the timeline"
            onClick={() => dispatch(setFailOnly(!failOnly))}
          >
            ✗ {s.failCount} failed
          </button>
        )}
        <span className="dstatus">
          <span className="pdot"></span>
          <span>{STATUS_LABEL[st] || st}</span>
        </span>
      </div>

      <div className="dbanner" role="alert" aria-live="assertive">
        <span aria-hidden="true">⏳</span>
        <span className="bmsg">{s.waitMsg || 'Claude is waiting for your input'}</span>
        <button
          className="bcopy"
          title="Copy this message"
          aria-label="Copy message"
          onClick={() => s.waitMsg && copyText(s.waitMsg, 'Prompt')}
        >
          ⧉
        </button>
      </div>

      <div className={'dnow' + (tool ? ' show' : '')} data-kind={act?.kind}>
        <div className="dnow-head">
          <span className="spinner"></span>
          <span className="nverb">{act?.verb}</span>
          <b>{tool?.name}</b>
          <span className="ndetail mono" data-tip={tool?.detail}>
            {tool?.detail}
          </span>
          <span className="caret" aria-hidden="true"></span>
          <span className="nsince">{tool && s.toolStart ? fmtDur(now - s.toolStart) : ''}</span>
        </div>
      </div>

      <AgentLane subagents={s.subagents} expanded={expanded} onToggle={toggleAgent} />

      <section className="dtl">
        <h2>
          Timeline
          <span className="h2right">
            <span className="trhint trmode-only">drag to pan · ⌘/Ctrl+scroll to zoom</span>
            <button className="fitbtn trmode-only" onClick={() => setFitKey((k) => k + 1)}>
              Fit
            </button>
            <button
              className="fitbtn"
              title="Download this session's timeline as a Markdown file"
              onClick={() => downloadSessionMarkdown(s, toast)}
            >
              ⭳ Markdown
            </button>
            {s.failCount > 0 && (
              <button
                className={'fitbtn' + (failOnly ? ' on' : '')}
                title="Show failures only"
                onClick={() => dispatch(setFailOnly(!failOnly))}
              >
                ✗ {s.failCount}
              </button>
            )}
            <span className="seg">
              <button className={viewMode === 'list' ? 'on' : ''} onClick={() => switchView('list')}>
                List
              </button>
              <button className={viewMode === 'trace' ? 'on' : ''} onClick={() => switchView('trace')}>
                Trace
              </button>
            </span>
          </span>
        </h2>
        {viewMode === 'trace' ? (
          <Trace session={s} st={st} fitKey={fitKey} onInspect={onInspect} />
        ) : (
          <div className="tl">
            <Timeline session={s} onInspect={onInspect} />
          </div>
        )}
      </section>

      <div className="dfoot">
        <span className="fmain">
          First seen {clock(s.firstSeen)} · {s.toolCount} tool calls · {s.subagents.length} subagent
          {s.subagents.length === 1 ? '' : 's'} · last event {rel(s.lastSeen)} ago
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
