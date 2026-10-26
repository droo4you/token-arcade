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
  replaceChildren: noop, focus: noop, querySelectorAll: () => [], querySelector: () => element(),
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }) });

for (const [version, mode] of [['1.0.0', 'ranked'], ['1.1.0', 'ranked'], ['1.0.0', 'free'], ['1.1.0', 'free'], ['1.1.0', 'raid']]) test(`Two Places ${version} ${mode} sends a native level clear and input proof through the bridge`, async () => {
  const release = version === '1.0.0' ? cabinet : path.join(cabinet, 'releases/1.1.0');
  const messages = [];
  const elements = new Map();
  const byId = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const saved = new Map();
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
    localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) }, navigator: { getGamepads: () => [] },
    document: { getElementById: byId, createElement: element, body: element(), documentElement: element(),
      addEventListener: add, removeEventListener: remove },
    matchMedia: () => ({ matches: false }), addEventListener: add, removeEventListener: remove,
    requestAnimationFrame: noop, cancelAnimationFrame: noop, setInterval: noop, clearInterval: noop,
    Image: class { set src(_) {} },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'packages/sdk/browser/bridge.js'), 'utf8'), ctx);
  const html = fs.readFileSync(path.join(release, 'arcade.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="(src\/[^"]+)"/g)].map(match => match[1]);
  for (const file of scripts) vm.runInContext(fs.readFileSync(path.join(release, file), 'utf8'), ctx);
  const x = vm.runInContext('({ game, Input, update, loop })', ctx);
  const send = async (type, payload = {}) => {
    for (const fn of [...(listeners.get('message') ?? [])]) await fn({ origin: 'http://127.0.0.1:5173', source: parent,
      data: { ta: 1, channel: 'bridge-smoke', type, payload } });
  };
  const rules = version === '1.1.0' ? vm.runInContext('TWO_RULES', ctx) : null;
  let seed = 'test-seed';
  if (mode === 'raid') for (let i = 0; ; i++) { if (rules.order(String(i))[0] === 0) { seed = String(i); break; } }
  const config = { runId: 'two-places-smoke', gameId: 'two-places', gameVersion: version, seed,
    mode, objective: mode === 'raid' ? 'score' : 'completion_time', rules: version === '1.0.0' ? { level: 0 } : mode === 'raid' ? { format: rules.FORMAT, levelSet: rules.order(seed).join(',') } : { format: rules.FORMAT, level: 0 }, startedAt: new Date().toISOString() };
  assert.equal(messages[0]?.type, 'ta:hello');
  await send('ta:mount', config);
  assert.equal(messages.at(-1)?.type, 'ta:ready');
  await send('ta:start');
  if (mode === 'free') {
    assert.equal(x.game.screen, 'title', 'Free Play opens its menu');
    assert.equal(byId('free-menu').hidden, false);
    byId('free-continue').onclick();
  }
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
  if (mode === 'raid') { assert.equal(x.game.levelIndex, rules.order(seed)[1]); vm.runInContext('arcadeFinish()', ctx); }
  const result = messages.find(m => m.type === 'ta:run_complete')?.payload;
  assert.ok(result, 'native level clear emitted a result');
  assert.equal(result.primaryMetric, version === '1.0.0' ? 9017 : mode === 'raid' ? 1 : Math.round(track.length * 1000 / 60));
  assert.equal(result.secondaryMetrics.apples, 2);
  const decoded = version === '1.0.0' ? result.proof.tracks[0] : vm.runInContext('TWO_RULES', ctx).decode(result.proof.tracks[0]);
  assert.deepEqual(Array.from(decoded), track);
  if (mode === 'free') {
    assert.equal(JSON.parse(saved.get('ta.two-places.two-places.v1')).unlocked, 2);
    x.Input.poll = noop; x.Input.held = {}; x.Input.pressed = {};
    for (let i = 0; i < 45; i++) x.update();
    x.Input.pressed = { confirm: true }; x.update();
    assert.equal(x.game.levelIndex, 1, 'Free Play continues into the next unlocked level');
    byId('free-menu-open').onclick();
    assert.equal(x.game.screen, 'title');
    byId('free-choose').onclick(); assert.equal(byId('free-levels').hidden, false);
    vm.runInContext('freeLevel(2)', ctx); assert.equal(x.game.screen, 'title', 'locked levels cannot start');
    vm.runInContext('freeLevel(0)', ctx); assert.equal(x.game.levelIndex, 0, 'earlier unlocked levels can be replayed');
    assert.equal(byId('free-menu').hidden, true);
  }
  await send('ta:destroy');
  assert.equal(sandbox.TokenArcade.active, false);
  assert.equal(listeners.get('message')?.size, 0);
  assert.equal(messages.at(-1)?.type, 'ta:destroyed');
});
