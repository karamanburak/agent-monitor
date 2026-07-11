import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The React dev server runs on 5173; all API/SSE calls proxy to the local
// Node/Bun backend on 3456 so the dashboard behaves identically in dev and
// in the built (server-served) app. Everything stays on 127.0.0.1.
const API = 'http://127.0.0.1:3456';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/events': { target: API, changeOrigin: true },
      '/event': { target: API, changeOrigin: true },
      '/usage': { target: API, changeOrigin: true },
      '/stats': { target: API, changeOrigin: true },
      '/history': { target: API, changeOrigin: true },
      '/session': { target: API, changeOrigin: true },
      '/focus': { target: API, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
