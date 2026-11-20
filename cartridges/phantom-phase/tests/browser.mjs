import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from '../tools/serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const here = dirname(fileURLToPath(import.meta.url));
const shots = process.env.PHANTOM_SHOTS || '/opt/cursor/artifacts/phantom-phase';
mkdirSync(shots, { recursive: true });
mkdirSync(join(here, 'screenshots'), { recursive: true });

const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome';

function fail(errors, label) {
  if (!errors.length) return;
  console.error(label);
  for (const error of errors) console.error(error);
  process.exitCode = 1;
}

async function settle(page, predicate, label) {
  await page.waitForFunction(predicate, { timeout: 8000 });
  if (label) await page.waitForTimeout(label);
}

async function shot(page, name) {
  const file = join(shots, name);
  await page.screenshot({ path: file });
  await page.screenshot({ path: join(here, 'screenshots', name) });
  console.log('screenshot', file);
}

const site = await start(0, '127.0.0.1');
const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
});

async function open(viewport, isMobile) {
  const errors = [];
  const page = await browser.newPage({ viewport, isMobile, hasTouch: isMobile, deviceScaleFactor: 1 });
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('response', (res) => { if (res.status() >= 400) errors.push('http ' + res.status() + ' ' + res.url()); });
  await page.goto(site.url, { waitUntil: 'networkidle' });
  await settle(page, () => document.documentElement.dataset.mode === 'title');
  return { page, errors };
}

const desktop = await open({ width: 1440, height: 900 }, false);
await shot(desktop.page, 'title-desktop.png');
await desktop.page.keyboard.press('ArrowUp');
await settle(desktop.page, () => document.documentElement.dataset.mode === 'run' && document.documentElement.dataset.slot === '1');
await desktop.page.keyboard.press('ArrowRight');
await settle(desktop.page, () => document.documentElement.dataset.slot === '2');
await desktop.page.keyboard.press('Space');
await settle(desktop.page, () => document.documentElement.dataset.slot === '0');
await desktop.page.keyboard.press('KeyA');
await settle(desktop.page, () => document.documentElement.dataset.slot === '4');
await settle(desktop.page, () => Number(document.documentElement.dataset.tick) > 90);
await shot(desktop.page, 'play-desktop.png');
const desktopSlot = await desktop.page.evaluate(() => document.documentElement.dataset.slot);
if (desktopSlot !== '4') {
  desktop.errors.push('desktop slot stayed ' + desktopSlot);
}
fail(desktop.errors, 'desktop console/http errors');

const phone = await open({ width: 390, height: 844 }, true);
await shot(phone.page, 'title-mobile.png');
const box = await phone.page.locator('canvas').boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
const cdp = await phone.page.context().newCDPSession(phone.page);
async function swipe(x0, y0, x1, y1) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: (x0 + x1) / 2, y: (y0 + y1) / 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
await swipe(cx, cy, cx, cy - 140);
await settle(phone.page, () => document.documentElement.dataset.mode === 'run' && document.documentElement.dataset.slot === '1');
await phone.page.touchscreen.tap(cx, cy);
await settle(phone.page, () => document.documentElement.dataset.slot === '0');
await swipe(cx, cy, cx - 150, cy);
await settle(phone.page, () => document.documentElement.dataset.slot === '4');
await settle(phone.page, () => Number(document.documentElement.dataset.tick) > 70);
await shot(phone.page, 'play-mobile.png');
fail(phone.errors, 'mobile console/http errors');

await browser.close();
await site.close();
if (process.exitCode) process.exit(process.exitCode);
console.log('phantom-phase browser ok');
