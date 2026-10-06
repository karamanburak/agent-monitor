import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { toggleRadio, toggleTokens } from '../store/uiSlice';
import { useTheme } from '../hooks/useTheme';
import Icon from './Icon';
import type { useAlerts } from '../hooks/useAlerts';

export default function SettingsMenu({
  alerts,
  onOpenShortcuts,
  onOpenNotes,
}: {
  alerts: ReturnType<typeof useAlerts>;
  onOpenShortcuts: () => void;
  onOpenNotes: () => void;
}) {
  const { theme, toggle: toggleTheme } = useTheme();
  const dispatch = useAppDispatch();
  const showRadio = useAppSelector((s) => s.ui.showRadio);
  const showTokens = useAppSelector((s) => s.ui.showTokens);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const anyAlert = alerts.soundOn || alerts.notifOn;

  const Toggle = ({ on }: { on: boolean }) => (
    <span className={'si-toggle' + (on ? ' on' : '')} aria-hidden="true">
      {on ? 'On' : 'Off'}
    </span>
  );

  return (
    <div className="setwrap" ref={wrapRef}>
      <button
        className={'tbtn tbtn-icon' + (anyAlert ? ' has-alert' : '')}
        title="Settings — theme, alerts & extras"
        aria-label="Settings"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="sliders" size={15} />
      </button>
      {open && (
        <div className="setmenu" role="menu" aria-label="Settings">
          <button className="setitem" role="menuitem" onClick={toggleTheme}>
            <span className="si-ico" aria-hidden="true">
              <Icon name={theme === 'light' ? 'sun' : 'moon'} />
            </span>
            <span className="si-lbl">Theme</span>
            <span className="si-val">{theme === 'light' ? 'Light' : 'Dark'}</span>
          </button>
          <button
            className="setitem"
            role="menuitemcheckbox"
            aria-checked={alerts.soundOn}
            onClick={alerts.toggleSound}
          >
            <span className="si-ico" aria-hidden="true">
              <Icon name={alerts.soundOn ? 'volume-on' : 'volume-off'} />
            </span>
            <span className="si-lbl">Sound</span>
            <Toggle on={alerts.soundOn} />
          </button>
          {alerts.notifSupported && (
            <button
              className="setitem"
              role="menuitemcheckbox"
              aria-checked={alerts.notifOn}
              onClick={alerts.toggleNotif}
            >
              <span className="si-ico" aria-hidden="true">
                <Icon name="bell" />
              </span>
              <span className="si-lbl">Desktop alerts</span>
              <Toggle on={alerts.notifOn} />
            </button>
          )}
          <button
            className="setitem"
            role="menuitemcheckbox"
            aria-checked={showTokens}
            onClick={() => dispatch(toggleTokens())}
          >
            <span className="si-ico" aria-hidden="true">
              <Icon name="bar-chart" />
            </span>
            <span className="si-lbl">Token usage footer</span>
            <Toggle on={showTokens} />
          </button>
          <button
            className="setitem"
            role="menuitemcheckbox"
            aria-checked={showRadio}
            onClick={() => dispatch(toggleRadio())}
          >
            <span className="si-ico" aria-hidden="true">
              <Icon name="music" />
            </span>
            <span className="si-lbl">Radio player</span>
            <Toggle on={showRadio} />
          </button>
          <button
            className="setitem"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenShortcuts();
            }}
          >
            <span className="si-ico" aria-hidden="true">
              <Icon name="keyboard" />
            </span>
            <span className="si-lbl">Keyboard shortcuts</span>
            <span className="si-val">?</span>
          </button>
          <button
            className="setitem"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenNotes();
            }}
          >
            <span className="si-ico" aria-hidden="true">
              <Icon name="note" />
            </span>
            <span className="si-lbl">Notes scratchpad</span>
            <span className="si-val">N</span>
          </button>
          <div className="sethint">Alerts fire when a session needs you or finishes a long task.</div>
        </div>
      )}
    </div>
  );
}
