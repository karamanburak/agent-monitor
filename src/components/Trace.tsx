import { useEffect, useReducer, useRef, type JSX } from 'react';
import { useAppSelector } from '../store/hooks';
import { clock, fmtDur, fmtMoney, fmtTokens } from '../lib/format';
import { legendFor } from '../lib/legends';
import { buildTurns } from '../lib/turns';
import { useNow } from '../hooks/useNow';
import type { NoteEntry, PromptEntry, Session, StatusKind, ToolEntry } from '../lib/types';

const TR_LABELW = 126;

function trClampScale(sc: number, trackW: number) {
  return Math.min(trackW / 2000, Math.max(trackW / 86400000, sc));
}
function trNiceStep(msPerTick: number) {
  const steps = [1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 1800000, 3600000, 7200000];
  for (const s of steps) if (s >= msPerTick) return s;
  return 14400000;
}
function trTick(t: number, step: number) {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return step < 60000
    ? `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    : `${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface TraceRef {
  scale: number | null;
  viewStart: number | null;
  manual: boolean;
  minT: number;
  maxT: number;
  trackW: number;
}

export default function Trace({
  session: s,
  st,
  fitKey,
  onInspect,
}: {
  session: Session;
  st: StatusKind;
  fitKey: number;
  onInspect: (e: ToolEntry) => void;
}) {
  const failOnly = useAppSelector((u) => u.ui.failOnly);
  const sessionEntries = useAppSelector((u) => u.usage.sessionEntries);
  const sessionEntriesId = useAppSelector((u) => u.usage.sessionEntriesId);
  const now = useNow();
  const [, force] = useReducer((x) => x + 1, 0);
  const tr = useRef<TraceRef>({ scale: null, viewStart: null, manual: false, minT: 0, maxT: 0, trackW: 200 });
  const elRef = useRef<HTMLDivElement | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    tr.current.manual = false;
    tr.current.scale = null;
    force();
  }, [s.id, fitKey]);

  // native non-passive listeners so wheel/pointer handlers can preventDefault
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const t = tr.current;
      if (!t.scale) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const trackW = Math.max(200, el.clientWidth - TR_LABELW - 14);
        const px = e.clientX - el.getBoundingClientRect().left - TR_LABELW;
        const tAt = (t.viewStart as number) + px / t.scale;
        t.scale = trClampScale(t.scale * Math.exp(-e.deltaY * 0.0018), trackW);
        t.viewStart = tAt - px / t.scale;
        t.manual = true;
        force();
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        t.viewStart = (t.viewStart as number) + e.deltaX / t.scale;
        t.manual = true;
        force();
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const t = tr.current;
      if (e.button !== 0 || !t.scale) return;
      el.setPointerCapture(e.pointerId);
      const target = e.target as HTMLElement;
      const mini = target.closest('.tr-mini') as HTMLElement | null;
      if (mini) {
        const apply = (ev: PointerEvent) => {
          const rect = mini.getBoundingClientRect();
          const frac = Math.min(1, Math.max(0, (ev.clientX - rect.left - TR_LABELW) / t.trackW));
          const tAt = t.minT + frac * (t.maxT - t.minT);
          t.viewStart = tAt - t.trackW / (t.scale as number) / 2;
          t.manual = true;
          force();
        };
        apply(e);
        const move = (ev: PointerEvent) => {
          suppressClick.current = true;
          apply(ev);
        };
        const up = () => {
          el.removeEventListener('pointermove', move);
          setTimeout(() => (suppressClick.current = false), 0);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up, { once: true });
        el.addEventListener('pointercancel', up, { once: true });
        return;
      }
      el.classList.add('panning');
      const startX = e.clientX;
      const startV = t.viewStart as number;
      const move = (ev: PointerEvent) => {
        if (Math.abs(ev.clientX - startX) > 4) suppressClick.current = true;
        t.viewStart = startV - (ev.clientX - startX) / (t.scale as number);
        t.manual = true;
        force();
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.classList.remove('panning');
        setTimeout(() => (suppressClick.current = false), 0);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up, { once: true });
      el.addEventListener('pointercancel', up, { once: true });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onPointerDown);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  const onClick = (e: React.MouseEvent) => {
    if (suppressClick.current) return;
    const barEl = (e.target as HTMLElement).closest('.tr-bar') as HTMLElement | null;
    const tid = barEl?.dataset.tid;
    if (!tid) return;
    const en = s.timeline.find((x) => x.kind === 'tool' && String((x as ToolEntry).id) === tid) as
      | ToolEntry
      | undefined;
    if (en) onInspect(en);
  };

  const tools = s.timeline.filter((en): en is ToolEntry => en.kind === 'tool');
  const prompts = s.timeline.filter((en): en is PromptEntry => en.kind === 'prompt');
  const notes = s.timeline.filter((en): en is NoteEntry => en.kind === 'note');
  const subs = s.subagents.slice(-12);

  // per-turn priced usage bucketed by prompt boundaries, keyed by prompt timestamp
  const costByPromptT: Record<number, { cost: number; tok: number }> = {};
  if (sessionEntriesId === s.id && sessionEntries.length) {
    const turns = buildTurns(s).turns;
    if (turns.length) {
      const bounds = turns.map((t, i) => ({
        t: t.prompt.t,
        start: t.prompt.t,
        end: turns[i + 1] ? turns[i + 1].prompt.t : Infinity,
      }));
      for (const u of sessionEntries) {
        const b = bounds.find((bb) => u.ts >= bb.start && u.ts < bb.end);
        if (!b) continue;
        const c = costByPromptT[b.t] || (costByPromptT[b.t] = { cost: 0, tok: 0 });
        c.cost += u.cost || 0;
        c.tok += (u.in || 0) + (u.out || 0);
      }
    }
  }
  // running tools counted up to now
  const laneBusy = (items: ToolEntry[]) => items.reduce((sum, en) => sum + (en.dur ?? now - en.t), 0);

  let minT = Infinity;
  let maxT = -Infinity;
  for (const en of tools) {
    minT = Math.min(minT, en.t);
    maxT = Math.max(maxT, en.t + (en.dur ?? now - en.t));
  }
  for (const p of prompts) {
    minT = Math.min(minT, p.t);
    maxT = Math.max(maxT, p.t);
  }
  for (const sa of subs) {
    minT = Math.min(minT, sa.started);
    maxT = Math.max(maxT, sa.running ? now : sa.stopped || sa.started);
  }
  if (st === 'working' || st === 'waiting') maxT = Math.max(maxT, now);

  if (!Number.isFinite(minT)) {
    return (
      <div className="trace" ref={elRef} style={{ display: 'block' }}>
        <div className="tr-empty">No tool activity yet in this session.</div>
      </div>
    );
  }

  const trackW = Math.max(200, (elRef.current?.clientWidth || 900) - TR_LABELW - 14);
  const span = Math.max(5000, maxT - minT);
  const t = tr.current;
  t.minT = minT;
  t.maxT = maxT;
  t.trackW = trackW;
  if (!t.manual || !t.scale) {
    t.scale = trClampScale(trackW / (span * 1.05), trackW);
    t.viewStart = minT - span * 0.025;
  }
  const scale = t.scale as number;
  const v0 = t.viewStart as number;
  const v1 = v0 + trackW / scale;
  const x = (tt: number) => TR_LABELW + (tt - v0) * scale;

  const step = trNiceStep(90 / scale);
  const ticks: JSX.Element[] = [];
  const grids: JSX.Element[] = [];
  for (let tt = Math.ceil(v0 / step) * step, k = 0; tt <= v1; tt += step, k++) {
    ticks.push(
      <div className="tick" key={'tk' + k} style={{ left: x(tt).toFixed(1) + 'px' }}>
        {trTick(tt, step)}
      </div>,
    );
    grids.push(<div className="tr-grid" key={'g' + k} style={{ left: x(tt).toFixed(1) + 'px' }}></div>);
  }

  const bands: JSX.Element[] = [];
  notes.forEach((n, i) => {
    const idx = s.timeline.indexOf(n);
    const next = s.timeline.slice(idx + 1).find((e2) => e2.t > n.t);
    const end = next ? next.t : now;
    if (end < v0 || n.t > v1) return;
    const bs = Math.max(n.t, v0);
    bands.push(
      <div
        key={'band' + i}
        className="tr-band"
        style={{
          left: x(bs).toFixed(1) + 'px',
          width: Math.max(2, (Math.min(end, v1) - bs) * scale).toFixed(1) + 'px',
        }}
        title={`Waiting for you — ${n.text}`}
      ></div>,
    );
  });

  const marks: JSX.Element[] = [];
  prompts.forEach((p, i) => {
    if (p.t < v0 || p.t > v1) return;
    marks.push(
      <div key={'mk' + i} className="tr-mark" style={{ left: x(p.t).toFixed(1) + 'px' }} title={`💬 ${p.text}`}></div>,
    );
    const c = costByPromptT[p.t];
    if (c && (c.cost || c.tok))
      marks.push(
        <div
          key={'mc' + i}
          className="tr-turncost"
          style={{ left: (x(p.t) + 3).toFixed(1) + 'px' }}
          title={`This turn ≈ ${fmtMoney(c.cost)} API-equiv · ${fmtTokens(c.tok)} tokens (in+out)`}
        >
          {c.cost ? fmtMoney(c.cost) : ''}
          {c.tok ? <span className="tk">{fmtTokens(c.tok)}</span> : null}
        </div>,
      );
  });

  const nowline =
    (st === 'working' || st === 'waiting') && now >= v0 && now <= v1 ? (
      <div className="tr-now" style={{ left: x(now).toFixed(1) + 'px' }}></div>
    ) : null;

  const ext = Math.max(1, maxT - minT);
  const mmx = (tt: number) => TR_LABELW + ((tt - minT) / ext) * trackW;
  const mmEls: JSX.Element[] = [];
  tools.forEach((en, i) => {
    const l = mmx(en.t);
    const wpx = Math.max(1.5, ((en.dur ?? now - en.t) / ext) * trackW);
    const c = en.ok === false ? 'fail' : en.agent ? 'agent' : '';
    mmEls.push(
      <i
        key={'mi' + i}
        className={c}
        style={{ left: l.toFixed(1) + 'px', width: wpx.toFixed(1) + 'px', top: (en.agent ? 12 : 4) + 'px' }}
      ></i>,
    );
  });
  prompts.forEach((p, i) => {
    mmEls.push(<b key={'mb' + i} style={{ left: mmx(p.t).toFixed(1) + 'px' }}></b>);
  });
  const vwL = Math.max(TR_LABELW, mmx(Math.max(v0, minT)));
  const vwR = Math.min(TR_LABELW + trackW, mmx(Math.min(v1, maxT)));

  const packRows = (items: ToolEntry[]) => {
    const ends: number[] = [];
    const idx: number[] = [];
    for (const en of items) {
      const start = en.t;
      const end = en.t + (en.dur ?? now - en.t);
      let ri = ends.findIndex((e2) => e2 <= start);
      if (ri === -1) {
        if (ends.length >= 6) {
          ri = ends.length - 1;
          ends[ri] = Math.max(ends[ri], end);
        } else {
          ri = ends.length;
          ends.push(end);
        }
      } else ends[ri] = end;
      idx.push(ri);
    }
    return { idx, count: Math.max(1, ends.length) };
  };

  const barEl = (en: ToolEntry, row: number, rows: number, key: string) => {
    const end = en.t + (en.dur ?? now - en.t);
    if (end < v0 || en.t > v1) return null;
    const bs = Math.max(en.t, v0);
    const be = Math.min(end, v1);
    const w = Math.max(3, (be - bs) * scale);
    const multi = rows > 1;
    const top = multi ? 5 + row * 17 : 6.5;
    const h = multi ? 13 : 15;
    const cls =
      'tr-bar' +
      (multi ? ' slim' : '') +
      (en.agent ? ' agentbar' : '') +
      (en.ok === false ? ' fail' : '') +
      (en.dur === null ? ' run' : '');
    const tip = `${en.name}${en.detail ? ' — ' + en.detail : ''} · ${
      en.dur === null ? 'running' : (en.ok === false ? 'failed · ' : '') + fmtDur(en.dur)
    } · ${clock(en.t)} — click for details`;
    const style: React.CSSProperties = {
      left: x(bs).toFixed(1) + 'px',
      width: w.toFixed(1) + 'px',
      top: top + 'px',
      height: h + 'px',
    };
    if (en.dur === null) style.animationDelay = `-${now % 1200}ms`;
    return (
      <div className={cls} key={key} data-tid={String(en.id)} style={style} title={tip}>
        {w > 44 ? <span>{en.name}</span> : null}
      </div>
    );
  };

  const lane = (label: JSX.Element, items: ToolEntry[], extra: JSX.Element | null, laneKey: string) => {
    const pack = packRows(items);
    const H = pack.count === 1 ? 28 : 10 + pack.count * 17;
    return (
      <div className="tr-lane" key={laneKey} style={{ height: H + 'px' }}>
        {label}
        {extra}
        {items.map((en, i) => barEl(en, pack.idx[i], pack.count, laneKey + ':' + i))}
      </div>
    );
  };

  const mainTools = tools.filter((en) => !en.agent);
  const mainBusy = laneBusy(mainTools);
  const lanes: JSX.Element[] = [
    lane(
      <div className="tr-label" title={`Main agent · ${fmtDur(mainBusy)} busy`}>
        Main
        {mainBusy ? <span className="tr-lbldur">{fmtDur(mainBusy)}</span> : null}
      </div>,
      mainTools,
      null,
      'main',
    ),
  ];
  for (const sa of subs) {
    const leg = legendFor(sa.id);
    const saTools = tools.filter((en) => en.agent === sa.id);
    const saBusy = laneBusy(saTools);
    const lifeEnd = sa.running ? now : sa.stopped || sa.started;
    let life: JSX.Element | null = null;
    if (lifeEnd >= v0 && sa.started <= v1) {
      const ls = Math.max(sa.started, v0);
      life = (
        <div
          className="tr-life"
          style={{
            left: x(ls).toFixed(1) + 'px',
            width: Math.max(2, (Math.min(lifeEnd, v1) - ls) * scale).toFixed(1) + 'px',
          }}
        ></div>
      );
    }
    lanes.push(
      lane(
        <div
          className={'tr-label' + (sa.running ? ' live' : '')}
          title={`${leg.f} · ${sa.type} · ${fmtDur(saBusy)} busy`}
        >
          {leg.e} {leg.f.split(' ').pop()}
          {saBusy ? <span className="tr-lbldur">{fmtDur(saBusy)}</span> : null}
        </div>,
        saTools,
        life,
        'sa:' + sa.id,
      ),
    );
  }

  return (
    <div className={'trace' + (failOnly ? ' failonly' : '')} ref={elRef} style={{ display: 'block' }} onClick={onClick}>
      <div className="tr-scroll">
        <div className="tr-inner">
          <div className="tr-axis">{ticks}</div>
          <div className="tr-mini">
            <span className="mlabel">overview</span>
            {mmEls}
            <div
              className="mview"
              style={{ left: vwL.toFixed(1) + 'px', width: Math.max(6, vwR - vwL).toFixed(1) + 'px' }}
            ></div>
          </div>
          {grids}
          {bands}
          {marks}
          {lanes}
          {nowline}
        </div>
      </div>
    </div>
  );
}
