import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ViewMode = 'list' | 'trace';
export type RailStatus = 'all' | 'needs' | 'working' | 'failed';

export interface UiState {
  selectedId: string | null;
  userPinned: boolean;
  viewMode: ViewMode;
  failOnly: boolean;
  railQuery: string;
  railStatus: RailStatus;
  connected: boolean;
}

const savedView = ((): ViewMode => {
  try {
    return localStorage.getItem('tlview') === 'trace' ? 'trace' : 'list';
  } catch {
    return 'list';
  }
})();

const initialState: UiState = {
  selectedId: null,
  userPinned: false,
  viewMode: savedView,
  failOnly: false,
  railQuery: '',
  railStatus: 'all',
  connected: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    selectSession(state, action: PayloadAction<string>) {
      state.selectedId = action.payload;
      state.userPinned = true;
    },
    // auto-follow: does not pin
    autoSelect(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
    },
    setUserPinned(state, action: PayloadAction<boolean>) {
      state.userPinned = action.payload;
    },
    setViewMode(state, action: PayloadAction<ViewMode>) {
      state.viewMode = action.payload;
      try {
        localStorage.setItem('tlview', action.payload);
      } catch {
        /* ignore */
      }
    },
    setFailOnly(state, action: PayloadAction<boolean>) {
      state.failOnly = action.payload;
    },
    setRailQuery(state, action: PayloadAction<string>) {
      state.railQuery = action.payload.trim().toLowerCase();
    },
    setRailStatus(state, action: PayloadAction<RailStatus>) {
      state.railStatus = action.payload;
    },
    setConnected(state, action: PayloadAction<boolean>) {
      state.connected = action.payload;
    },
  },
});

export const {
  selectSession,
  autoSelect,
  setUserPinned,
  setViewMode,
  setFailOnly,
  setRailQuery,
  setRailStatus,
  setConnected,
} = uiSlice.actions;
export default uiSlice.reducer;
