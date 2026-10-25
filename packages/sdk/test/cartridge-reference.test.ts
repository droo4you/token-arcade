import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { launchCabinets } from '../src/launch.ts';
import { validateRunResultShape } from '../src/validate.ts';

test('reference cartridge: published Registry entry -> handshake -> real run -> result -> pause/restart/destroy', async () => {
  const record = launchCabinets().find(g => g.manifest.id === 'skip-to-10k')!;
  assert.equal(record.status, 'published');
  assert.equal(record.manifest.entry?.kind, 'iframe');
  const messages: any[] = [];
  const listeners = new Map<string, Set<Function>>();
  const noop = () => {};
  const context2d = new Proxy({}, { get: (_t, k) => k === 'measureText' ? () => ({ width: 1 }) : noop, set: () => true });
  const element = () => ({ style: {}, setAttribute: noop, addEventListener: noop, append: noop, remove: noop, getContext: () => context2d,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 270 }) });
  const add = (name: string, fn: Function) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); };
  const remove = (name: string, fn: Function) => listeners.get(name)?.delete(fn);
  const parent = { postMessage: (data: any, origin: string) => { assert.equal(origin, 'http://127.0.0.1:5173'); messages.push(data); } };
  const sandbox: any = { console, URLSearchParams, Math, Date, JSON, Set, Map, Image: function() { this.complete = true; },
    innerWidth: 960, innerHeight: 540, screen: {}, crypto: { randomUUID: () => 'next-local-run' },
    TA_HOST_ORIGINS: ['http://127.0.0.1:5173'], parent,
    location: { search: '?ta=1&ta_host=http%3A%2F%2F127.0.0.1%3A5173&ta_channel=test-channel' },
    addEventListener: add, removeEventListener: remove,
    document: { getElementById: element, createElement: element, body: { append: noop, classList: { toggle: noop } }, documentElement: {}, addEventListener: add, removeEventListener: remove },
    matchMedia: () => ({ matches: false }), localStorage: { getItem: () => null, setItem: noop },
    performance: { now: () => 0 }, requestAnimationFrame: () => 1, cancelAnimationFrame: noop, clearInterval: noop, setInterval: noop, setTimeout: noop,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync('packages/sdk/browser/bridge.js', 'utf8'), sandbox);
  for (const file of ['font', 'sprites', 'sim', 'meta', 'rules', 'art', 'audio', 'main']) vm.runInContext(readFileSync(`cartridges/skip-to-10k/releases/1.1.0/src/${file}.js`, 'utf8'), sandbox);
  const execute = (code: string) => vm.runInContext(code, sandbox);
  const config = { runId: 'reference-run', gameId: record.manifest.id, gameVersion: record.manifest.version, mode: 'free' as const,
    objective: 'score' as const, startedAt: new Date().toISOString() };
  const send = async (type: string, payload: any = {}, origin = 'http://127.0.0.1:5173', source: any = parent) => {
    for (const fn of listeners.get('message') ?? []) await fn({ origin, source, data: { ta: 1, channel: 'test-channel', type, payload } });
  };
  assert.equal(messages[0].type, 'ta:hello');
  await send('ta:mount', config, 'https://untrusted.example');
  assert.equal(sandbox.TokenArcade.active, false);
  await send('ta:mount', config, undefined, {});
  assert.equal(sandbox.TokenArcade.active, false);
  await send('ta:mount', config);
  assert.equal(messages.at(-1).type, 'ta:ready');
  await send('ta:start');
  assert.equal(execute('G8.screen'), 'aim');
  execute('G8.aim.power=1; G8.aim.angle=15; doThrow()');
  await send('ta:pause');
  assert.equal(execute('G8.paused'), true);
  const time = execute('G8.run.t');
  execute('frame(16); frame(32)');
  assert.equal(execute('G8.run.t'), time);
  await send('ta:resume');
  execute('for(let i=0;i<120000 && G8.screen==="fly";i++) update(1/60)');
  const result = messages.find(m => m.type === 'ta:run_complete')?.payload;
  assert.ok(result, 'native terminal flight emitted a structured result');
  assert.equal(result.primaryMetric, execute('G8.res.score'));
  assert.equal(result.secondaryMetrics.peak, execute('SIM.results(G8.run).peak'));
  assert.equal(validateRunResultShape(config, result).valid, true);
  await send('ta:restart');
  assert.equal(execute('G8.screen'), 'aim');
  assert.equal(sandbox.TokenArcade.config.runId, 'next-local-run');
  await send('ta:destroy');
  assert.equal(execute('arcadeDestroyed'), true);
  assert.equal(listeners.get('message')?.size, 0);
  assert.equal(messages.at(-1).type, 'ta:destroyed');
});
