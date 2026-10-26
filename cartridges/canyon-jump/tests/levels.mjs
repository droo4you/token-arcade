import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../src/sim.js');
const L = require('../src/levels.js');

test('every level validates', () => {
  assert.ok(L.LEVELS.length >= 1);
  for (const lvl of L.LEVELS) assert.deepEqual(L.validate(lvl), [], lvl.id);
  assert.equal(new Set(L.LEVELS.map(l => l.id)).size, L.LEVELS.length, 'ids unique');
});
test('level gameplay numbers match the running sim (until newRun takes a level)', () => {
  for (const lvl of L.LEVELS) assert.deepEqual(L.simMismatches(lvl, S.forLevel(lvl).C), [], lvl.id);
  assert.deepEqual(L.simMismatches(L.get('snake-river'), S.C), [], 'base sim is Snake River');
});
test('validator catches broken levels', () => {
  const bad = structuredClone(L.get(L.DEFAULT));
  bad.time.sky.zenith = 'purple'; bad.sim.CLEAR_V = 0; delete bad.obstacles.cone; bad.terrain.scatter.minX = 2;
  const errs = L.validate(bad);
  assert.ok(errs.some(e => e.includes('zenith')) && errs.some(e => e.includes('CLEAR_V')) && errs.some(e => e.includes('cone')) && errs.some(e => e.includes('minX')), errs.join('; '));
  assert.equal(L.get('nope').id, L.DEFAULT, 'unknown id falls back to the default level');
});
