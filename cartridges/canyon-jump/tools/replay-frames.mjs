/* Render replay key frames to PNG (used by tools/replay.cjs --png). node tools/replay-frames.mjs outDir CODE t1,t2,...
   Loads the game with #replay=CODE, fast-forwards the playback to each time and screenshots it. */
import fs from 'fs';
const [outDir, code, tsArg] = process.argv.slice(2);
const { chromium } = await import(process.env.PW || '/tmp/pw/node_modules/playwright/index.mjs');
const BASE = process.env.BASE || 'http://127.0.0.1:8812/canyon-jump/';
fs.mkdirSync(outDir, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto(BASE + 'index.html?ql=4#replay=' + encodeURIComponent(code), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__cj && window.CJRender3D, null, { timeout: 60000 });
await p.waitForFunction(() => window.__cj.playback, null, { timeout: 10000 }); // #replay= decodes async (CJZ1)
await p.evaluate(() => window.__cj.startRun());
for (const t of tsArg.split(',').map(Number)) {
  await p.evaluate(t => { const { G, S } = window.__cj, s = G.run; while (!s.over && s.t < t && G.play) { const i = Object.assign({}, G.play[G.playIdx++] || {}); G.rec && G.rec.push(i); S.step(s, i); s.events.length = 0; } G.paused = true; G.banner = null; }, t);
  await p.waitForTimeout(3500); await p.evaluate(() => { window.__cj.G.paused = false; }); await p.waitForTimeout(120);
  const f = `${outDir}/t${t.toFixed(1)}.png`; await p.screenshot({ path: f }); console.log('frame', f);
}
await b.close();
