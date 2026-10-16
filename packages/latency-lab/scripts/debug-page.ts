/** Opens one lab page and dumps console output (debug helper). */
import { chromium } from 'playwright';
import { startLabServer } from './lab-server.js';
const path = process.argv[2]!;
const wait = Number(process.argv[3] ?? 15000);
const srv = await startLabServer({ coi: process.argv.includes('--coi') });
const browser = await chromium.launch({ channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('console', (m) => console.log(`[${m.type()}] ${m.text()}`.slice(0, 400)));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.stack}`));
await page.goto(srv.url + path);
await page.waitForTimeout(wait);
console.log('HUD:', (await page.textContent('#hud'))?.slice(0, 1500));
await page.screenshot({ path: 'results/raw/debug.png' });
await browser.close();
await srv.close();
