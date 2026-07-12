import { useEffect, useMemo, useRef, useState } from 'react';
import { getHistory, getSessionEvents } from '../lib/api';
import { replaySession } from '../lib/ingest';
import { basename, clock, shortModel, stamp } from '../lib/format';
import { downloadSessionMarkdown } from '../lib/markdown';
import { useToast } from './Toast';
import Overlay from './Overlay';
import Timeline from './Timeline';
import type { HistorySession, HookEvent, Session } from '../lib/types';

export default function HistoryOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [list, setList] = useState<HistorySession[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [query, setQuery] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [past, setPast] = useState<Session | null>(null);
  const [detailState, setDetailState] = useState<'empty' | 'loading' | 'ready' | 'error' | 'none'>('empty');
  // id of the latest openSession() request; a slower earlier fetch must not overwrite the pane
  const reqIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      reqIdRef.current = null; // cancel in-flight replay so it can't render after close
      return;
    }
    setLoadingList(true);
    getHistory()
      .then((j) => setList(j.sessions || []))
      .catch(() => setList([]))
      .finally(() => setLoadingList(false));
    setSelId(null);
    setPast(null);
    setDetailState('empty');
    setQuery('');
  }, [open]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) =>
      ((s.cwd || '') + ' ' + (s.lastPrompt || s.firstPrompt || '') + ' ' + s.id).toLowerCase().includes(q),
    );
  }, [list, query]);

  const openSession = async (id: string) => {
    reqIdRef.current = id;
    setSelId(id);
    setPast(null);
    setDetailState('loading');
    let events: HookEvent[];
    try {
      events = (await getSessionEvents(id)).events || [];
    } catch {
      if (reqIdRef.current === id) setDetailState('error');
      return;
    }
    // a newer click (or a close) superseded this request while it was in flight
    if (reqIdRef.current !== id) return;
    if (!events.length) {
      setDetailState('none');
      return;
    }
    const tmp = replaySession(events);
    const s = tmp[id] || Object.values(tmp)[0];
    if (!s) {
      setDetailState('error');
      return;
    }
    setPast(s);
    setDetailState('ready');
  };

  return (
    <Overlay open={open} onClose={onClose} label="Session history">
      <div className="ovbox histbox">
        <h2>
          🕓 History
          <button className="ovclose" aria-label="Close" onClick={onClose}>
            ✕ Close
          </button>
        </h2>
        <div className="ovsub">
          Past sessions read from the on-disk log (<b>this folder only</b>, nothing external). Click one to replay its
          timeline &amp; result.
        </div>
        <div className="histwrap">
          <div className="histlist">
            <div className="histsearch">
              <input
                type="search"
                placeholder="Filter past sessions…"
                autoComplete="off"
                spellCheck={false}
                aria-label="Filter past sessions"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="histrows" role="list">
              {loadingList ? (
                <div className="histloading">Reading the log…</div>
              ) : !items.length ? (
                <div className="histloading">{query ? 'No sessions match.' : 'No sessions recorded yet.'}</div>
              ) : (
                items.map((s) => {
                  const prompt = s.lastPrompt || s.firstPrompt || '(no prompt)';
                  return (
                    <button
                      key={s.id}
                      className={'histrow' + (s.id === selId ? ' sel' : '')}
                      role="listitem"
                      onClick={() => openSession(s.id)}
                    >
                      <span className="hr1">
                        <span className={'dot' + (s.ended ? ' ended' : '')}></span>
                        <span className="hname">{basename(s.cwd)}</span>
                        <span className="hwhen" title={`Last activity · ${stamp(s.lastSeen)}`}>
                          {stamp(s.lastSeen)}
                        </span>
                      </span>
                      <span className="hprompt">{prompt}</span>
                      <span className="hmeta">
                        {s.tools} tool{s.tools === 1 ? '' : 's'}
                        {s.subs ? ` · ${s.subs} agent${s.subs === 1 ? '' : 's'}` : ''}
                        {s.fails ? (
                          <>
                            {' · '}
                            <span className="bad">{s.fails}✗</span>
                          </>
                        ) : (
                          ''
                        )}
                        {s.ended ? ' · ended' : ' · live-ish'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <div className="histdetail">
            {detailState === 'empty' && (
              <div className="histempty">Select a past session on the left to replay its timeline.</div>
            )}
            {detailState === 'loading' && <div className="histloading">Loading &amp; replaying…</div>}
            {detailState === 'error' && <div className="histempty">Could not load this session.</div>}
            {detailState === 'none' && <div className="histempty">No events stored for this session.</div>}
            {detailState === 'ready' && past && <PastSession s={past} toast={toast} />}
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function PastSession({ s, toast }: { s: Session; toast: (m: string, k?: 'ok' | 'err') => void }) {
  const mdl = shortModel(s.model);
  return (
    <>
      <div className="histhead">
        <h3>
          {basename(s.cwd)}
          <button
            className="fitbtn"
            title="Download this session's timeline as a Markdown file"
            onClick={() => downloadSessionMarkdown(s, toast)}
          >
            ⭳ Markdown
          </button>
        </h3>
        <div className="hpath">
          {s.cwd || '?'} · {s.id}
        </div>
        <div className="hstats">
          <b>{s.toolCount}</b> tool calls · <b>{s.failCount}</b> failures · <b>{s.subagents.length}</b> subagents ·{' '}
          {clock(s.firstSeen)}–{clock(s.lastSeen)}
          {mdl ? ` · ${mdl}` : ''}
        </div>
      </div>
      {s.lastResult && (
        <div className="histresult">
          <span className="rl">✅ Final result</span>
          {s.lastResult}
        </div>
      )}
      <div className="tl">
        <Timeline session={s} onInspect={() => {}} failOnlyOverride={false} />
      </div>
    </>
  );
}
