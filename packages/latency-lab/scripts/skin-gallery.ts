/** Screenshots every controller skin at phone size into docs/img/skins/ (visual review). */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import { startCouchServer } from '@couch/signaling';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const out = `${repo}docs/img/skins`;
mkdirSync(out, { recursive: true });
const srv = await startCouchServer({ port: 0, log: () => {}, static: [{ prefix: '/c', dir: `${repo}apps/controller-web/dist`, spa: true }] });
const browser = await chromium.launch({ channel: 'chromium' });
const ctx = await browser.newContext({ ...devices['Pixel 7 landscape'] });
const page = await ctx.newPage();
const skins = (process.argv[2] ?? 'nes,snes,genesis,gb,gbc,gba,psx,ps2,n64,psp,nds,modern').split(',');
for (const s of skins) {
  await page.goto(`${srv.url}/c/?preview=${s}`);
  await page.waitForSelector('.pad-svg');
  await page.screenshot({ path: `${out}/${s}.png` });
  console.log(`${out}/${s}.png`);
}
await browser.close();
await srv.close();
