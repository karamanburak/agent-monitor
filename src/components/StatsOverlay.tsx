import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { daysLoaded } from '../store/usageSlice';
import { getStats } from '../lib/api';
import { displayStatus, MODEL_COLORS } from '../lib/constants';
import { fmtDur, fmtTokens } from '../lib/format';
import Overlay from './Overlay';
import type { StatsDay } from '../lib/types';

function keyToDayIndex(k: number) {
  const y = Math.floor(k / 10000);
  const m = (Math.floor(k / 100) % 100) as number;
  const d = k % 100;
  return Math.floor(Date.UTC(y, m - 1, d) / 864e5);
}
function todayKey() {
  const t = new Date();
  return t.getFullYear() * 10000 + (t.getMonth() + 1) * 100 + t.getDate();
}

function StatCards() {
  const sessions = useAppSelector((s) => s.sessions.sessions);
  const d = useMemo(() => {
    let live = 0;
    let working = 0;
    let waiting = 0;
    let calls = 0;
    let fails = 0;
    let subs = 0;
    let durSum = 0;
    let durN = 0;
    const byTool = new Map<string, { n: number; fails: number; dur: number; durN: number }>();
    for (const s of Object.values(sessions)) {
      const st = displayStatus(s);
      if (st !== 'ended') live++;
      if (st === 'working') working++;
      else if (st === 'waiting') waiting++;
      subs += s.subagents.length;
      const life = s.lastSeen - s.firstSeen;
      if (life > 0) {
        durSum += life;
        durN++;
      }
      for (const en of s.timeline) {
        if (en.kind !== 'tool') continue;
        calls++;
        const b = byTool.get(en.name) || { n: 0, fails: 0, dur: 0, durN: 0 };
        b.n++;
        if (en.ok === false) {
          b.fails++;
          fails++;
        }
        if (en.dur != null) {
          b.dur += en.dur;
          b.durN++;
        }
        byTool.set(en.name, b);
      }
    }
    return { live, working, waiting, calls, fails, subs, byTool, avgDur: durN ? durSum / durN : 0 };
  }, [sessions]);

  const rate = d.calls ? Math.round((d.fails / d.calls) * 100) : 0;
  const success = d.calls ? 100 - rate : 0;
  const rows = [...d.byTool.entries()]
    .map(([name, b]) => ({ name, n: b.n, fails: b.fails, avg: b.durN ? b.dur / b.durN : 0 }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 40);
  const maxN = Math.max(1, ...rows.map((r) => r.n));
  const card = (n: React.ReactNode, l: string) => (
    <div className="statcard" key={l}>
      <div className="n">{n}</div>
      <div className="l">{l}</div>
    </div>
  );

  return (
    <>
      <div className="statgrid">
        {card(d.live, 'Sessions')}
        {card(d.working, 'Working')}
        {card(d.waiting, 'Needs you')}
        {card(d.calls, 'Tool calls')}
        {card(d.subs, 'Subagents')}
        {card(success + '%', 'Success rate')}
        {card(rate + '%', 'Failure rate')}
        {card(d.avgDur ? fmtDur(d.avgDur) : '–', 'Avg session')}
      </div>
      <div>
        {rows.length ? (
          <table className="tooltbl">
            <thead>
              <tr>
                <th>Tool</th>
                <th className="num">Calls</th>
                <th className="num">Avg</th>
                <th className="num">Fails</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td className="tn">{r.name}</td>
                  <td className="num">{r.n}</td>
                  <td className="num">{r.avg ? fmtDur(r.avg) : '–'}</td>
                  <td className="num">{r.fails || ''}</td>
                  <td>
                    <span
                      className="fbar"
                      style={{
                        width: Math.round((r.n / maxN) * 90) + 'px',
                        background: r.fails ? 'var(--err)' : 'var(--acc)',
                        opacity: r.fails ? 1 : 0.5,
                      }}
                    ></span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="tr-empty" style={{ color: 'var(--mut)' }}>
            No tool calls recorded yet.
          </div>
        )}
      </div>
    </>
  );
}

function UsageCard() {
  const days = useAppSelector((s) => s.usage.days);
  const [tab, setTab] = useState<'overview' | 'models'>('overview');
  const [win, setWin] = useState<'all' | '30' | '7'>('all');

  const windowed = useMemo(() => {
    if (win === 'all') return days;
    const today = keyToDayIndex(todayKey());
    const span = win === '30' ? 29 : 6;
    return days.filter((r) => keyToDayIndex(r.d) >= today - span);
  }, [days, win]);

  return (
    <div className="ucard">
      <div className="uhead">
        <div className="utabs">
          <button className={'utab' + (tab === 'overview' ? ' on' : '')} onClick={() => setTab('overview')}>
            Overview
          </button>
          <button className={'utab' + (tab === 'models' ? ' on' : '')} onClick={() => setTab('models')}>
            Models
          </button>
        </div>
        <div className="uwins">
          {(['all', '30', '7'] as const).map((w) => (
            <button key={w} className={'uwin' + (win === w ? ' on' : '')} onClick={() => setWin(w)}>
              {w === 'all' ? 'All' : w + 'd'}
            </button>
          ))}
        </div>
      </div>
      {tab === 'overview' ? <UsageOverview days={windowed} /> : <UsageModels days={windowed} />}
    </div>
  );
}

function UsageOverview({ days }: { days: StatsDay[] }) {
  const sids = new Set<string>();
  let msgs = 0;
  let total = 0;
  let active = 0;
  const hours = new Array(24).fill(0);
  const models: Record<string, number> = {};
  for (const r of days) {
    r.sids.forEach((s) => {
      sids.add(s);
    });
    msgs += r.msgs;
    total += r.total;
    if (r.total > 0) active++;
    r.hours.forEach((h, i) => {
      hours[i] += h;
    });
    for (const [m, b] of Object.entries(r.byModel)) models[m] = (models[m] || 0) + b.t;
  }
  const activeIdx = days
    .filter((r) => r.total > 0)
    .map((r) => keyToDayIndex(r.d))
    .sort((a, b) => a - b);
  let longest = 0;
  let cur = 0;
  let run = 0;
  let prev: number | null = null;
  for (const idx of activeIdx) {
    run = prev !== null && idx === prev + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = idx;
  }
  if (activeIdx.length) {
    const last = activeIdx[activeIdx.length - 1];
    const today = keyToDayIndex(todayKey());
    if (last >= today - 1) {
      cur = 1;
      for (let i = activeIdx.length - 2; i >= 0; i--) {
        if (activeIdx[i] === activeIdx[i + 1] - 1) cur++;
        else break;
      }
    }
  }
  const peak = hours.indexOf(Math.max(...hours));
  const peakLbl = Math.max(...hours) > 0 ? (peak % 12 || 12) + (peak < 12 ? ' AM' : ' PM') : '–';
  const favModel = Object.entries(models).sort((a, b) => b[1] - a[1])[0];
  const max = Math.max(1, ...days.map((r) => r.total));
  const books = total / 103000;

  const tile = (l: string, n: React.ReactNode) => (
    <div className="utile" key={l}>
      <div className="l">{l}</div>
      <div className="n">{n}</div>
    </div>
  );

  return (
    <div>
      <div className="utiles">
        {tile('Sessions', sids.size)}
        {tile('Messages', msgs.toLocaleString())}
        {tile('Total tokens', fmtTokens(total))}
        {tile('Avg / session', sids.size ? fmtTokens(Math.round(total / sids.size)) : '–')}
        {tile('Active days', active)}
        {tile('Current streak', cur + 'd')}
        {tile('Longest streak', longest + 'd')}
        {tile('Peak hour', peakLbl)}
        {tile('Favorite model', favModel ? favModel[0] : '–')}
      </div>
      <div className="uheat">
        {days.map((r, i) => {
          const f = r.total / max;
          const op = r.total === 0 ? 0 : f > 0.6 ? 1 : f > 0.3 ? 0.75 : f > 0.1 ? 0.5 : 0.3;
          const bg = r.total === 0 ? 'rgba(255,255,255,0.05)' : `rgba(76,141,255,${op})`;
          return <i key={i} style={{ background: bg }} title={`${r.d}: ${fmtTokens(r.total)} tokens`}></i>;
        })}
      </div>
      <div className="ucaption">
        {total > 0
          ? `You've used ~${books >= 10 ? Math.round(books) : books.toFixed(1)}× more tokens than Harry Potter and the Philosopher's Stone.`
          : 'No usage recorded in this window.'}
      </div>
    </div>
  );
}

function UsageModels({ days }: { days: StatsDay[] }) {
  const max = Math.max(1, ...days.map((r) => r.total));
  const fmtD = (k: number) => {
    const m = Math.floor(k / 100) % 100;
    const d = k % 100;
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] + ' ' + d;
  };
  const xs: React.ReactNode[] = [];
  if (days.length) {
    const n = Math.min(6, days.length);
    for (let i = 0; i < n; i++)
      xs.push(<span key={i}>{fmtD(days[Math.round((i * (days.length - 1)) / (n - 1 || 1))].d)}</span>);
  }
  const models: Record<string, { t: number; in: number; out: number }> = {};
  for (const r of days)
    for (const [m, b] of Object.entries(r.byModel)) {
      const t = models[m] || (models[m] = { t: 0, in: 0, out: 0 });
      t.t += b.t;
      t.in += b.in;
      t.out += b.out;
    }
  const grand = Object.values(models).reduce((s, b) => s + b.t, 0) || 1;
  const rows = Object.entries(models).sort((a, b) => b[1].t - a[1].t);

  return (
    <div>
      <div className="uchart">
        <div className="grid">
          {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
            <div className="gline" key={i} style={{ top: (1 - f) * 100 + '%' }}>
              <span className="glabel" style={{ top: 0 }}>
                {fmtTokens(Math.round(max * f))}
              </span>
            </div>
          ))}
        </div>
        <div className="ubars">
          {days.map((r, i) => (
            <span
              key={i}
              className="ubar"
              style={{ height: (r.total / max) * 100 + '%' }}
              title={`${r.d}: ${fmtTokens(r.total)} tokens`}
            ></span>
          ))}
        </div>
      </div>
      <div className="uxaxis">{xs}</div>
      <div className="uleg">
        {rows.length ? (
          rows.map(([m, b], i) => (
            <div className="ulrow" key={m}>
              <span className="dot" style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }}></span>
              <span className="nm">{m}</span>
              <span className="io">
                {fmtTokens(b.in)} in · {fmtTokens(b.out)} out
              </span>
              <span className="pc">{((b.t / grand) * 100).toFixed(1)}%</span>
            </div>
          ))
        ) : (
          <div className="ucaption">No usage recorded in this window.</div>
        )}
      </div>
    </div>
  );
}

export default function StatsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!open) return;
    const load = () =>
      getStats()
        .then((j) => dispatch(daysLoaded(j.days || [])))
        .catch(() => {});
    load();
    const iv = window.setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [open, dispatch]);

  return (
    <Overlay open={open} onClose={onClose} label="Analytics">
      <div className="ovbox statbox">
        <h2>
          📊 Analytics
          <button className="ovclose" aria-label="Close" onClick={onClose}>
            ✕ Close
          </button>
        </h2>
        <div className="ovsub">
          From your local transcripts (<b>this Mac only</b>, nothing external). Live-refreshing.
        </div>
        <div className="ovscroll">
          <UsageCard />
          <StatCards />
        </div>
      </div>
    </Overlay>
  );
}
