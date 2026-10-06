import { useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectSession } from '../store/uiSlice';
import type { RailStatus } from '../store/uiSlice';
import { partitionSessions, sessionOneLiner } from '../lib/selectors';
import { displayStatus, SOURCE_LABEL } from '../lib/constants';
import { basename, clock, hashStr, rel } from '../lib/format';
import { AVATAR_COLORS } from '../lib/constants';
import { toolIcon } from '../lib/toolIcon';
import { useNow } from '../hooks/useNow';
import Overlay from './Overlay';
import Icon from './Icon';
import type { Session, ToolEntry } from '../lib/types';

function SessionCard({ s, onJump }: { s: Session; onJump: (id: string) => void }) {
  const st = displayStatus(s);
  const nm = basename(s.cwd);
  const sub = sessionOneLiner(s, st);
  const runningSubs = s.subagents.filter((x) => x.running).length;
  // the last few tool calls, newest first — enough to tell what a session is up to
  const recent: ToolEntry[] = [];
  for (let i = s.timeline.length - 1; i >= 0 && recent.length < 3; i--) {
    const en = s.timeline[i];
    if (en.kind === 'tool') recent.push(en);
  }
  return (
    <button type="button" className={'scard ' + st} onClick={() => onJump(s.id)} aria-label={`Open ${nm} — ${sub}`}>
      <div className="scard-head">
        <span className="sdot" aria-hidden="true"></span>
        <span className="scard-name">{nm}</span>
        {s.source && s.source !== 'claude' && s.source !== 'claude-code' && (
          <span className="ssource">{SOURCE_LABEL[s.source] || s.source}</span>
        )}
        {st === 'waiting' && s.waitingSince ? (
          <span className="scard-age swait" title="Waiting for your input">
            <Icon name="hourglass" size={10} /> {rel(s.waitingSince)}
          </span>
        ) : (
          <span className="scard-age">{rel(s.lastSeen)}</span>
        )}
      </div>
      <div className="scard-sub" title={sub}>
        {sub}
      </div>
      {recent.length > 0 && (
        <ul className="scard-recent" aria-hidden="true">
          {recent.map((en) => (
            <li key={en.id} className={en.ok === false ? 'fail' : en.dur === null ? 'run' : ''}>
              <Icon name={toolIcon(en.name)} size={11} />
              <b>{en.name}</b>
              <span className="mono">{en.detail}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="scard-meta">
        {s.toolCount} tool{s.toolCount === 1 ? '' : 's'}
        {runningSubs ? ` · ${runningSubs} agent${runningSubs === 1 ? '' : 's'} running` : ''}
        {s.failCount ? <span className="bad"> · {s.failCount} failed</span> : ''}
      </div>
    </button>
  );
}

interface FeedRow {
  key: string;
  t: number;
  sessionId: string;
  project: string;
  kind: 'tool' | 'prompt' | 'result';
  name?: string;
  text: string;
  failed?: boolean;
}

// last ~25 entries per live session, merged & sorted — cheap enough to rebuild on every event
function buildFeed(sessions: Record<string, Session>): FeedRow[] {
  const rows: FeedRow[] = [];
  for (const s of Object.values(sessions)) {
    if (displayStatus(s) === 'ended') continue;
    const project = basename(s.cwd);
    for (const en of s.timeline.slice(-25)) {
      if (en.kind === 'tool') {
        rows.push({
          key: s.id + ':' + en.id,
          t: en.t,
          sessionId: s.id,
          project,
          kind: 'tool',
          name: en.name,
          text: en.detail || '',
          failed: en.ok === false,
        });
      } else if (en.kind === 'prompt') {
        rows.push({ key: s.id + ':p:' + en.t, t: en.t, sessionId: s.id, project, kind: 'prompt', text: en.text });
      } else if (en.kind === 'result' && en.hasResult) {
        rows.push({ key: s.id + ':r:' + en.t, t: en.t, sessionId: s.id, project, kind: 'result', text: en.text });
      }
    }
  }
  return rows.sort((a, b) => b.t - a.t).slice(0, 120);
}

export default function GridOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const sessions = useAppSelector((s) => s.sessions.sessions);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<RailStatus>('all');
  const [tab, setTab] = useState<'grid' | 'feed'>('grid');
  const nowSec = Math.floor(useNow() / 1000);

  const { live } = useMemo(
    () => partitionSessions(sessions, query.trim().toLowerCase(), status),
    [sessions, query, status, nowSec],
  );
  const feed = useMemo(() => (tab === 'feed' ? buildFeed(sessions) : []), [sessions, tab, nowSec]);

  const jump = (id: string) => {
    dispatch(selectSession(id));
    onClose();
  };

  return (
    <Overlay open={open} onClose={onClose} label="All sessions">
      <div className="ovbox gridbox">
        <h2>
          <Icon name="grid" size={16} /> All sessions
          <button className="ovclose" aria-label="Close" onClick={onClose}>
            ✕ Close
          </button>
        </h2>
        <div className="ovsub">Every live session at a glance — click a card (or a feed row) to jump to it.</div>
        <div className="utabs" style={{ marginBottom: 12 }}>
          <button className={'utab' + (tab === 'grid' ? ' on' : '')} onClick={() => setTab('grid')}>
            Grid
          </button>
          <button className={'utab' + (tab === 'feed' ? ' on' : '')} onClick={() => setTab('feed')}>
            Activity feed
          </button>
        </div>
        {tab === 'grid' && (
          <div className="gridtoolbar">
            <span className="gridsearch">
              <Icon name="search" size={12} />
              <input
                type="search"
                placeholder="Filter sessions…"
                aria-label="Filter sessions"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </span>
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
                  className={'rail-filter' + (status === key ? ' on' : '')}
                  aria-pressed={status === key}
                  onClick={() => setStatus(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="ovscroll">
          {tab === 'grid' ? (
            live.length ? (
              <div className="scard-grid" role="list">
                {live.map((s) => (
                  <SessionCard key={s.id} s={s} onJump={jump} />
                ))}
              </div>
            ) : (
              <div className="tr-empty">{query || status !== 'all' ? 'No sessions match.' : 'No live sessions.'}</div>
            )
          ) : feed.length ? (
            <div className="feedlist" role="list">
              {feed.map((r, i) => {
                const time = clock(r.t);
                const showTime = i === 0 || clock(feed[i - 1].t) !== time;
                const color = AVATAR_COLORS[hashStr(r.project) % AVATAR_COLORS.length];
                return (
                  <button
                    type="button"
                    key={r.key}
                    className={'feedrow ' + r.kind + (r.failed ? ' fail' : '')}
                    role="listitem"
                    onClick={() => jump(r.sessionId)}
                  >
                    <span className={'tt mono' + (showTime ? '' : ' dup')}>{time}</span>
                    <span className="feedproj" style={{ ['--pc' as string]: color }}>
                      {r.project}
                    </span>
                    <span className="feedicon">
                      <Icon
                        name={r.kind === 'tool' ? toolIcon(r.name || '') : r.kind === 'prompt' ? 'note' : 'check'}
                        size={13}
                      />
                    </span>
                    {r.name ? <span className="feedname">{r.name}</span> : null}
                    <span className={'feedtext' + (r.kind === 'tool' ? ' mono' : '')}>{r.text}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="tr-empty">No recent activity across live sessions.</div>
          )}
        </div>
      </div>
    </Overlay>
  );
}
