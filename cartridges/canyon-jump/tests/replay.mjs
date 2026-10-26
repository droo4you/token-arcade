import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S0 = require('../src/sim.js'), L = require('../src/levels.js'), RP = require('../src/replay.js');

// Record a sloppy proxy-ish run (analog stick + edges), encode, decode, re-simulate: identical outcome, tick for tick.
function recordRun(S, seed, levelId) {
  const s = S.newRun(seed), rec = RP.recorder({ level: levelId, seed }); let k = 0;
  while (!s.over && s.tick < 200 * 120) {
    const i = RP.quant(Object.assign(S.bot(s), { pitch: undefined }));
    const b = S.bot(s); if (b.pitch != null) i.pitch = RP.quant({ pitch: b.pitch + Math.sin(k++ * 0.37) * 0.2 }).pitch; if (b.steer != null) i.steer = b.steer;
    RP.quant(i); rec.push(i); S.step(s, i); s.events.length = 0;
  }
  return { s, code: RP.encode(rec.data({ reason: s.reason, total: S.score(s).total })) };
}
for (const id of ['snake-river', 'grand-canyon']) test(`replay round trip is exact (${id})`, () => {
  const S = id === L.DEFAULT ? S0 : S0.forLevel(L.get(id));
  for (const seed of [3, 17, 2026]) {
    const { s, code } = recordRun(S, seed, id), d = RP.decode(code), inp = RP.inputs(d);
    assert.equal(inp.length, s.tick); assert.equal(d.level, id);
    const r = S.newRun(d.seed); for (const i of inp) { if (r.over) break; S.step(r, i); r.events.length = 0; }
    assert.equal(JSON.stringify(S.score(r)), JSON.stringify(S.score(s)), 'seed ' + seed);
    assert.equal(r.tick, s.tick); assert.ok(code.length < 60000, 'compact: ' + code.length);
  }
});
test('tokens round trip', () => {
  for (const i of [{}, { boostEdge: true, pitch: -0.37, steer: 1 }, { rollEdge: true, rollDir: -1, up: true }, { flipBackEdge: true, stabEdge: true, leftEdge: true }]) assert.deepEqual(RP.untoken(RP.token(i)), i);
});
