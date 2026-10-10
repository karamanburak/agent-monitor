import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { cycleRadio, stopRadio, toggleRadioPause } from './store/uiSlice';
import { useEventStream } from './hooks/useEventStream';
import { useTick } from './hooks/useTick';
import { useUsage } from './hooks/useUsage';
import { useAlerts } from './hooks/useAlerts';
import { useUrlState } from './hooks/useUrlState';
import { useHotkeys } from './hooks/useHotkeys';
import { useTerminal } from './hooks/useTerminal';
import TopBar from './components/TopBar';
import Rail from './components/Rail';
import Detail from './components/Detail';
import Inspector from './components/Inspector';
import StatsOverlay from './components/StatsOverlay';
import HistoryOverlay from './components/HistoryOverlay';
import NotesOverlay from './components/NotesOverlay';
import EmptyState from './components/EmptyState';
import ConnectionBanner from './components/ConnectionBanner';
import CommandPalette from './components/CommandPalette';
import ShortcutsOverlay from './components/ShortcutsOverlay';
import GridOverlay from './components/GridOverlay';
import type { ToolEntry } from './lib/types';

export default function App() {
  useEventStream();
  useTick();
  useUrlState();
  const dispatch = useAppDispatch();
  const refreshUsage = useUsage();
  const alerts = useAlerts();
  const term = useTerminal();

  const selectedId = useAppSelector((s) => s.ui.selectedId);
  const session = useAppSelector((s) => (s.ui.selectedId ? s.sessions.sessions[s.ui.selectedId] : undefined));

  const [railHidden, setRailHidden] = useState(() => localStorage.getItem('railh') === '1');
  // ≤700px the rail becomes an off-canvas drawer with its own (non-persisted) open state
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [histQuery, setHistQuery] = useState<string | undefined>(undefined);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [inspectorEntry, setInspectorEntry] = useState<ToolEntry | null>(null);

  const toggleRail = () => {
    if (isNarrow) {
      setMobileRailOpen((v) => !v);
      return;
    }
    setRailHidden((h) => {
      const next = !h;
      localStorage.setItem('railh', next ? '1' : '0');
      return next;
    });
  };

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 700px)');
    const onChange = () => {
      setIsNarrow(mq.matches);
      if (!mq.matches) setMobileRailOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('railopen', isNarrow && mobileRailOpen);
  }, [isNarrow, mobileRailOpen]);

  // close the inspector (and the mobile drawer) when the selected session changes
  useEffect(() => {
    setInspectorEntry(null);
    setMobileRailOpen(false);
  }, [selectedId]);

  // global shortcuts — definitions (and the "?" cheatsheet) live in lib/shortcuts.ts
  useHotkeys({
    palette: () => setPaletteOpen((v) => !v),
    grid: () => setGridOpen((v) => !v),
    notes: () => setNotesOpen((v) => !v),
    terminal: term.supported && session ? () => term.primary(session) : undefined,
    help: () => setShortcutsOpen((v) => !v),
    radioNext: () => dispatch(cycleRadio()),
    radioPause: () => dispatch(toggleRadioPause()),
    radioStop: () => dispatch(stopRadio()),
    close: () => {
      setMobileRailOpen(false);
      setInspectorEntry(null);
      setStatsOpen(false);
      setHistOpen(false);
      setPaletteOpen(false);
      setShortcutsOpen(false);
      setGridOpen(false);
      setNotesOpen(false);
    },
  });

  return (
    <>
      <TopBar
        alerts={alerts}
        railHidden={isNarrow ? !mobileRailOpen : railHidden}
        onToggleRail={toggleRail}
        statsOpen={statsOpen}
        onToggleStats={() => setStatsOpen((v) => !v)}
        histOpen={histOpen}
        onToggleHistory={() => {
          setHistQuery(undefined);
          setHistOpen((v) => !v);
        }}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        gridOpen={gridOpen}
        onToggleGrid={() => setGridOpen((v) => !v)}
        onToggleNotes={() => setNotesOpen((v) => !v)}
      />
      <ConnectionBanner />
      <div className="shell">
        {isNarrow && mobileRailOpen && (
          <div className="rail-scrim" aria-hidden="true" onClick={() => setMobileRailOpen(false)}></div>
        )}
        <Rail onRefreshUsage={refreshUsage} onOpenStats={() => setStatsOpen(true)} />
        <main className="detail">
          {session ? (
            <Detail key={session.id} session={session} onInspect={setInspectorEntry} />
          ) : (
            <EmptyState
              onOpenPalette={() => setPaletteOpen(true)}
              onOpenHistory={() => {
                setHistQuery(undefined);
                setHistOpen(true);
              }}
            />
          )}
        </main>
      </div>
      <Inspector
        entry={inspectorEntry}
        agentType={
          inspectorEntry?.agent ? session?.subagents.find((x) => String(x.id) === inspectorEntry.agent)?.type : undefined
        }
        onClose={() => setInspectorEntry(null)}
      />
      <StatsOverlay open={statsOpen} onClose={() => setStatsOpen(false)} />
      <HistoryOverlay open={histOpen} onClose={() => setHistOpen(false)} initialQuery={histQuery} />
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <GridOverlay open={gridOpen} onClose={() => setGridOpen(false)} />
      <NotesOverlay open={notesOpen} onClose={() => setNotesOpen(false)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenStats={() => setStatsOpen(true)}
        onOpenHistory={() => {
          setHistQuery(undefined);
          setHistOpen(true);
        }}
        onSearchHistory={(q) => {
          setHistQuery(q);
          setHistOpen(true);
        }}
        onToggleRail={toggleRail}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenGrid={() => setGridOpen(true)}
        onOpenNotes={() => setNotesOpen(true)}
      />
    </>
  );
}
