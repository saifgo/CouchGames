import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Built into dist/ and served by the couch server at "/". In dev, API + WebSocket
// calls are proxied to the couch server on :8787.
export default defineConfig({
  plugins: [react()],
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1500 },
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
      '/api': 'http://localhost:8787',
      '/roms': 'http://localhost:8787',
      '/test-roms': 'http://localhost:8787',
      '/bios': 'http://localhost:8787',
      '/c': 'http://localhost:8787',
    },
  },
});
