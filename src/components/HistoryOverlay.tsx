import { useEffect, useMemo, useRef, useState } from 'react';
import { getHistory, getSessionEvents, searchHistory } from '../lib/api';
import { replaySession } from '../lib/ingest';
import { basename, clock, rel, shortModel, stamp } from '../lib/format';
import { useAppSelector } from '../store/hooks';
import { displayStatus } from '../lib/constants';
import { downloadSessionMarkdown } from '../lib/markdown';
import { useToast } from './Toast';
import Icon from './Icon';
import Overlay from './Overlay';
import Timeline from './Timeline';
import type { HistorySession, HookEvent, SearchSession, Session } from '../lib/types';

// snippet() marks matches with \x01…\x02; keep the control chars out of regex literals
const MARK_OPEN = String.fromCharCode(1);
const MARK_CLOSE = String.fromCharCode(2);

// Render a server snippet, turning marker pairs into <mark> highlights.
function Snip({ text }: { text: string }) {
  // markers strictly alternate, so folding both to one delimiter keeps odd slots = matches
  const parts = text.replaceAll(MARK_CLOSE, MARK_OPEN).split(MARK_OPEN);
  return <span className="hsnip">{parts.map((p, i) => (i % 2 ? <mark key={`${i}${p}`}>{p}</mark> : p))}</span>;
}

export default function HistoryOverlay({
  open,
  onClose,
  initialQuery,
}: {
  open: boolean;
  onClose: () => void;
  initialQuery?: string;
}) {
  const { toast } = useToast();
  const liveSessions = useAppSelector((st) => st.sessions.sessions);
  const [list, setList] = useState<HistorySession[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [query, setQuery] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [past, setPast] = useState<Session | null>(null);
  const [detailState, setDetailState] = useState<'empty' | 'loading' | 'ready' | 'error' | 'none'>('empty');
  // id of the latest openSession() request; a slower earlier fetch must not overwrite the pane
  const reqIdRef = useRef<string | null>(null);
  // full-text results (null = not in search mode); searchRef guards stale responses
  const [found, setFound] = useState<{ sessions: SearchSession[]; total: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef('');

  useEffect(() => {
    if (!open) {
      reqIdRef.current = null; // cancel in-flight replay so it can't render after close
      searchRef.current = '';
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
    setQuery(initialQuery || '');
    setFound(null);
  }, [open, initialQuery]);

  // Deep search kicks in from 2 chars (debounced); shorter queries filter the list locally.
  const deepQuery = query.trim().length >= 2 ? query.trim() : '';
  useEffect(() => {
    searchRef.current = deepQuery;
    if (!open || !deepQuery) {
      setFound(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      searchHistory(deepQuery)
        .then((j) => {
          if (searchRef.current !== deepQuery) return;
          setFound({ sessions: j.sessions || [], total: j.total || 0 });
          setSearching(false);
        })
        .catch(() => {
          if (searchRef.current !== deepQuery) return;
          setFound({ sessions: [], total: 0 });
          setSearching(false);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [open, deepQuery]);

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
          <Icon name="history" size={16} /> History
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
                placeholder="Search all history — prompts, tools, results…"
                autoComplete="off"
                spellCheck={false}
                aria-label="Search all recorded history"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="histsub">
              {deepQuery
                ? searching
                  ? 'Searching the local index…'
                  : found
                    ? `${found.total} matching event${found.total === 1 ? '' : 's'} in ${found.sessions.length} session${found.sessions.length === 1 ? '' : 's'}` +
                      (found.total >= 400 ? ' (most recent shown)' : '')
                    : ''
                : 'Full-text search across every recorded event — indexed locally, never leaves this machine.'}
            </div>
            <div className="histrows" role="list">
              {deepQuery && found ? (
                !found.sessions.length && !searching ? (
                  <div className="histloading">No events match “{deepQuery}”.</div>
                ) : (
                  found.sessions.map((s) => (
                    <button
                      key={s.id}
                      className={'histrow' + (s.id === selId ? ' sel' : '')}
                      role="listitem"
                      onClick={() => openSession(s.id)}
                    >
                      <span className="hr1">
                        <span className="dot ended"></span>
                        <span className="hname">{basename(s.cwd)}</span>
                        <span className="hhits">{s.hits}×</span>
                        <span className="hwhen" title={`Latest match · ${stamp(s.lastMatch)}`}>
                          {stamp(s.lastMatch)}
                        </span>
                      </span>
                      {s.snips.slice(0, 2).map((sn, i) => (
                        <Snip key={`${s.id}${i}`} text={sn} />
                      ))}
                    </button>
                  ))
                )
              ) : loadingList ? (
                <div className="histloading">Reading the log…</div>
              ) : !items.length ? (
                <div className="histloading">{query ? 'No sessions match.' : 'No sessions recorded yet.'}</div>
              ) : (
                items.map((s) => {
                  const prompt = s.lastPrompt || s.firstPrompt || '(no prompt)';
                  // live = the dashboard currently sees it; otherwise ended, or no SessionEnd was ever recorded
                  const liveNow = !!liveSessions[s.id] && displayStatus(liveSessions[s.id]) !== 'ended';
                  const state = liveNow ? 'live' : s.ended ? 'ended' : 'open';
                  return (
                    <button
                      key={s.id}
                      className={'histrow' + (s.id === selId ? ' sel' : '')}
                      role="listitem"
                      onClick={() => openSession(s.id)}
                    >
                      <span className="hr1">
                        <span className={'dot ' + state} title={state === 'open' ? 'No session end was recorded' : state}></span>
                        <span className="hname">{basename(s.cwd)}</span>
                        <span className="hwhen" title={`Last activity · ${stamp(s.lastSeen)}`}>
                          {rel(s.lastSeen)} ago
                        </span>
                      </span>
                      <span className="hprompt">{prompt}</span>
                      <span className="hmeta">
                        {s.tools} tool{s.tools === 1 ? '' : 's'}
                        {s.subs ? ` · ${s.subs} agent${s.subs === 1 ? '' : 's'}` : ''}
                        {s.fails ? (
                          <>
                            {' · '}
                            <span className="bad">{s.fails} failed</span>
                          </>
                        ) : (
                          ''
                        )}
                        {state === 'live' ? ' · live now' : state === 'ended' ? ' · ended' : ' · not closed'}
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
            <Icon name="download" size={11} /> Markdown
          </button>
        </h3>
        <div className="hpath">
          {s.cwd || '?'} · {s.id}
        </div>
        <div className="hstats">
          <b>{s.toolCount}</b> tool call{s.toolCount === 1 ? '' : 's'} · <b>{s.failCount}</b> failed ·{' '}
          <b>{s.subagents.length}</b> subagent{s.subagents.length === 1 ? '' : 's'} ·{' '}
          {clock(s.firstSeen)}–{clock(s.lastSeen)}
          {mdl ? ` · ${mdl}` : ''}
        </div>
      </div>
      {s.lastResult && (
        <div className="histresult">
          <span className="rl">
            <Icon name="check" size={11} /> Final result
          </span>
          {s.lastResult}
        </div>
      )}
      <div className="tl">
        <Timeline session={s} onInspect={() => {}} failOnlyOverride={false} />
      </div>
    </>
  );
}
