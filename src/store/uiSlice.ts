import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { RADIO_STATIONS } from '../lib/constants';

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
  // progressive disclosure: extras stay out of the default view (Settings toggles them)
  showRadio: boolean;
  showTokens: boolean;
  // currently playing station (yt id). Deliberately not persisted — never auto-play on refresh.
  radioStation: string | null;
  // paused without stopping — P toggles this; unlike stopRadio it keeps the station loaded.
  radioPaused: boolean;
  // app for new terminals ("Open terminal here" / "Resume"): 'auto' = the one the session ran in
  termApp: string;
}

const savedView = ((): ViewMode => {
  try {
    return localStorage.getItem('tlview') === 'trace' ? 'trace' : 'list';
  } catch {
    return 'list';
  }
})();

const savedFlag = (key: string, dflt: boolean): boolean => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? dflt : v === '1';
  } catch {
    return dflt;
  }
};

const initialState: UiState = {
  selectedId: null,
  userPinned: false,
  viewMode: savedView,
  failOnly: false,
  railQuery: '',
  railStatus: 'all',
  connected: false,
  showRadio: savedFlag('showradio', false),
  showTokens: savedFlag('showtokens', true),
  radioStation: null,
  radioPaused: false,
  termApp: (() => {
    try {
      return localStorage.getItem('termapp') || 'auto';
    } catch {
      return 'auto';
    }
  })(),
};

const persistFlag = (key: string, on: boolean) => {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* ignore */
  }
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
    toggleRadio(state) {
      state.showRadio = !state.showRadio;
      persistFlag('showradio', state.showRadio);
    },
    toggleTokens(state) {
      state.showTokens = !state.showTokens;
      persistFlag('showtokens', state.showTokens);
    },
    setRadioStation(state, action: PayloadAction<string | null>) {
      state.radioStation = action.payload;
      state.radioPaused = false;
    },
    // R: reveal the player if hidden and advance to the next station (first press = station 1)
    cycleRadio(state) {
      if (!state.showRadio) {
        state.showRadio = true;
        persistFlag('showradio', true);
      }
      const ids = RADIO_STATIONS.map((s) => s.id);
      const i = state.radioStation ? ids.indexOf(state.radioStation) : -1;
      state.radioStation = ids[(i + 1) % ids.length];
      state.radioPaused = false;
    },
    // Shift+R: stop playback and tuck the player away again
    stopRadio(state) {
      state.radioStation = null;
      state.radioPaused = false;
      if (state.showRadio) {
        state.showRadio = false;
        persistFlag('showradio', false);
      }
    },
    // P: pause/resume the current station in place — unlike stopRadio, doesn't unload or hide it
    toggleRadioPause(state) {
      if (!state.radioStation) return;
      state.radioPaused = !state.radioPaused;
    },
    setTermApp(state, action: PayloadAction<string>) {
      state.termApp = action.payload;
      try {
        localStorage.setItem('termapp', action.payload);
      } catch {
        /* ignore */
      }
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
  toggleRadio,
  toggleTokens,
  setRadioStation,
  cycleRadio,
  stopRadio,
  toggleRadioPause,
  setTermApp,
} = uiSlice.actions;
export default uiSlice.reducer;
