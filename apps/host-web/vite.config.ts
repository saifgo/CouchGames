import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * The static pages in public/ (legal.html, privacy.html, …) are not bundled, so they can't import
 * @couch/design. This copies the brand files they need to fixed URLs under /brand/ (dist + dev).
 */
const design = (p: string) => fileURLToPath(new URL(`../../packages/design/${p}`, import.meta.url));
const BRAND_FILES: Record<string, string> = {
  'fredoka-latin.woff2': design('fonts/fredoka-latin.woff2'),
  'inter-latin.woff2': design('fonts/inter-latin.woff2'),
  'mark.svg': design('assets/mark.svg'),
};
function brandFiles(): Plugin {
  return {
    name: 'couchpad-brand-files',
    configureServer(server) {
      server.middlewares.use('/brand/', (req, res, next) => {
        const file = BRAND_FILES[(req.url ?? '').replace(/^\//, '').split('?')[0]!];
        if (!file) return next();
        res.setHeader('Content-Type', file.endsWith('.svg') ? 'image/svg+xml' : 'font/woff2');
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const [name, file] of Object.entries(BRAND_FILES)) this.emitFile({ type: 'asset', fileName: `brand/${name}`, source: readFileSync(file) });
    },
  };
}

// Built into dist/ and served by the couch server at "/". In dev, API + WebSocket
// calls are proxied to the couch server on :8787.
export default defineConfig({
  plugins: [react(), brandFiles()],
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
      '/cores': 'http://localhost:8787',
    },
  },
});
