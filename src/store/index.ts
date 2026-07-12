import { configureStore } from '@reduxjs/toolkit';
import sessions from './sessionsSlice';
import ui from './uiSlice';
import usage from './usageSlice';

export const store = configureStore({
  reducer: { sessions, ui, usage },
  middleware: (getDefault) =>
    // dev serializability/immutability checks are too expensive with per-second ticks + large state
    getDefault({ serializableCheck: false, immutableCheck: false }),
});

// persist dismissed-session ids so closed cards stay hidden across refreshes / SSE reconnects
let lastDismissed = store.getState().sessions.dismissed;
store.subscribe(() => {
  const d = store.getState().sessions.dismissed;
  if (d !== lastDismissed) {
    lastDismissed = d;
    try {
      localStorage.setItem('dismissedSessions', JSON.stringify(d));
    } catch {
      /* ignore */
    }
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
