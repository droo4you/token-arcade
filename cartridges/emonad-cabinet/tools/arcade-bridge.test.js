const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makeTrial } = require('./harness');
const { verify } = require('./verify');

test('eMONAD adapter starts on first grip and completes a native run through the bridge', async () => {
  const messages = [];
  const listeners = new Map();
  const parent = { postMessage(data, origin) {
    assert.equal(origin, 'http://127.0.0.1:5173');
    messages.push(data);
  } };
  const add = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
  };
  const remove = (name, fn) => listeners.get(name)?.delete(fn);
  const skin = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'skin.json'), 'utf8'));
  const trial = makeTrial(390, 844, { beforeLoad(sandbox, context, { el }) {
    sandbox.innerWidth = 390;
    sandbox.innerHeight = 844;
    sandbox.devicePixelRatio = 1;
    sandbox.window = sandbox;
    sandbox.parent = parent;
    sandbox.TA_HOST_ORIGINS = ['http://127.0.0.1:5173'];
    sandbox.crypto = { randomUUID: () => 'next-local-run' };
    sandbox.addEventListener = add;
    sandbox.removeEventListener = remove;
    sandbox.document.body = el('body');
    sandbox.document.addEventListener = add;
    sandbox.document.removeEventListener = remove;
    sandbox.location.search = '?ta=1&ta_host=http%3A%2F%2F127.0.0.1%3A5173&ta_channel=bridge-smoke';
    sandbox.fetch = async () => ({ ok: true, json: async () => skin });
    for (const file of [
      path.resolve(__dirname, '../../../packages/sdk/browser/bridge.js'),
      path.resolve(__dirname, '../src/arcade-seed.js'),
    ]) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  } });
  const send = async (type, payload = {}) => {
    for (const fn of [...(listeners.get('message') ?? [])]) {
      await fn({ origin: 'http://127.0.0.1:5173', source: parent,
        data: { ta: 1, channel: 'bridge-smoke', type, payload } });
    }
  };
  const config = { runId: 'emonad-smoke', gameId: 'emonad-cabinet', gameVersion: '1.0.0',
    mode: 'ranked', objective: 'score', seed: 'opaque-seed',
    rules: { viewportWidth: 390, viewportHeight: 844 }, startedAt: new Date().toISOString() };
  assert.equal(messages[0]?.type, 'ta:hello');
  await send('ta:mount', config);
  assert.equal(messages.at(-1)?.type, 'ta:ready');
  await send('ta:start');
  assert.equal(messages.some(m => m.type === 'ta:run_started'), false);
  assert.equal(trial.BB.state.ready, false);
  trial.el('c').fire('pointerdown', { clientX: 30 });
  assert.equal(messages.at(-1)?.type, 'ta:run_started');
  assert.equal(trial.BB.state.ready, true);
  let result;
  for (let frame = 0; frame < 12_000 && !result; frame++) {
    trial.frame(16, 30);
    result = messages.find(m => m.type === 'ta:run_complete')?.payload;
  }
  assert.ok(result, 'native game-over emits a bridge result');
  assert.ok(result.secondaryMetrics.ticks > 0);
  assert.equal(result.primaryMetric, Math.round(trial.BB.state.ath));
  assert.equal(result.secondaryMetrics.ticks, trial.BB.state.steps);
  assert.equal(result.proof.seed, trial.sandbox.moodSwingsSeed(config.seed));
  assert.equal(result.proof.w, 390);
  assert.equal(result.proof.h, 844);
  assert.equal(verify(result.proof).ok, true, 'server source replay matches the native bridge proof');
  await send('ta:destroy');
  assert.equal(trial.sandbox.TokenArcade.active, false);
  assert.equal(listeners.get('message')?.size, 0);
  assert.equal(messages.at(-1)?.type, 'ta:destroyed');
});
