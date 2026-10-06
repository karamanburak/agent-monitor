import { Fragment, useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setRadioStation, toggleRadioPause } from '../store/uiSlice';
import { RADIO_STATIONS } from '../lib/constants';
import Icon from './Icon';

const clampH = (h: number) => Math.min(480, Math.max(90, h));

// tiny 3-bar equalizer — the sole "playing" indicator (animates only while actually playing)
function Eq({ paused }: { paused: boolean }) {
  return (
    <span className={'req' + (paused ? ' paused' : '')} aria-hidden="true">
      <i></i>
      <i></i>
      <i></i>
    </span>
  );
}

// A one-line now-playing strip; the station list lives in a popover that opens
// upward over the session list, so the rail's vertical space stays with sessions.
// Never auto-plays on refresh: prefs are restored but the station is not
// (the station lives in the store so the global R / Shift+R shortcuts can drive it)
export default function Radio() {
  const dispatch = useAppDispatch();
  const current = useAppSelector((s) => s.ui.radioStation);
  const paused = useAppSelector((s) => s.ui.radioPaused);
  const [open, setOpen] = useState(false);
  // radio first: audio-only by default, the video frame is an opt-in
  const [video, setVideoState] = useState(() => localStorage.getItem('radiovideo') === '1');
  const setVideo = (on: boolean) => {
    setVideoState(on);
    localStorage.setItem('radiovideo', on ? '1' : '0');
  };
  const root = useRef<HTMLDivElement | null>(null);
  const grip = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const savedH = +(localStorage.getItem('radioh') || 0);
    if (savedH) document.documentElement.style.setProperty('--rph', clampH(savedH) + 'px');
  }, []);

  // the popover closes on outside click or Escape, like any transient menu
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // P toggles this without touching the iframe's src, so playback resumes exactly where it
  // left off instead of reloading the stream (YouTube's lightweight postMessage command API,
  // enabled via enablejsapi=1 below — no external script, no network call besides the embed itself)
  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !current) return;
    win.postMessage(JSON.stringify({ event: 'command', func: paused ? 'pauseVideo' : 'playVideo', args: [] }), '*');
  }, [paused, current]);

  // same for direct-stream stations, via the plain <audio> element
  // (station changes remount the element with autoPlay, so only `paused` matters here)
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (paused) a.pause();
    else a.play().catch(() => {});
  }, [paused]);

  // clicking the active station stops it
  const play = (id: string) => {
    dispatch(setRadioStation(id === current ? null : id));
    setOpen(false);
  };

  const onGripDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const g = e.currentTarget as HTMLElement;
    g.setPointerCapture(e.pointerId);
    g.classList.add('drag');
    document.body.classList.add('rowdragging');
    const frame = g.parentElement?.querySelector('.rpframe') as HTMLElement | null;
    const startY = e.clientY;
    const startH = frame ? frame.getBoundingClientRect().height : 160;
    let h = startH;
    const move = (ev: PointerEvent) => {
      // the grip sits above the frame, so dragging up grows it
      h = clampH(startH - (ev.clientY - startY));
      document.documentElement.style.setProperty('--rph', h + 'px');
    };
    const up = () => {
      g.removeEventListener('pointermove', move);
      g.removeEventListener('pointerup', up);
      g.classList.remove('drag');
      document.body.classList.remove('rowdragging');
      localStorage.setItem('radioh', String(Math.round(h)));
    };
    g.addEventListener('pointermove', move);
    g.addEventListener('pointerup', up);
  };

  const cur = RADIO_STATIONS.find((s) => s.id === current) || null;

  return (
    <div className={'rail-radio' + (cur ? ' playing' : '')} ref={root}>
      {open && (
        <div className="rpop" role="group" aria-label="Stations">
          {cur && (
            <div className="rpop-now">
              <span className="rpop-title">{cur.title}</span>
              <a
                className="rpbtn"
                href={cur.yt ? 'https://www.youtube.com/watch?v=' + cur.yt : cur.home || cur.src}
                target="_blank"
                rel="noopener"
                title={cur.yt ? 'Open in YouTube' : 'Open the station site'}
              >
                ↗
              </a>
            </div>
          )}
          <div className="rlist">
            {RADIO_STATIONS.map((s) => {
              const active = s.id === current;
              return (
                <Fragment key={s.id}>
                  {s.group && <span className="rgrp">{s.group}</span>}
                  <button
                    className={'rrow' + (active ? ' active' : '')}
                    title={active ? 'Stop' : s.hint}
                    aria-pressed={active}
                    onClick={() => play(s.id)}
                  >
                    <span className="rname">{s.label}</span>
                    {active ? (
                      <Eq paused={paused} />
                    ) : (
                      <span className="rgo" aria-hidden="true">
                        <Icon name="play" size={10} />
                      </span>
                    )}
                  </button>
                </Fragment>
              );
            })}
          </div>
        </div>
      )}
      {/* the iframe/audio stay mounted while a station plays, so sound survives video-off */}
      <div className={'rplayer' + (cur?.yt && video ? '' : ' audio')} hidden={!cur}>
        {cur?.yt && video && <div className="rpresize" ref={grip} title="Drag to resize" onPointerDown={onGripDown}></div>}
        <div className="rpframe">
          {cur?.yt && (
            <iframe
              ref={iframeRef}
              title={cur.title + ' — live stream'}
              src={
                'https://www.youtube.com/embed/' +
                cur.yt +
                '?autoplay=1&rel=0&enablejsapi=1&origin=' +
                encodeURIComponent(window.location.origin)
              }
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          )}
        </div>
        {cur?.src && (
          // biome-ignore lint/a11y/useMediaCaption: live radio streams carry no caption track
          <audio ref={audioRef} src={cur.src} autoPlay />
        )}
      </div>
      <div className="rstrip">
        <button
          type="button"
          className="rstrip-main"
          aria-expanded={open}
          aria-haspopup="true"
          title={cur ? cur.hint : 'Choose a station'}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name="music" size={12} />
          <span className="rstrip-name">{cur ? cur.label : 'Radio'}</span>
          {cur && <Eq paused={paused} />}
          <span className="rstrip-chev" aria-hidden="true">
            {open ? '▾' : '▴'}
          </span>
        </button>
        {cur?.yt && (
          <button
            className="rpbtn"
            title={video ? 'Hide video — keep listening' : 'Show video'}
            aria-pressed={video}
            onClick={() => setVideo(!video)}
          >
            📺
          </button>
        )}
        {cur && (
          <button
            className="rpbtn"
            title={paused ? 'Play (P)' : 'Pause (P)'}
            aria-label={paused ? 'Play' : 'Pause'}
            onClick={() => dispatch(toggleRadioPause())}
          >
            <Icon name={paused ? 'play' : 'pause'} size={11} />
          </button>
        )}
        {cur && (
          <button className="rpbtn" title="Stop (Shift+R)" onClick={() => current && play(current)}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
