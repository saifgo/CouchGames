import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/lab/',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        host: resolve(__dirname, 'host.html'),
        phone: resolve(__dirname, 'phone.html'),
        engine: resolve(__dirname, 'engine.html'),
      },
    },
  },
});
