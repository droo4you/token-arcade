import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SIM = require('../releases/1.0.0/src/sim.js');
const root = new URL('../releases/1.0.0/', import.meta.url);

function digest(seed) {
  const run = SIM.botRun(seed);
  const again = SIM.create(seed);
  let h = 2166136261;
  for (let i = 0; i < run.input.length; i++) {
    if (again.over) return { error: 'late', run };
    SIM.step(again, SIM.ALPHA.indexOf(run.input[i]));
    h = Math.imul(h ^ (Math.floor(again.z * 1000) >>> 0), 16777619);
    h = Math.imul(h ^ (Math.floor(again.gap * 1000) >>> 0), 16777619);
    h = Math.imul(h ^ again.trickPoints, 16777619);
    h = Math.imul(h ^ again.x * 100 | 0, 16777619);
  }
  return { run, replay: SIM.result(again), hash: h >>> 0, over: again.over };
}

test('Powderline rules are integer and a replay matches the live run', () => {
  const seeds = [1, 11, 42, 99, 2166136261];
  const scores = new Set();
  for (const seed of seeds) {
    const first = digest(seed);
    const second = digest(seed);
    assert.equal(first.over, true);
    assert.deepEqual(first.replay, first.run.result);
    assert.equal(first.hash, second.hash);
    assert.equal(first.run.input, second.run.input);
    for (const key of ['score', 'distance', 'trickPoints', 'bestCombo', 'crashes', 'boosts', 'ticks']) {
      assert.equal(Number.isInteger(first.run.result[key]), true, key);
    }
    assert.equal(first.run.result.score, first.run.result.distance + first.run.result.trickPoints);
    assert.equal(first.run.result.cause, 'avalanche');
    assert.ok(first.run.result.distance > 400);
    assert.ok(first.run.result.trickPoints > 0);
    scores.add(first.run.result.score);
  }
  assert.ok(scores.size > 1, 'different seeds should not all score the same');
});

test('Free Play ignores an issued seed; Passport Play uses only that seed', () => {
  const issued = 'host-seed-powderline';
  const freeA = SIM.resolveRunSeed('free', issued, 5);
  const freeB = SIM.resolveRunSeed('free', 'a completely different seed', 5);
  assert.equal(freeA.source, 'local');
  assert.equal(freeA.seed, 5);
  assert.deepEqual(freeA, freeB);
  const ranked = SIM.resolveRunSeed('ranked', issued, 5);
  const raid = SIM.resolveRunSeed('raid', issued, 99);
  assert.equal(ranked.source, 'issued');
  assert.equal(ranked.seed, SIM.issuedSeed(issued));
  assert.equal(raid.seed, ranked.seed);
  assert.notEqual(ranked.seed, SIM.issuedSeed('other-seed'));
  assert.equal(SIM.resolveRunSeed('ranked', '', 1).error, 'missing seed');
});

test('tricks need air, and a grounded rider is not rewarded for swiping', () => {
  const state = SIM.create(3);
  SIM.step(state, 6);
  assert.equal(state.trick, null);
  assert.equal(state.trickPoints, 0);
  assert.equal(state.y, 0);
});

test('the hosted page keeps iOS swipe handling off the click path', () => {
  const boot = readFileSync(new URL('./src/boot.js', root), 'utf8');
  const css = readFileSync(new URL('./src/ui.css', root), 'utf8');
  const html = readFileSync(new URL('./arcade.html', root), 'utf8');
  assert.match(boot, /pointerdown/);
  assert.match(boot, /pointermove/);
  assert.match(boot, /touchmove/);
  assert.match(boot, /passive:\s*false/);
  assert.match(boot, /resolveRunSeed\('free'/);
  assert.match(boot, /preview = !embedded/);
  assert.match(css, /touch-action:\s*none/);
  assert.match(html, /\/sdk\/bridge\.js/);
  assert.doesNotMatch(css, /system-ui|Inter|Geist/);
});
