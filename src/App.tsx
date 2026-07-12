import { useEffect, useState } from 'react';
import { useAppSelector } from './store/hooks';
import { useEventStream } from './hooks/useEventStream';
import { useTick } from './hooks/useTick';
import { useUsage } from './hooks/useUsage';
import { useAlerts } from './hooks/useAlerts';
import TopBar from './components/TopBar';
import Rail from './components/Rail';
import Detail from './components/Detail';
import Inspector from './components/Inspector';
import StatsOverlay from './components/StatsOverlay';
import HistoryOverlay from './components/HistoryOverlay';
import EmptyState from './components/EmptyState';
import ConnectionBanner from './components/ConnectionBanner';
import type { ToolEntry } from './lib/types';

export default function App() {
  useEventStream();
  useTick();
  const refreshUsage = useUsage();
  const alerts = useAlerts();

  const selectedId = useAppSelector((s) => s.ui.selectedId);
  const session = useAppSelector((s) => (s.ui.selectedId ? s.sessions.sessions[s.ui.selectedId] : undefined));

  const [railHidden, setRailHidden] = useState(() => localStorage.getItem('railh') === '1');
  const [statsOpen, setStatsOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [inspectorEntry, setInspectorEntry] = useState<ToolEntry | null>(null);

  const toggleRail = () => {
    setRailHidden((h) => {
      const next = !h;
      localStorage.setItem('railh', next ? '1' : '0');
      return next;
    });
  };

  // close the inspector when the selected session changes
  useEffect(() => {
    setInspectorEntry(null);
  }, [selectedId]);

  // Esc closes the inspector and any open overlay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setInspectorEntry(null);
      setStatsOpen(false);
      setHistOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <TopBar
        alerts={alerts}
        railHidden={railHidden}
        onToggleRail={toggleRail}
        statsOpen={statsOpen}
        onToggleStats={() => setStatsOpen((v) => !v)}
        histOpen={histOpen}
        onToggleHistory={() => setHistOpen((v) => !v)}
      />
      <ConnectionBanner />
      <div className="shell">
        <Rail onRefreshUsage={refreshUsage} />
        <main className="detail">
          {session ? <Detail key={session.id} session={session} onInspect={setInspectorEntry} /> : <EmptyState />}
        </main>
      </div>
      <Inspector entry={inspectorEntry} onClose={() => setInspectorEntry(null)} />
      <StatsOverlay open={statsOpen} onClose={() => setStatsOpen(false)} />
      <HistoryOverlay open={histOpen} onClose={() => setHistOpen(false)} />
    </>
  );
}
