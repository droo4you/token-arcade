import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cabinet = path.resolve(here, '..');
const root = path.resolve(cabinet, '../..');
const noop = () => {};
const context2d = new Proxy({}, { get: (_t, key) => (key === 'createLinearGradient' || key === 'createRadialGradient') ? () => ({ addColorStop: noop }) : key === 'measureText' ? () => ({ width: 10 }) : noop, set: () => true });
const element = () => ({ style: {}, getContext: () => context2d, addEventListener: noop, setAttribute: noop, append: noop, remove: noop, focus: noop, setPointerCapture: noop,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }) });

function boot(mode) {
  const messages = [], listeners = new Map();
  const add = (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); };
  const remove = (type, fn) => listeners.get(type)?.delete(fn);
  const parent = { postMessage(data, origin) { assert.equal(origin, 'http://127.0.0.1:5173'); messages.push(data); } };
  class Img { constructor() { this.complete = false; this.naturalWidth = 0; } }
  const sandbox = { console, Math, JSON, Date, URLSearchParams, Map, Set, Image: Img, performance: { now: () => 0 }, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2,
    parent, TA_HOST_ORIGINS: ['http://127.0.0.1:5173'], location: { search: '?ta=1&ta_host=http%3A%2F%2F127.0.0.1%3A5173&ta_channel=sl' },
    crypto: { randomUUID: () => 'next-run' }, localStorage: { getItem: () => null, setItem: noop },
    document: { getElementById: element, createElement: element, body: element(), addEventListener: add, removeEventListener: remove },
    addEventListener: add, removeEventListener: remove, requestAnimationFrame: () => 1, cancelAnimationFrame: noop,
    setTimeout: () => 0, setInterval: () => 0, clearInterval: noop };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'packages/sdk/browser/bridge.js'), 'utf8'), ctx);
  const html = fs.readFileSync(path.join(cabinet, 'arcade.html'), 'utf8');
  for (const m of html.matchAll(/<script src="(src\/[^"]+)"/g)) vm.runInContext(fs.readFileSync(path.join(cabinet, m[1]), 'utf8'), ctx);
  const send = async (type, payload = {}) => { for (const fn of [...(listeners.get('message') ?? [])]) await fn({ origin: 'http://127.0.0.1:5173', source: parent, data: { ta: 1, channel: 'sl', type, payload } }); };
  const config = { runId: 'sl-smoke', gameId: 'skrump-lab', gameVersion: '1.0.0', mode, objective: 'score', startedAt: new Date().toISOString() };
  return { messages, send, config, sl: vm.runInContext('window.__sl', ctx) };
}

test('Skrump Lab reports a Free Play run through the bridge', async () => {
  const { messages, send, config, sl } = boot('free');
  assert.equal(messages[0]?.type, 'ta:hello');
  await send('ta:mount', config); assert.equal(messages.at(-1)?.type, 'ta:ready');
  await send('ta:start'); assert.ok(messages.some(m => m.type === 'ta:run_started'));
  const tick = n => { for (let i = 0; i < n; i++) sl.update(1 / 60); };
  tick(200); assert.equal(sl.G.screen, 'aim');
  await send('ta:pause'); const t = sl.G.runT; tick(30); assert.equal(sl.G.runT, t, 'paused run is frozen'); await send('ta:resume');
  for (let guard = 0; guard < 20 && sl.G.screen !== 'end'; guard++) {
    if (sl.G.screen === 'aim') sl.fire(90, 40);
    tick(60 * 12);
  }
  assert.equal(sl.G.screen, 'end');
  const done = messages.find(m => m.type === 'ta:run_complete')?.payload;
  assert.ok(done, 'run_complete sent'); assert.equal(done.gameId, 'skrump-lab'); assert.equal(done.mode, 'free');
  assert.equal(done.primaryMetric, sl.G.result.total); assert.ok(Number.isInteger(done.primaryMetric));
  for (const v of Object.values(done.secondaryMetrics)) assert.ok(Number.isInteger(v));
  assert.equal(done.proof, undefined, 'Free Play sends no replay proof');
  await send('ta:restart'); assert.equal(sl.G.screen, 'intro');
  await send('ta:destroy'); assert.equal(messages.at(-1)?.type, 'ta:destroyed');
});

test('Skrump Lab refuses Passport Play and Raid mounts (Free Play only)', async () => {
  for (const mode of ['ranked', 'raid']) { const { messages, send, config } = boot(mode); await send('ta:mount', config); assert.equal(messages.at(-1)?.type, 'ta:error'); }
});
