import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The React dev server runs on 5173; all API/SSE calls proxy to the local
// Node/Bun backend on 3456 so the dashboard behaves identically in dev and
// in the built (server-served) app. Everything stays on 127.0.0.1.
// AGENT_MONITOR_API lets the e2e smoke test point the proxy at its own throwaway backend
const API = process.env.AGENT_MONITOR_API || 'http://127.0.0.1:3456';

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
      '/search': { target: API, changeOrigin: true },
      '/setup': { target: API, changeOrigin: true },
      '/terminal': { target: API, changeOrigin: true },
      '/focus': { target: API, changeOrigin: true },
      '/analysis': { target: API, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // goey-toast pulls in framer-motion (~⅓ of the bundle): its own file, loaded in parallel.
        // (Not a lazy import — toasts fired before a lazily mounted toaster were dropped.)
        manualChunks: { toast: ['goey-toast'] },
      },
    },
  },
});
