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
const context2d = new Proxy({}, { get: (_target, key) => key === 'createLinearGradient'
  ? () => ({ addColorStop: noop }) : noop, set: () => true });
const element = () => ({ style: { setProperty: noop }, classList: { contains: () => false, toggle: noop },
  getContext: () => context2d, addEventListener: noop, setAttribute: noop, append: noop, appendChild: noop, remove: noop,
  focus: noop, querySelectorAll: () => [], querySelector: () => element(),
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }) });

test('Two Places adapter sends a native level clear and input proof through the bridge', async () => {
  const messages = [];
  const listeners = new Map();
  const add = (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); };
  const remove = (type, fn) => listeners.get(type)?.delete(fn);
  const parent = { postMessage(data, origin) {
    assert.equal(origin, 'http://127.0.0.1:5173'); messages.push(data);
  } };
  const sandbox = { console, Math, JSON, Date, URLSearchParams, performance: { now: () => 0 },
    innerWidth: 1280, innerHeight: 720, parent, TA_HOST_ORIGINS: ['http://127.0.0.1:5173'],
    location: { search: '?ta=1&ta_host=http%3A%2F%2F127.0.0.1%3A5173&ta_channel=bridge-smoke' },
    crypto: { randomUUID: () => 'next-local-run' },
    localStorage: { getItem: () => null, setItem: noop }, navigator: { getGamepads: () => [] },
    document: { getElementById: element, createElement: element, body: element(), documentElement: element(),
      addEventListener: add, removeEventListener: remove },
    matchMedia: () => ({ matches: false }), addEventListener: add, removeEventListener: remove,
    requestAnimationFrame: noop, cancelAnimationFrame: noop, setInterval: noop, clearInterval: noop,
    Image: class { set src(_) {} },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'packages/sdk/browser/bridge.js'), 'utf8'), ctx);
  const html = fs.readFileSync(path.join(cabinet, 'arcade.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="(src\/[^"]+)"/g)].map(match => match[1]);
  for (const file of scripts) vm.runInContext(fs.readFileSync(path.join(cabinet, file), 'utf8'), ctx);
  const x = vm.runInContext('({ game, Input, update, loop })', ctx);
  const send = async (type, payload = {}) => {
    for (const fn of [...(listeners.get('message') ?? [])]) await fn({ origin: 'http://127.0.0.1:5173', source: parent,
      data: { ta: 1, channel: 'bridge-smoke', type, payload } });
  };
  const config = { runId: 'two-places-smoke', gameId: 'two-places', gameVersion: '1.0.0',
    mode: 'ranked', objective: 'completion_time', rules: { level: 0 }, startedAt: new Date().toISOString() };
  assert.equal(messages[0]?.type, 'ta:hello');
  await send('ta:mount', config);
  assert.equal(messages.at(-1)?.type, 'ta:ready');
  await send('ta:start');
  assert.equal(x.game.screen, 'play');
  assert.equal(messages.at(-1)?.type, 'ta:run_started');
  const track = JSON.parse(fs.readFileSync(path.join(root, 'apps/api/test/fixtures/twoPlacesLevel1.json'), 'utf8')).tracks[0];
  const actions = ['left', 'right', 'up', 'down', 'jump', 'run', 'act', 'swap', 'call', 'ability', 'restart'];
  let index = 0;
  x.Input.poll = () => {
    const packed = track[index++];
    if (packed === undefined) throw new Error('Native game requested input after fixture ended.');
    x.Input.held = {};
    x.Input.pressed = {};
    actions.forEach((action, bit) => {
      x.Input.held[action] = !!(packed & (1 << bit));
      x.Input.pressed[action] = !!(packed & (1 << (bit + actions.length)));
    });
  };
  for (; index < 100; ) x.update();
  await send('ta:pause');
  const frozen = x.game.levelTime;
  x.loop(1000); x.loop(1016);
  assert.equal(x.game.levelTime, frozen);
  await send('ta:resume');
  while (index < track.length) x.update();
  const result = messages.find(m => m.type === 'ta:run_complete')?.payload;
  assert.ok(result, 'native level clear emitted a result');
  assert.equal(result.primaryMetric, 9017);
  assert.equal(result.secondaryMetrics.apples, 2);
  assert.equal(result.proof.tracks[0].length, track.length);
  assert.deepEqual(Array.from(result.proof.tracks[0]), track);
  await send('ta:destroy');
  assert.equal(sandbox.TokenArcade.active, false);
  assert.equal(listeners.get('message')?.size, 0);
  assert.equal(messages.at(-1)?.type, 'ta:destroyed');
});
