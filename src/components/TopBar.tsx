import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectSession } from '../store/uiSlice';
import { displayStatus } from '../lib/constants';
import { basename, rel } from '../lib/format';
import { waitingQueue } from '../lib/selectors';
import { useNow } from '../hooks/useNow';
import Icon from './Icon';
import SettingsMenu from './SettingsMenu';
import type { useAlerts } from '../hooks/useAlerts';

interface Props {
  alerts: ReturnType<typeof useAlerts>;
  railHidden: boolean;
  onToggleRail: () => void;
  statsOpen: boolean;
  onToggleStats: () => void;
  histOpen: boolean;
  onToggleHistory: () => void;
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
  gridOpen: boolean;
  onToggleGrid: () => void;
  onToggleNotes: () => void;
}

function useFavicon() {
  const lastRef = useRef<string | undefined>(undefined);
  const linkRef = useRef<HTMLLinkElement | null>(null);
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
    linkRef.current = link;
    return () => {
      link.remove();
    };
  }, []);
  return (state: 'waiting' | 'working' | '') => {
    if (lastRef.current === state) return;
    lastRef.current = state;
    // the favicon is a data: URL, so CSS vars can't reach it — resolve the theme's status colors now
    const cs = getComputedStyle(document.documentElement);
    const color =
      state === 'waiting'
        ? cs.getPropertyValue('--status-waiting').trim()
        : state === 'working'
          ? cs.getPropertyValue('--status-working').trim()
          : null;
    const dot = color ? `<circle cx='52' cy='12' r='11' fill='${color}'/>` : '';
    if (linkRef.current)
      linkRef.current.href =
        'data:image/svg+xml,' +
        encodeURIComponent(
          `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><text x='32' y='46' font-size='42' text-anchor='middle'>📡</text>${dot}</svg>`,
        );
  };
}

export default function TopBar({
  alerts,
  railHidden,
  onToggleRail,
  onToggleStats,
  onToggleHistory,
  onOpenPalette,
  onOpenShortcuts,
  gridOpen,
  onToggleGrid,
  onToggleNotes,
}: Props) {
  const dispatch = useAppDispatch();
  const sessions = useAppSelector((s) => s.sessions.sessions);
  const selectedId = useAppSelector((s) => s.ui.selectedId);
  const setFavicon = useFavicon();
  const [queueOpen, setQueueOpen] = useState(false);
  const queueRef = useRef<HTMLDivElement | null>(null);
  // 1s ticker (bucketed to whole seconds) so wall-clock-decaying status/spark keep advancing
  const nowSec = Math.floor(useNow() / 1000);

  const queue = useMemo(() => waitingQueue(sessions), [sessions, nowSec]);

  useEffect(() => {
    if (!queueOpen) return;
    const onDown = (e: MouseEvent) => {
      if (queueRef.current && !queueRef.current.contains(e.target as Node)) setQueueOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQueueOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [queueOpen]);

  // close the queue when nothing is waiting anymore
  useEffect(() => {
    if (!queue.length) setQueueOpen(false);
  }, [queue.length]);

  const { working, waiting } = useMemo(() => {
    let w = 0;
    let n = 0;
    for (const s of Object.values(sessions)) {
      const ds = displayStatus(s);
      if (ds === 'working') w++;
      else if (ds === 'waiting') n++;
    }
    return { working: w, waiting: n };
  }, [sessions, nowSec]);

  useEffect(() => {
    document.body.classList.toggle('active', working > 0);
    document.title =
      waiting > 0
        ? `⏳ ${waiting} need${waiting === 1 ? 's' : ''} you — Agent Monitor`
        : working > 0
          ? `● ${working} working — Agent Monitor`
          : 'Claude Agent Monitor';
    setFavicon(waiting > 0 ? 'waiting' : working > 0 ? 'working' : '');
  }, [working, waiting, setFavicon]);

  useEffect(() => {
    document.body.classList.toggle('railhidden', railHidden);
  }, [railHidden]);

  const cyclePill = (status: 'working' | 'waiting') => {
    const w = Object.values(sessions)
      .filter((s) => displayStatus(s) === status)
      .sort((a, b) => b.lastSeen - a.lastSeen);
    if (!w.length) return;
    const i = w.findIndex((s) => s.id === selectedId);
    dispatch(selectSession(w[(i + 1) % w.length].id));
  };

  return (
    <header className="topbar">
      <button
        className="tbtn tbtn-icon tbtn-quiet"
        id="rail-toggle"
        title={railHidden ? 'Show sidebar' : 'Hide sidebar'}
        aria-label={railHidden ? 'Show sidebar' : 'Hide sidebar'}
        onClick={onToggleRail}
      >
        <Icon name="panel-left" size={15} />
      </button>
      <span className="mark" aria-hidden="true"></span>
      <h1>Agent Monitor</h1>
      <button
        className={'pill working' + (working > 0 ? ' show' : '')}
        title="Working sessions"
        onClick={() => cyclePill('working')}
      >
        <span className="pdot" aria-hidden="true"></span>
        <span>{working} working</span>
      </button>
      <div className="needswrap" ref={queueRef}>
        <button
          className={'pill needs' + (waiting > 0 ? ' show' : '')}
          title={waiting > 1 ? 'Open the needs-you queue' : 'Jump to the session that needs you'}
          aria-haspopup={waiting > 1 ? 'menu' : undefined}
          aria-expanded={waiting > 1 ? queueOpen : undefined}
          onClick={() => {
            // one waiting session: jump straight to it; more: open the triage queue
            if (queue.length <= 1) {
              setQueueOpen(false);
              cyclePill('waiting');
            } else setQueueOpen((v) => !v);
          }}
        >
          <span className="pdot" aria-hidden="true"></span>
          <span>
            {waiting} need{waiting === 1 ? 's' : ''} you
          </span>
        </button>
        {queueOpen && queue.length > 1 && (
          <div className="needsmenu" role="menu" aria-label="Sessions waiting for you, longest first">
            {queue.map((s) => (
              <button
                key={s.id}
                className="needsitem"
                role="menuitem"
                onClick={() => {
                  setQueueOpen(false);
                  dispatch(selectSession(s.id));
                }}
              >
                <span className="ni-name">{basename(s.cwd)}</span>
                <span className="ni-wait">
                  <Icon name="hourglass" size={10} /> {rel(s.waitingSince || s.lastSeen)}
                </span>
                <span className="ni-msg">{s.waitMsg || 'Needs your input'}</span>
              </button>
            ))}
            <div className="sethint">Longest-waiting first — click to jump.</div>
          </div>
        )}
      </div>
      <div className="top-right">
        <button
          className="tbtn cmdkbtn"
          title="Jump to a session or run a command"
          aria-label="Open command palette"
          aria-haspopup="dialog"
          onClick={onOpenPalette}
        >
          <Icon name="search" size={13} />
          <span className="lbl">Search</span>
          <kbd>{/Mac|iP/.test(navigator.platform) ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
        <button
          className={'tbtn tbtn-quiet' + (gridOpen ? ' on' : '')}
          title="All live sessions as cards, plus a cross-session activity feed (G)"
          aria-label="Grid"
          aria-haspopup="dialog"
          aria-pressed={gridOpen}
          onClick={onToggleGrid}
        >
          <Icon name="grid" size={13} /> <span className="lbl">Grid</span>
        </button>
        <button
          className="tbtn tbtn-quiet"
          title="Session & tool analytics"
          aria-label="Stats"
          aria-haspopup="dialog"
          onClick={onToggleStats}
        >
          <Icon name="bar-chart" /> <span className="lbl">Stats</span>
        </button>
        <button
          className="tbtn tbtn-quiet"
          title="Browse & replay past sessions from the log"
          aria-label="History"
          aria-haspopup="dialog"
          onClick={onToggleHistory}
        >
          <Icon name="history" /> <span className="lbl">History</span>
        </button>
        <SettingsMenu alerts={alerts} onOpenShortcuts={onOpenShortcuts} onOpenNotes={onToggleNotes} />
      </div>
    </header>
  );
}
