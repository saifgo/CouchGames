import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

// Served by the couch server (web host) or the Android TV host at /c/.
export default defineConfig({
  base: '/c/',
  plugins: [preact()],
  build: { target: 'es2020', sourcemap: true },
  server: {
    port: 5174,
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true }, '/api': 'http://localhost:8787' },
  },
});
