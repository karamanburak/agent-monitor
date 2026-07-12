import { useEffect } from 'react';
import { useAppDispatch } from '../store/hooks';
import { setConnected } from '../store/uiSlice';
import { streamEvent } from '../store/sessionsSlice';
import type { HookEvent } from '../lib/types';

export function useEventStream() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const es = new EventSource('/events');
    es.onopen = () => dispatch(setConnected(true));
    es.onerror = () => dispatch(setConnected(false));
    es.onmessage = (m) => {
      let e: HookEvent | null = null;
      try {
        e = JSON.parse(m.data);
      } catch {
        /* ignore */
      }
      if (e) dispatch(streamEvent(e));
    };
    return () => es.close();
  }, [dispatch]);
}
