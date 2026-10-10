import { spawn } from 'node:child_process';
import fs from 'node:fs';
const OUT = process.argv[2];
const chrome = spawn(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9334', '--user-data-dir=' + (await import('node:os')).tmpdir() + '/skip10k-cdp', 'about:blank']);
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(1500);
const list = await (await fetch('http://127.0.0.1:9334/json')).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = {};
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.result?.value;
const shot = async name => { const r = await send('Page.captureScreenshot'); fs.writeFileSync(OUT + '/' + name + '.png', Buffer.from(r.result.data, 'base64')); };
const device = async (w, h) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true, screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
};
const touch = async (type, pts) => send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
const tap = async (x, y) => { await touch('touchStart', [[x, y]]); await sleep(40); await touch('touchEnd', []); await sleep(60); };
// canvas -> css coordinates
const C = async (cx, cy) => { const r = await ev('JSON.stringify(cv.getBoundingClientRect())'); const b = JSON.parse(r); return [b.left + cx / 480 * b.width, b.top + cy / 270 * b.height]; };

await device(390, 844);
await send('Page.navigate', { url: 'http://localhost:5178/' }); await sleep(1500);
console.log('portrait: body class', await ev('document.body.className'), 'touch', await ev('G8.touch'));
await shot('m_portrait');
await device(844, 390); await sleep(800);
console.log('landscape: body class', JSON.stringify(await ev('document.body.className')), 'canvas', await ev('JSON.stringify(cv.getBoundingClientRect())'));
await shot('m_title');
await tap(...await C(240, 150)); await sleep(500);
console.log('after tap:', await ev('G8.screen'));
await shot('m_aim_idle');
// drag back to throw
const [ax, ay] = await C(300, 120), [bx, by] = await C(250, 134);
await touch('touchStart', [[ax, ay]]); await sleep(50);
for (let i = 1; i <= 8; i++) { await touch('touchMove', [[ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8]]); await sleep(30); }
await shot('m_aim_pull');
console.log('pull:', await ev('JSON.stringify({p: Math.round(G8.aim.power*100), a: Math.round(G8.aim.angle)})'));
await touch('touchEnd', []); await sleep(400);
console.log('after release:', await ev('G8.screen'), await ev('Math.round(G8.run.vx)'));
// tap skip near water, tap the bounce + rc buttons
let skips0 = await ev('G8.run.skips');
for (let i = 0; i < 60; i++) { const near = await ev('G8.run.alt < 12 && G8.run.vy < 0'); if (near) { await tap(...await C(430, 100)); break; } await sleep(25); }
await sleep(300);
const b0 = await ev('G8.run.bounces'); await tap(...await C(363, 233)); await sleep(150);
const r0 = await ev('G8.run.rc'); await tap(...await C(363, 189)); await sleep(150);
console.log('bounce button', b0, '->', await ev('G8.run.bounces'), '| rc button', r0, '->', await ev('G8.run.rc'), '| perfects', await ev('G8.run.perfects'));
await shot('m_fly');
// rotate back to portrait mid-run: should pause
await device(390, 844); await sleep(500);
console.log('portrait mid-run paused:', await ev('G8.paused'));
chrome.kill(); process.exit(0);
