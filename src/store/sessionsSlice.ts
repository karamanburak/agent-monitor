import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { applyEvent, tickHousekeeping, type SessionsState } from '../lib/ingest';
import type { HookEvent } from '../lib/types';

function loadDismissed(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem('dismissedSessions') || '{}') || {};
  } catch {
    return {};
  }
}

const initialState: SessionsState = {
  sessions: {},
  eventTimes: [],
  booted: false,
  lastAppliedAt: 0,
  effects: [],
  dismissed: loadDismissed(),
};

const sessionsSlice = createSlice({
  name: 'sessions',
  initialState,
  reducers: {
    streamEvent(state, action: PayloadAction<HookEvent>) {
      const e = action.payload;
      applyEvent(state as SessionsState, e, true);
      if (
        e.hook_event_name !== '__history__' &&
        typeof e.received_at === 'number' &&
        e.received_at > state.lastAppliedAt
      )
        state.lastAppliedAt = e.received_at;
      if (e.hook_event_name === '__history__' || !state.booted) state.booted = true;
    },
    tick(state) {
      tickHousekeeping(state as SessionsState);
    },
    // Splice off only the consumed count — an effect appended between commit and
    // this run must not be dropped. Clears all when count is omitted.
    clearEffects(state, action: PayloadAction<number | undefined>) {
      const count = action.payload;
      if (count === undefined || count >= state.effects.length) state.effects = [];
      else state.effects.splice(0, count);
    },
    // Card reappears if the session emits another event.
    removeSession(state, action: PayloadAction<string>) {
      delete state.sessions[action.payload];
      state.dismissed[action.payload] = Date.now();
    },
  },
});

export const { streamEvent, tick, clearEffects, removeSession } = sessionsSlice.actions;
export default sessionsSlice.reducer;
