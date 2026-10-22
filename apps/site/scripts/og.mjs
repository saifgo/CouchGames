// Rebuilds public/og.png (the 1200×630 share image) from the real hero.
// Needs the built site running: `pnpm --filter @couch/site preview` in another terminal, then
// `PLAYWRIGHT_BROWSERS_PATH=… node apps/site/scripts/og.mjs` from the repo root.
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:4321/';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, reducedMotion: 'reduce' });
await p.goto(url);
await p.addStyleTag({
  content: '.seats,.bar,.screen__clock,.lobby__hint,.screen__actions .link{display:none!important}.screen{grid-column:1/-1!important}',
});
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(800);
await p.screenshot({ path: new URL('../public/og.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') });
await b.close();
