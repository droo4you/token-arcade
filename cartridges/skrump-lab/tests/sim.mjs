import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const S = createRequire(import.meta.url)('../src/sim.js');
const PLAN = [['F', 85, 40], ['F', 96, 25], ['F', 90, 40], ['F', 70, 55]];

function live(seed, plan) { // the way the browser drives it: step by step
  const run = S.newRun(seed);
  for (const a of plan) { if (run.phase === 'figdone') S.next(run); if (a[0] === 'F') { assert.ok(S.fire(run, a[1], a[2])); while (run.phase === 'flight') S.step(run); } else assert.ok(S.conclude(run)); }
  if (run.phase === 'figdone') S.next(run);
  return run;
}

test('same seed + inputs gives an identical run (twice live, and via replay)', () => {
  for (const seed of [1, 7, 42, 99991]) {
    const a = live(seed, PLAN), b = live(seed, PLAN), r = S.replay(seed, PLAN);
    assert.equal(S.stateHash(a), S.stateHash(b)); assert.equal(S.stateHash(a), S.stateHash(r.run));
    assert.deepEqual(S.score(a), S.score(b)); assert.deepEqual(S.score(a), r.result);
    assert.equal(r.finished, true); assert.deepEqual(r.run.inputs, PLAN);
  }
});

test('different inputs or seeds diverge', () => {
  const a = S.replay(7, PLAN), b = S.replay(7, [['F', 84, 40], ...PLAN.slice(1)]), c = S.replay(8, PLAN);
  assert.notEqual(S.stateHash(a.run), S.stateHash(b.run)); assert.notEqual(S.stateHash(a.run), S.stateHash(c.run));
});

test('sim uses no clock, no Math.random and no transcendental math', () => {
  const src = fs.readFileSync(new URL('../src/sim.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const bad of ['Math.random', 'Date.now', 'performance', 'Math.sin', 'Math.cos', 'Math.atan', 'Math.pow', 'Math.exp', 'Math.log', 'Math.hypot', 'window', 'document']) assert.ok(!src.includes(bad), bad);
});

test('pile seeds: deterministic, always 36 / 44 subjects, no overlaps, all resting', () => {
  const variants = [new Set(), new Set()];
  for (let seed = 0; seed < 200; seed++) for (const fig of [0, 1]) {
    const L = S.layout(fig, seed), L2 = S.layout(fig, seed);
    assert.deepEqual(L, L2);
    assert.equal(L.subs.length, S.FIGS[fig].N);
    variants[fig].add(JSON.stringify(L.subs.map(s => [s.x, s.y])));
    for (let i = 0; i < L.subs.length; i++) for (let j = i + 1; j < L.subs.length; j++) { const dx = L.subs[i].x - L.subs[j].x, dy = L.subs[i].y - L.subs[j].y; assert.ok(dx * dx + dy * dy >= 0.999, `overlap seed ${seed}`); }
    for (const s of L.subs) assert.ok(s.x > 10 && s.x < 60, 'pile out of range');
  }
  assert.ok(variants[0].size >= 10 && variants[1].size >= 20, 'seeds vary the layout');
});

test('an untouched pile stays put (a miss displaces nothing)', () => {
  for (const seed of [1, 2, 3, 4, 5]) { const r = S.replay(seed, [['F', 5, 5]]); assert.equal(r.run.figs[0].displaced, 0); assert.equal(r.run.figs[0].wasted, 1); }
});

test('scoring formula', () => {
  const P = S.PTS, F2 = S.FIGS[1];
  const f = (shots, extra) => ({ shots, shotsFired: shots.length, cleared: false, overkill: 0, wasted: 0, ...extra });
  assert.deepEqual(S.figScore(f([{ displaced: 10 }, { displaced: 0 }], { wasted: 1 }), F2), { displacedPts: 1000, clearBonus: 0, penalty: P.wasted, total: 1000 - P.wasted });
  // full clear after 2 of 3 shells: +clear +1 unused shell
  assert.equal(S.figScore(f([{ displaced: 30 }, { displaced: 14 }], { cleared: true }), F2).total, 4400 + P.clear + P.unusedShell);
  // full clear in 2 then an overkill 3rd shot: no unused-shell bonus, -overkill
  assert.equal(S.figScore(f([{ displaced: 30 }, { displaced: 14 }, { displaced: 0 }], { cleared: true, overkill: 1 }), F2).total, 4400 + P.clear - P.overkill);
  assert.equal(S.figScore(f([{ displaced: 0 }], { wasted: 1 }), S.FIGS[0]).total, 0, 'floored at 0');
  // end-to-end: score == sum of the formula over the shot log
  const r = S.replay(7, PLAN).result; let sum = 0;
  for (const fg of r.figs) { const ref = fg.displaced * P.perSubject + (fg.cleared ? P.clear + P.unusedShell * (S.FIGS[fg.id - 1].shots - fg.shots) : 0) - P.overkill * fg.overkill - P.wasted * fg.wasted; sum += Math.max(0, ref); }
  assert.equal(r.total, sum); assert.ok(Number.isInteger(r.total) && r.total > 0);
});

test('replay rejects illegal input records', () => {
  assert.ok(S.replay(1, [['F', 50, 50], ['F', 50, 50], ['F', 50, 50], ['F', 50, 50], ['F', 50, 50]]).error);
  assert.ok(S.replay(1, [['E']]).error, 'cannot conclude before a full clear');
  assert.ok(S.replay(1, [['X']]).error);
  assert.deepEqual(S.clampQ(300, 400), [60, 80]);
});
