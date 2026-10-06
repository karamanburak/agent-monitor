import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  cycleRadio,
  selectSession,
  setRailStatus,
  setViewMode,
  stopRadio,
  toggleRadioPause,
  toggleTokens,
} from '../store/uiSlice';
import { displayStatus } from '../lib/constants';
import { basename } from '../lib/format';
import { partitionSessions, sessionOneLiner } from '../lib/selectors';
import { useTheme } from '../hooks/useTheme';
import Icon from './Icon';

interface Cmd {
  id: string;
  section: 'Sessions' | 'Commands';
  icon?: string; // Icon name (see Icon.tsx)
  dot?: string; // status class for session dots (working/waiting/idle)
  label: string;
  sub?: string;
  keywords: string;
  run: () => void;
}

// every query word must appear somewhere in the command's text
function matches(c: Cmd, words: string[]): boolean {
  if (!words.length) return true;
  const hay = (c.label + ' ' + (c.sub || '') + ' ' + c.keywords).toLowerCase();
  return words.every((w) => hay.includes(w));
}

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenStats: () => void;
  onOpenHistory: () => void;
  onSearchHistory: (q: string) => void;
  onToggleRail: () => void;
  onOpenShortcuts: () => void;
  onOpenGrid: () => void;
  onOpenNotes: () => void;
}

export default function CommandPalette({
  open,
  onClose,
  onOpenStats,
  onOpenHistory,
  onSearchHistory,
  onToggleRail,
  onOpenShortcuts,
  onOpenGrid,
  onOpenNotes,
}: Props) {
  const dispatch = useAppDispatch();
  const sessions = useAppSelector((s) => s.sessions.sessions);
  const { theme, toggle: toggleTheme } = useTheme();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      // focus after the layer mounts
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const cmds = useMemo(() => {
    const out: Cmd[] = [];
    // same triage order as the rail: needs-you first, then most recently active
    const { live } = partitionSessions(sessions, '', 'all');
    for (const s of live.slice(0, 12)) {
      const st = displayStatus(s);
      out.push({
        id: 'session:' + s.id,
        section: 'Sessions',
        dot: st,
        label: basename(s.cwd),
        sub: sessionOneLiner(s, st),
        keywords: (s.cwd || '') + ' ' + (s.prompt || '') + ' session jump go',
        run: () => dispatch(selectSession(s.id)),
      });
    }
    const cmd = (id: string, icon: string, label: string, keywords: string, run: () => void): Cmd => ({
      id,
      section: 'Commands',
      icon,
      label,
      keywords,
      run,
    });
    out.push(
      cmd(
        'theme',
        theme === 'light' ? 'moon' : 'sun',
        `Theme: switch to ${theme === 'light' ? 'dark' : 'light'}`,
        'theme dark light appearance',
        toggleTheme,
      ),
      cmd('view-list', 'list', 'View: Timeline', 'view timeline list detail', () => dispatch(setViewMode('list'))),
      cmd('view-trace', 'gantt', 'View: Trace waterfall', 'view trace waterfall zoom', () =>
        dispatch(setViewMode('trace')),
      ),
      cmd(
        'grid',
        'grid',
        'Open Grid (G)',
        'grid overview cards all sessions activity feed dashboard',
        onOpenGrid,
      ),
      cmd('stats', 'bar-chart', 'Open Stats', 'stats analytics tokens usage overlay', onOpenStats),
      cmd('history', 'history', 'Open History', 'history past sessions replay browse', onOpenHistory),
      cmd('notes', 'note', 'Open Notes (N)', 'notes scratchpad memo todo write', onOpenNotes),
      cmd('rail', 'panel-left', 'Toggle sidebar', 'sidebar rail hide show toggle', onToggleRail),
      cmd('filter-needs', 'hourglass', 'Filter: Needs you', 'filter needs you waiting attention', () =>
        dispatch(setRailStatus('needs')),
      ),
      cmd('filter-working', 'activity', 'Filter: Working', 'filter working active running', () =>
        dispatch(setRailStatus('working')),
      ),
      cmd('filter-failed', 'x-circle', 'Filter: Failed', 'filter failed errors', () =>
        dispatch(setRailStatus('failed')),
      ),
      cmd('filter-all', 'list', 'Filter: All sessions', 'filter all clear reset', () => dispatch(setRailStatus('all'))),
      cmd(
        'radio-next',
        'music',
        'Radio: play / next station (R)',
        'radio music lofi vibe player next play extras',
        () => dispatch(cycleRadio()),
      ),
      cmd('radio-pause', 'pause', 'Radio: play / pause (P)', 'radio music pause play resume extras', () =>
        dispatch(toggleRadioPause()),
      ),
      cmd('radio-stop', 'volume-off', 'Radio: stop & hide (⇧R)', 'radio music stop off mute hide', () =>
        dispatch(stopRadio()),
      ),
      cmd('tokens', 'bar-chart', 'Toggle token usage footer', 'tokens cost usage footer money extras', () =>
        dispatch(toggleTokens()),
      ),
      cmd('shortcuts', 'keyboard', 'Keyboard shortcuts (?)', 'shortcuts keyboard help keys cheatsheet', onOpenShortcuts),
    );
    return out;
  }, [
    sessions,
    theme,
    toggleTheme,
    dispatch,
    onOpenStats,
    onOpenHistory,
    onToggleRail,
    onOpenShortcuts,
    onOpenGrid,
    onOpenNotes,
  ]);

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = useMemo(() => {
    const hit = cmds.filter((c) => matches(c, words));
    // any typed text can always fall through to a deep history search
    if (q.trim())
      hit.push({
        id: 'search-history',
        section: 'Commands',
        icon: 'search',
        label: `Search history for “${q.trim()}”`,
        keywords: '',
        run: () => onSearchHistory(q.trim()),
      });
    return hit;
  }, [cmds, words, q, onSearchHistory]);

  // clamp the cursor when the result set shrinks
  useEffect(() => {
    if (active >= shown.length) setActive(Math.max(0, shown.length - 1));
  }, [shown.length, active]);

  useEffect(() => {
    listRef.current?.querySelector('.cmdk-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const runCmd = (c: Cmd) => {
    onClose();
    c.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (shown[active]) runCmd(shown[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastSection = '';
  return (
    <div
      className="cmdk-layer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="cmdk-input">
          <Icon name="command" size={15} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Jump to a session or run a command…"
            aria-label="Command palette input"
            autoComplete="off"
            spellCheck={false}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="cmdk-list" ref={listRef} role="listbox" aria-label="Results">
          {!shown.length && <div className="cmdk-empty">Nothing matches — try fewer words.</div>}
          {shown.map((c, i) => {
            const header = c.section !== lastSection ? c.section : null;
            lastSection = c.section;
            return (
              <div key={c.id}>
                {header && <div className="cmdk-sec">{header}</div>}
                <button
                  type="button"
                  className={'cmdk-item' + (i === active ? ' active' : '')}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => runCmd(c)}
                >
                  {c.dot ? (
                    <span className={'ck-dot ' + c.dot} aria-hidden="true"></span>
                  ) : (
                    <span className="ck-ico" aria-hidden="true">
                      <Icon name={c.icon || 'list'} size={13} />
                    </span>
                  )}
                  <span className="ck-lbl">{c.label}</span>
                  {c.sub && <span className="ck-sub">{c.sub}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="cmdk-foot">
          <span>
            <kbd>↑↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> select
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
