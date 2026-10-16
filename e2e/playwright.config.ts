import { defineConfig } from '@playwright/test';

/**
 * End-to-end: real host page + real controller page(s) talking through the
 * couch server. Requires `pnpm build` (and `pnpm test-roms && pnpm cores` for
 * the gameplay tests, which skip otherwise).
 */
const PORT = 8799;

export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns'] },
  },
  webServer: [
    {
      command: 'pnpm --filter @couch/signaling start',
      url: `http://localhost:${PORT}/api/health`,
      env: { PORT: String(PORT), LAB: '1' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // Cross-origin isolated instance (SharedArrayBuffer) for pthread cores like PSP.
      command: 'pnpm --filter @couch/signaling start',
      url: `http://localhost:${PORT - 1}/api/health`,
      env: { PORT: String(PORT - 1), COI: '1' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
