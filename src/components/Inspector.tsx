import { useEffect, useRef } from 'react';
import { clock, fmtDur, lineDiff } from '../lib/format';
import { agentDisplay } from '../lib/legends';
import { useToast } from './Toast';
import Icon from './Icon';
import type { EditPart, ToolEntry } from '../lib/types';

function Diff({ edits }: { edits: EditPart[] }) {
  const sign = { add: '+', del: '-', ctx: ' ' } as const;
  return (
    <>
      {edits.map((ed, i) => {
        const rows = lineDiff(ed.old, ed.new);
        const shown = rows.slice(0, 80);
        const more = rows.length - shown.length;
        return (
          <div className="idiff" key={i}>
            {ed.file && <div className="hsep">{ed.file}</div>}
            {shown.map((r, j) => (
              <span className={'dl ' + r.t} key={j}>
                {sign[r.t]} {r.s}
              </span>
            ))}
            {more > 0 && <span className="dl ctx">… {more} more lines</span>}
          </div>
        );
      })}
    </>
  );
}

// a helper drawer, not a takeover: cap at ~2/3 of the viewport (960px on wide screens)
const clampInspW = (w: number) => Math.max(340, Math.min(Math.min(Math.round(window.innerWidth * 0.65), 960), w));

export default function Inspector({
  entry,
  agentType,
  onClose,
}: {
  entry: ToolEntry | null;
  agentType?: string;
  onClose: () => void;
}) {
  const { copyText } = useToast();
  const wRef = useRef(0);

  // on wide screens the detail pane makes room for the drawer instead of sitting under it
  useEffect(() => {
    document.body.classList.toggle('inspopen', !!entry);
    return () => document.body.classList.remove('inspopen');
  }, [entry]);

  // restore the last dragged width (mirrors the rail's persisted --railw)
  useEffect(() => {
    const saved = +(localStorage.getItem('inspw') || 0);
    if (saved) document.documentElement.style.setProperty('--inspw', clampInspW(saved) + 'px');
  }, []);

  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const grip = e.currentTarget as HTMLElement;
    grip.setPointerCapture(e.pointerId);
    grip.classList.add('drag');
    document.body.classList.add('dragging');
    const move = (ev: PointerEvent) => {
      wRef.current = clampInspW(window.innerWidth - ev.clientX);
      document.documentElement.style.setProperty('--inspw', wRef.current + 'px');
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.classList.remove('drag');
      document.body.classList.remove('dragging');
      if (wRef.current) localStorage.setItem('inspw', String(wRef.current));
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
  };

  const onResizeReset = () => {
    wRef.current = 0;
    document.documentElement.style.removeProperty('--inspw');
    localStorage.removeItem('inspw');
  };

  const en = entry;
  const who = en?.agent ? agentDisplay(agentType, en.agent) : 'Main agent';
  // sub-second durations read as "<1s" here (the drawer is where exact timing is looked for)
  const dur = en && en.dur !== null ? (en.dur < 1000 ? '<1s' : fmtDur(en.dur)) : '';
  const status = en ? (en.dur === null ? 'running…' : (en.ok === false ? 'failed · ' : '') + dur) : '';
  const hasDiff = !!en?.edits?.length;

  return (
    <aside className={'inspector' + (en ? ' open' : '')} aria-label="Tool call details">
      <div
        className="insp-resize"
        title="Drag to resize · double-click to reset"
        onPointerDown={onResizeDown}
        onDoubleClick={onResizeReset}
      ></div>
      <div className="insp-head">
        <span className="insp-title">
          {en?.name}{' '}
          <span
            className={'pd' + (en?.ok === false ? ' bad' : '')}
            style={{ color: 'var(--mut)', fontWeight: 400, fontSize: 'var(--fs-xs)' }}
          >
            {status}
          </span>
        </span>
        <button className="insp-close" title="Close (Esc)" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="insp-body">
        {en && (
          <>
            <div className="pmeta">
              {who} · started {clock(en.t)}
            </div>
            {hasDiff ? (
              <div className="isec">
                <div className="ilabel">Change</div>
                <Diff edits={en.edits!} />
              </div>
            ) : (
              en.inStr && (
                <div className="isec">
                  <div className="ilabel">
                    Input
                    <button className="icopy" onClick={() => copyText(en.inStr, 'Input')}>
                      <Icon name="copy" size={10} /> copy
                    </button>
                  </div>
                  <pre className="ibox">{en.inStr}</pre>
                </div>
              )
            )}
            {en.outStr && (
              <div className="isec">
                <div className="ilabel">
                  Output
                  <button className="icopy" onClick={() => copyText(en.outStr, 'Output')}>
                    <Icon name="copy" size={10} /> copy
                  </button>
                </div>
                <pre className={'ibox' + (en.ok === false ? ' bad' : '')}>{en.outStr}</pre>
              </div>
            )}
            {!hasDiff && !en.inStr && !en.outStr && (
              <div className="pdet">No input / output captured for this call.</div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
