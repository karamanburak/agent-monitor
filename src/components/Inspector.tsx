import { clock, fmtDur, lineDiff } from '../lib/format';
import { legendFor } from '../lib/legends';
import { useToast } from './Toast';
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

export default function Inspector({ entry, onClose }: { entry: ToolEntry | null; onClose: () => void }) {
  const { copyText } = useToast();

  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const grip = e.currentTarget as HTMLElement;
    grip.setPointerCapture(e.pointerId);
    grip.classList.add('drag');
    document.body.classList.add('dragging');
    const move = (ev: PointerEvent) => {
      const w = Math.max(340, Math.min(window.innerWidth - 80, window.innerWidth - ev.clientX));
      document.documentElement.style.setProperty('--inspw', w + 'px');
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.classList.remove('drag');
      document.body.classList.remove('dragging');
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
  };

  const en = entry;
  const who = en?.agent ? `${legendFor(en.agent).e} ${legendFor(en.agent).f}` : 'Main agent';
  const status = en ? (en.dur === null ? 'running…' : (en.ok === false ? 'failed · ' : '') + fmtDur(en.dur)) : '';
  const hasDiff = !!en?.edits?.length;

  return (
    <aside className={'inspector' + (en ? ' open' : '')} aria-label="Tool call details">
      <div className="insp-resize" title="Drag to resize" onPointerDown={onResizeDown}></div>
      <div className="insp-head">
        <span className="insp-title">
          {en?.name}{' '}
          <span
            className={'pd' + (en?.ok === false ? ' bad' : '')}
            style={{ color: 'var(--mut)', fontWeight: 400, fontSize: 11 }}
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
                      ⧉ copy
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
                    ⧉ copy
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
