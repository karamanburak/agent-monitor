import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectSession, setViewMode } from '../store/uiSlice';

// Mirrors the deliberate selection + view into the URL (?s=<session id>&view=trace) so a
// refresh keeps context and a link opens the same session. replaceState only — clicking
// around must not flood the back button. Auto-follow (unpinned) selection is not written.
export function useUrlState() {
  const dispatch = useAppDispatch();
  const selectedId = useAppSelector((s) => s.ui.selectedId);
  const userPinned = useAppSelector((s) => s.ui.userPinned);
  const viewMode = useAppSelector((s) => s.ui.viewMode);
  const booted = useAppSelector((s) => s.sessions.booted);
  const sessions = useAppSelector((s) => s.sessions.sessions);
  // the session id from the URL waits here until the history snapshot has arrived
  const pending = useRef<string | null>(new URLSearchParams(window.location.search).get('s'));

  // view applies immediately (it doesn't depend on data)
  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get('view');
    if (view === 'trace' || view === 'list') dispatch(setViewMode(view));
  }, [dispatch]);

  useEffect(() => {
    if (!booted || !pending.current) return;
    const id = pending.current;
    pending.current = null;
    if (sessions[id]) dispatch(selectSession(id));
  }, [booted, sessions, dispatch]);

  useEffect(() => {
    // nothing is written before the history snapshot lands, so an incoming link isn't clobbered
    if (!booted || pending.current) return;
    const url = new URL(window.location.href);
    if (userPinned && selectedId) url.searchParams.set('s', selectedId);
    else url.searchParams.delete('s');
    if (viewMode === 'trace') url.searchParams.set('view', 'trace');
    else url.searchParams.delete('view');
    if (url.href !== window.location.href) window.history.replaceState(null, '', url);
  }, [selectedId, userPinned, viewMode, booted]);
}
