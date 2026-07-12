import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import type { useAlerts } from '../hooks/useAlerts';

export default function SettingsMenu({ alerts }: { alerts: ReturnType<typeof useAlerts> }) {
  const { theme, toggle: toggleTheme } = useTheme();
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

  return (
    <div className="setwrap" ref={wrapRef}>
      <button
        className={'tbtn tbtn-icon' + (anyAlert ? ' has-alert' : '')}
        title="Settings — theme, sound & alerts"
        aria-label="Settings"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⚙
      </button>
      {open && (
        <div className="setmenu" role="menu" aria-label="Settings">
          <button className="setitem" role="menuitem" onClick={toggleTheme}>
            <span className="si-ico" aria-hidden="true">
              {theme === 'light' ? '☀️' : '🌙'}
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
              {alerts.soundOn ? '🔊' : '🔈'}
            </span>
            <span className="si-lbl">Sound</span>
            <span className={'si-toggle' + (alerts.soundOn ? ' on' : '')} aria-hidden="true">
              {alerts.soundOn ? 'On' : 'Off'}
            </span>
          </button>
          {alerts.notifSupported && (
            <button
              className="setitem"
              role="menuitemcheckbox"
              aria-checked={alerts.notifOn}
              onClick={alerts.toggleNotif}
            >
              <span className="si-ico" aria-hidden="true">
                🔔
              </span>
              <span className="si-lbl">Desktop alerts</span>
              <span className={'si-toggle' + (alerts.notifOn ? ' on' : '')} aria-hidden="true">
                {alerts.notifOn ? 'On' : 'Off'}
              </span>
            </button>
          )}
          <div className="sethint">Alerts fire when a session needs you or finishes a long task.</div>
        </div>
      )}
    </div>
  );
}
