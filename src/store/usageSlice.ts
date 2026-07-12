import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SessionUsageEntry, StatsDay, UsageResponse } from '../lib/types';

export interface UsageState {
  data: UsageResponse | null;
  days: StatsDay[];
  sessionEntries: SessionUsageEntry[];
  sessionEntriesId: string | null;
  updated: number;
  scanEvery: number;
  fetchedAt: number;
  bad: boolean;
}

const initialState: UsageState = {
  data: null,
  days: [],
  sessionEntries: [],
  sessionEntriesId: null,
  updated: 0,
  scanEvery: 60000,
  fetchedAt: 0,
  bad: false,
};

const usageSlice = createSlice({
  name: 'usage',
  initialState,
  reducers: {
    usageLoaded(state, action: PayloadAction<UsageResponse>) {
      state.data = action.payload;
      state.updated = action.payload.updated || Date.now();
      state.scanEvery = action.payload.scanEveryMs || 60000;
      state.fetchedAt = Date.now();
      state.bad = false;
    },
    usageFailed(state) {
      state.bad = true;
    },
    daysLoaded(state, action: PayloadAction<StatsDay[]>) {
      state.days = action.payload;
    },
    sessionUsageLoaded(state, action: PayloadAction<{ id: string; entries: SessionUsageEntry[] }>) {
      state.sessionEntries = action.payload.entries;
      state.sessionEntriesId = action.payload.id;
    },
    clearSessionUsage(state) {
      state.sessionEntries = [];
      state.sessionEntriesId = null;
    },
  },
});

export const { usageLoaded, usageFailed, daysLoaded, sessionUsageLoaded, clearSessionUsage } = usageSlice.actions;
export default usageSlice.reducer;
