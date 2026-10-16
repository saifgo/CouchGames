/**
 * Android host end-to-end: the phone (adb) runs the Couch TV app; this PC's
 * Chromium plays the phone controller, served by the app's own LAN server.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const ip = process.argv[2] ?? '192.168.0.129';
const adb = (...a: string[]) => execFileSync('adb', a, { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
const shot = (name: string) => writeFileSync(`results/raw/${name}.png`, execFileSync('adb', ['exec-out', 'screencap', '-p']));
const health = (await (await fetch(`http://${ip}:8787/api/health`)).json()) as { room: string };
console.log('TV room', health.room);
const browser = await chromium.launch({ channel: 'chromium', args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
const phone = await ctx.newPage();
phone.on('console', (m) => /error|couch/i.test(m.text()) && console.log('[controller]', m.text().slice(0, 160)));
await phone.goto(`http://${ip}:8787/c/?r=${health.room}&autojoin=1&name=PC`);
await phone.waitForTimeout(5000);
console.log('events', JSON.stringify(await phone.evaluate(() => (window as any).__couchPhone?.session.link.events)), 'badge', await phone.locator('.badge').textContent().catch(() => '-'), 'snap', JSON.stringify(await phone.evaluate(() => { const s = (window as any).__couchPhone?.session.snap; return s && { link: s.link, slot: s.slot, error: s.error, transport: s.transport }; })));
await phone.waitForFunction(() => /^P\d$/.test(document.querySelector('.badge')?.textContent ?? ''), null, { timeout: 20000 });
console.log('joined as', await phone.textContent('.badge'));
const press = async (id: string, ms = 120) => {
  const b = (await phone.locator(`[data-id="${id}"]`).first().boundingBox())!;
  await phone.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await phone.mouse.down();
  await phone.waitForTimeout(ms);
  await phone.mouse.up();
  await phone.waitForTimeout(250);
};
await phone.waitForTimeout(2500);
const transport = await phone.evaluate(() => (window as any).__couchPhone.session.snap.transport);
console.log('transport', transport, '(1 = WebRTC P2P, 3 = WebSocket LAN)');
shot('android-lobby');
// Confirm on the focused "Play" (modern pad: bottom button = RetroPad B = confirm) → detail → Play.
await press('b');
await phone.waitForTimeout(800);
shot('android-detail');
await press('b');
console.log('launching game (first run downloads the core)…');
await phone.waitForFunction(() => document.querySelector('svg.pad-svg')?.getAttribute('data-skin') === 'nes', null, { timeout: 60000 });
console.log('controller switched to NES skin');
await phone.waitForTimeout(6000);
shot('android-game-1');
await press('start');
await phone.waitForTimeout(1200);
shot('android-game-2');
await press('menu');
await phone.waitForTimeout(1200);
shot('android-menu');
const menuVisible = await phone.locator('.tvmenu').isVisible();
console.log('phone shows TV menu:', menuVisible);
if (menuVisible) {
  await phone.locator('.tvmenu button', { hasText: 'Save state' }).click();
  await phone.locator('.tvmenu button', { hasText: 'Slot 1' }).click();
  await phone.waitForTimeout(1500);
  shot('android-saved');
  await phone.locator('.tvmenu button', { hasText: 'Resume' }).click();
}
console.log(adb('logcat', '-d', '-s', 'Couch', 'libretrodroid', 'LibretroDroid').split('\n').slice(-12).join('\n'));
await browser.close();
