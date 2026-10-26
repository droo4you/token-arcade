import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S0 = require('../src/sim.js'), L = require('../src/levels.js'), RES = require('../src/result.js');

for (const id of ['snake-river', 'grand-canyon']) test(`displayed + submitted score = sim score; roll-out is visual only (${id})`, () => {
  const S = id === L.DEFAULT ? S0 : S0.forLevel(L.get(id)); let landed = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = S.newRun(seed), G = { simScore: null, landingRoll: 0 }; let atEnd = null;
    while (!s.over && s.tick < 240 * 120) { S.step(s, S.bot(s)); s.events.length = 0; RES.capture(G, S, s); if (s.over) atEnd = JSON.stringify(S.score(s)); }
    if (s.reason === 'landed') { landed++; G.landingRoll = s.m * 0.5; for (let k = 0; k < 240; k++) RES.rollOut(G, s, 1 / 60); assert.notEqual(S.score(s).distance, JSON.parse(atEnd).distance, 'roll-out moved the car (would have inflated)'); }
    const shown = RES.final(G, S, s), sub = RES.submission(shown, s);
    assert.equal(JSON.stringify(shown), atEnd, `seed ${seed}: results screen / best / replay use the sim score`);
    assert.equal(sub.primaryMetric, JSON.parse(atEnd).total); assert.equal(sub.secondaryMetrics.distance, JSON.parse(atEnd).distance);
  }
  assert.ok(landed >= 3, 'landed runs ' + landed);
});
