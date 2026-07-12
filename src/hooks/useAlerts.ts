import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { clearEffects } from '../store/sessionsSlice';
import { selectSession } from '../store/uiSlice';
import { basename, fmtDur } from '../lib/format';
import type { Effect } from '../lib/ingest';

const NOTIF_SUPPORTED = typeof window !== 'undefined' && 'Notification' in window;

export function useAlerts() {
  const dispatch = useAppDispatch();
  const effects = useAppSelector((s) => s.sessions.effects);

  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('sound') === '1');
  const [notifOn, setNotifOn] = useState(
    () => NOTIF_SUPPORTED && Notification.permission === 'granted' && localStorage.getItem('notify') === '1',
  );

  const audioRef = useRef<AudioContext | null>(null);
  const liveNotifs = useRef<Map<string, Notification>>(new Map());

  const playChime = useCallback((freq: number) => {
    if (localStorage.getItem('sound') !== '1') return;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      audioRef.current = audioRef.current || new AC();
      const ctx = audioRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.value = freq || 880;
      const t0 = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      o.start(t0);
      o.stop(t0 + 0.42);
    } catch {
      /* ignore */
    }
  }, []);

  const notifyEnabled = useCallback(
    () => NOTIF_SUPPORTED && Notification.permission === 'granted' && localStorage.getItem('notify') === '1',
    [],
  );

  const dismissNotif = useCallback((id: string) => {
    const n = liveNotifs.current.get(id);
    if (n) {
      n.close();
      liveNotifs.current.delete(id);
    }
  }, []);

  const toggleSound = useCallback(() => {
    const next = soundOn ? '0' : '1';
    localStorage.setItem('sound', next);
    setSoundOn(next === '1');
    if (next === '1') {
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        audioRef.current = audioRef.current || new AC();
        audioRef.current.resume();
      } catch {
        /* ignore */
      }
      playChime(880);
    }
  }, [soundOn, playChime]);

  const toggleNotif = useCallback(async () => {
    if (notifyEnabled()) {
      localStorage.setItem('notify', '0');
      setNotifOn(false);
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      localStorage.setItem('notify', '1');
      setNotifOn(true);
      new Notification('Alerts enabled', {
        body: "You'll get a ping when a session needs your permission or input, or finishes a long task.",
      });
    }
  }, [notifyEnabled]);

  useEffect(() => {
    if (!effects.length) return;
    const consumed = effects.length; // clear only what this snapshot processed
    for (const e of effects as Effect[]) {
      if (e.kind === 'dismiss') {
        dismissNotif(e.sessionId);
      } else if (e.kind === 'needsAttention') {
        playChime(880);
        if (!notifyEnabled() || document.hasFocus()) continue;
        dismissNotif(e.sessionId);
        const n = new Notification(`⏳ ${basename(e.cwd)} needs you`, {
          body: e.waitMsg || 'Claude is waiting for your input',
          tag: e.sessionId,
        });
        n.onclick = () => {
          window.focus();
          dispatch(selectSession(e.sessionId));
          n.close();
        };
        liveNotifs.current.set(e.sessionId, n);
      } else if (e.kind === 'done') {
        if (e.workMs < 60000) continue;
        playChime(560);
        if (!notifyEnabled() || document.hasFocus()) continue;
        dismissNotif(e.sessionId);
        const n = new Notification(`✅ ${basename(e.cwd)} finished`, {
          body: 'Turn done after ' + fmtDur(e.workMs) + ' — ready for review',
          tag: e.sessionId,
        });
        n.onclick = () => {
          window.focus();
          dispatch(selectSession(e.sessionId));
          n.close();
        };
        liveNotifs.current.set(e.sessionId, n);
      }
    }
    dispatch(clearEffects(consumed));
  }, [effects, dispatch, playChime, notifyEnabled, dismissNotif]);

  return { soundOn, notifOn, notifSupported: NOTIF_SUPPORTED, toggleSound, toggleNotif };
}
