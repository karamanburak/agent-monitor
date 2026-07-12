import { useEffect, useMemo, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { autoSelect, selectSession, setRailQuery, setRailStatus, setUserPinned } from '../store/uiSlice';
import type { RailStatus } from '../store/uiSlice';
import { removeSession } from '../store/sessionsSlice';
import { displayStatus, SOURCE_LABEL } from '../lib/constants';
import { basename, rel } from '../lib/format';
import { partitionSessions, sessionOneLiner } from '../lib/selectors';
import { useNow } from '../hooks/useNow';
import TokenFooter from './TokenFooter';

const clampW = (w: number) => Math.min(480, Math.max(200, w));

export default function Rail({ onRefreshUsage }: { onRefreshUsage: () => Promise<void> }) {
  const dispatch = useAppDispatch();
  const sessions = useAppSelector((s) => s.sessions.sessions);
  const query = useAppSelector((s) => s.ui.railQuery);
  const railStatus = useAppSelector((s) => s.ui.railStatus);
  const selectedId = useAppSelector((s) => s.ui.selectedId);
  const userPinned = useAppSelector((s) => s.ui.userPinned);
  const nowSec = Math.floor(useNow() / 1000); // keeps relative times + status decay fresh

  const railWRef = useRef(clampW(+(localStorage.getItem('railw') || 0) || 320));
  const resizeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    document.documentElement.style.setProperty('--railw', railWRef.current + 'px');
  }, []);

  // nowSec is a dep so time-based status decay re-partitions even with no new event
  const { live, finished } = useMemo(
    () => partitionSessions(sessions, query, railStatus),
    [sessions, query, railStatus, nowSec],
  );
  const liveOrder = useMemo(() => live.map((s) => s.id), [live]);

  // auto-follow the most-recently-active live session until the user pins one; clear when none live
  useEffect(() => {
    const exists = selectedId != null && !!sessions[selectedId];
    if (userPinned && exists) return;
    if (userPinned && !exists) {
      dispatch(setUserPinned(false));
      return;
    }
    const next = live[0]?.id ?? null;
    if (next !== selectedId) dispatch(autoSelect(next));
  }, [sessions, live, userPinned, selectedId, dispatch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const tag = document.activeElement?.tagName || '';
      if (/^(INPUT|TEXTAREA)$/.test(tag)) return;
      if (!liveOrder.length) return;
      e.preventDefault();
      const i = Math.max(0, liveOrder.indexOf(selectedId as string));
      const j = e.key === 'ArrowDown' ? Math.min(liveOrder.length - 1, i + 1) : Math.max(0, i - 1);
      dispatch(selectSession(liveOrder[j]));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [liveOrder, selectedId, dispatch]);

  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    el.classList.add('drag');
    document.body.classList.add('dragging');
    const startX = e.clientX;
    const startW = railWRef.current;
    const move = (ev: PointerEvent) => {
      railWRef.current = clampW(startW + ev.clientX - startX);
      document.documentElement.style.setProperty('--railw', railWRef.current + 'px');
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.classList.remove('drag');
      document.body.classList.remove('dragging');
      localStorage.setItem('railw', String(railWRef.current));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up, { once: true });
    el.addEventListener('pointercancel', up, { once: true });
  };

  return (
    <aside className="rail" aria-label="Sessions">
      <div className="rail-scroll">
        <div className={'rail-search' + (query ? ' has' : '')}>
          <div className="wrap">
            <span className="mag" aria-hidden="true">
              🔍
            </span>
            <input
              type="search"
              placeholder="Filter sessions…"
              aria-label="Filter sessions"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => dispatch(setRailQuery(e.target.value))}
            />
            <button
              className="clr"
              title="Clear filter"
              aria-label="Clear filter"
              onClick={() => dispatch(setRailQuery(''))}
            >
              ✕
            </button>
          </div>
        </div>
        <div className="rail-filters" role="group" aria-label="Filter by status">
          {(
            [
              ['all', 'All'],
              ['needs', 'Needs you'],
              ['working', 'Working'],
              ['failed', 'Failed'],
            ] as [RailStatus, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={'rail-filter' + (railStatus === key ? ' on' : '')}
              aria-pressed={railStatus === key}
              onClick={() => dispatch(setRailStatus(key))}
            >
              {label}
            </button>
          ))}
        </div>
        <h2 className="rail-label">Sessions</h2>
        <div role="list">
          {live.map((s) => {
            const st = displayStatus(s);
            const justDone = st === 'idle' && s.doneAt && Date.now() - s.doneAt < 120000;
            const cls = 'srow ' + st + (justDone ? ' justdone' : '') + (s.id === selectedId ? ' sel' : '');
            const sub = sessionOneLiner(s, st);
            const nm = basename(s.cwd);
            return (
              // plain container with sibling <button>s to avoid nested interactive elements
              <div key={s.id} className={cls} role="listitem">
                <button
                  type="button"
                  className="srow-main"
                  aria-current={s.id === selectedId || undefined}
                  aria-label={`Open ${nm} — ${sub}`}
                  onClick={() => dispatch(selectSession(s.id))}
                >
                  <span className="sdot" aria-hidden="true"></span>
                  <span className="smain">
                    <span className="sname">
                      {nm}
                      {s.source && s.source !== 'claude' && s.source !== 'claude-code' && (
                        <span className="ssource">{SOURCE_LABEL[s.source] || s.source}</span>
                      )}
                    </span>
                    <span className="ssub" data-tip={sub}>
                      {sub}
                    </span>
                  </span>
                </button>
                <span className="sfail" title="failed tool calls">
                  {s.failCount ? s.failCount + '✗' : ''}
                </span>
                <span className="swhen">{rel(s.lastSeen)}</span>
                <button
                  type="button"
                  className="sclose"
                  title="Dismiss this session from the list"
                  aria-label={`Dismiss ${nm}`}
                  onClick={() => dispatch(removeSession(s.id))}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
        {!live.length && (
          <div className="rail-empty">
            {query
              ? `No live sessions match “${query}”.`
              : railStatus !== 'all'
                ? 'No live sessions match this filter.'
                : 'No live sessions — start Claude Code in any directory.'}
          </div>
        )}
        {finished.length > 0 && (
          <details className="donewrap" open={false}>
            <summary>Finished · {finished.length}</summary>
            <div>
              {finished.map((s) => (
                <button key={s.id} className="drow" onClick={() => dispatch(selectSession(s.id))}>
                  <span className="dname">{basename(s.cwd)}</span>
                  <span className="dwhat">{s.prompt || ''}</span>
                  <span className="dt">{rel(s.lastSeen)}</span>
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
      <TokenFooter onRefresh={onRefreshUsage} />
      <div className="rail-resize" ref={resizeRef} title="Drag to resize" onPointerDown={onResizeDown}></div>
    </aside>
  );
}
