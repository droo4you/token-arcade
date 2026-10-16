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
const element = () => ({ style: {}, getContext: () => context2d, addEventListener: noop, setAttribute: noop, append: noop, remove: noop, focus: noop,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }) });

function boot(mode) {
  const messages = [], listeners = new Map();
  const add = (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); };
  const remove = (type, fn) => listeners.get(type)?.delete(fn);
  const parent = { postMessage(data, origin) { assert.equal(origin, 'http://127.0.0.1:5173'); messages.push(data); } };
  const sandbox = { console, Math, JSON, Date, URLSearchParams, Map, Set, performance: { now: () => 0 }, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    parent, TA_HOST_ORIGINS: ['http://127.0.0.1:5173'], location: { search: '?ta=1&ta_host=http%3A%2F%2F127.0.0.1%3A5173&ta_channel=cj' },
    crypto: { randomUUID: () => 'next-run' }, localStorage: { getItem: () => null, setItem: noop },
    document: { getElementById: element, createElement: element, body: element(), addEventListener: add, removeEventListener: remove },
    addEventListener: add, removeEventListener: remove, requestAnimationFrame: () => 1, cancelAnimationFrame: noop,
    setTimeout: fn => { fn(); return 0; }, setInterval: () => 0, clearInterval: noop };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'packages/sdk/browser/bridge.js'), 'utf8'), ctx);
  const html = fs.readFileSync(path.join(cabinet, 'arcade.html'), 'utf8');
  for (const m of html.matchAll(/<script src="(src\/[^"]+)"/g)) vm.runInContext(fs.readFileSync(path.join(cabinet, m[1]), 'utf8'), ctx);
  const send = async (type, payload = {}) => { for (const fn of [...(listeners.get('message') ?? [])]) await fn({ origin: 'http://127.0.0.1:5173', source: parent, data: { ta: 1, channel: 'cj', type, payload } }); };
  const config = { runId: 'cj-smoke', gameId: 'canyon-jump', gameVersion: '1.0.0', mode, objective: 'score', startedAt: new Date().toISOString() };
  return { messages, send, config, cj: vm.runInContext('window.__cj', ctx) };
}

test('Canyon Jump reports a Free Play run through the bridge', async () => {
  const { messages, send, config, cj } = boot('free');
  assert.equal(messages[0]?.type, 'ta:hello');
  await send('ta:mount', config); assert.equal(messages.at(-1)?.type, 'ta:ready');
  await send('ta:start');
  assert.equal(cj.G.screen, 'play'); assert.ok(messages.some(m => m.type === 'ta:run_started'));
  await send('ta:pause'); const z = cj.run.z; for (let i = 0; i < 30; i++) cj.update(1 / 60); assert.equal(cj.run.z, z, 'paused run is frozen');
  await send('ta:resume');
  for (let i = 0; i < 60 * 240 && cj.G.screen !== 'end'; i++) cj.update(1 / 60); // no input: crash or fall short
  const done = messages.find(m => m.type === 'ta:run_complete')?.payload;
  assert.ok(done, 'run_complete sent');
  assert.equal(done.gameId, 'canyon-jump'); assert.equal(done.mode, 'free');
  assert.ok(Number.isInteger(done.primaryMetric) && done.primaryMetric > 0);
  assert.equal(done.primaryMetric, cj.G.result.total);
  for (const v of Object.values(done.secondaryMetrics)) assert.ok(Number.isInteger(v));
  await send('ta:restart'); assert.equal(cj.G.screen, 'play');
  await send('ta:destroy'); assert.equal(messages.at(-1)?.type, 'ta:destroyed');
});

test('Canyon Jump refuses Passport Play and Raid mounts (Free Play only)', async () => {
  const { messages, send, config } = boot('ranked');
  await send('ta:mount', config);
  assert.equal(messages.at(-1)?.type, 'ta:error');
});
