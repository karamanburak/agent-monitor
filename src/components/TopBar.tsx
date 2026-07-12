import { useEffect, useMemo, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectSession } from '../store/uiSlice';
import { displayStatus } from '../lib/constants';
import { useNow } from '../hooks/useNow';
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
    const color = state === 'waiting' ? '#d29922' : state === 'working' ? '#3fb950' : null;
    const dot = color ? `<circle cx='52' cy='12' r='11' fill='${color}'/>` : '';
    if (linkRef.current)
      linkRef.current.href =
        'data:image/svg+xml,' +
        encodeURIComponent(
          `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><text x='32' y='46' font-size='42' text-anchor='middle'>📡</text>${dot}</svg>`,
        );
  };
}

export default function TopBar({ alerts, railHidden, onToggleRail, onToggleStats, onToggleHistory }: Props) {
  const dispatch = useAppDispatch();
  const sessions = useAppSelector((s) => s.sessions.sessions);
  const eventTimes = useAppSelector((s) => s.sessions.eventTimes);
  const connected = useAppSelector((s) => s.ui.connected);
  const selectedId = useAppSelector((s) => s.ui.selectedId);
  const setFavicon = useFavicon();
  // 1s ticker (bucketed to whole seconds) so wall-clock-decaying status/spark keep advancing
  const nowSec = Math.floor(useNow() / 1000);

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

  const buckets = useMemo(() => {
    const now = nowSec * 1000;
    const b = new Array(12).fill(0);
    for (const t of eventTimes) {
      const i = Math.floor((now - t) / 5000);
      if (i >= 0 && i < 12) b[11 - i]++;
    }
    return b;
  }, [eventTimes, nowSec]);
  const sparkMax = Math.max(1, ...buckets);

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
        className="tbtn"
        id="rail-toggle"
        title={railHidden ? 'Show sidebar' : 'Hide sidebar'}
        aria-label={railHidden ? 'Show sidebar' : 'Hide sidebar'}
        onClick={onToggleRail}
      >
        {railHidden ? '◨' : '◧'}
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
      <button
        className={'pill needs' + (waiting > 0 ? ' show' : '')}
        title="Jump to a session that needs you"
        onClick={() => cyclePill('waiting')}
      >
        <span className="pdot" aria-hidden="true"></span>
        <span>
          {waiting} need{waiting === 1 ? 's' : ''} you
        </span>
      </button>
      <div className="top-right">
        <div className="spark" title="Events — last 60s" role="img" aria-label="Event activity, last 60 seconds">
          {buckets.map((v, i) => (
            <i
              key={i}
              className={v > 0 ? 'lit' : ''}
              style={{ height: Math.max(8, Math.round((v / sparkMax) * 100)) + '%' }}
            />
          ))}
        </div>
        <button className="tbtn" title="Session & tool analytics" aria-haspopup="dialog" onClick={onToggleStats}>
          📊 Stats
        </button>
        <button
          className="tbtn"
          title="Browse & replay past sessions from the log"
          aria-haspopup="dialog"
          onClick={onToggleHistory}
        >
          🕓 History
        </button>
        <SettingsMenu alerts={alerts} />
        <span className={'conn' + (connected ? ' on' : '')} role="status" aria-live="polite">
          {connected ? 'live' : 'reconnecting'}
        </span>
      </div>
    </header>
  );
}
