import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const req = createRequire(import.meta.url);
const S = req('../src/sim.js'), WP = req('../src/weapons.js');
const golden = JSON.parse(fs.readFileSync(new URL('./fixtures/v1-golden.json', import.meta.url), 'utf8'));

// play through to FIG idx with a fixed lead-in, then fire `plan` at it
const LEAD = [[['F', 85, 40]], [['F', 100, 20], ['F', 100, 10], ['F', 90, 40]]];
function onFig(idx, plan) { let ins = []; for (let i = 0; i < idx; i++) ins = ins.concat(LEAD[i]); return ins.concat(plan); }
const PLANS = { catapult: [['F', 85, 40]], tank: [['F', 100, 20], ['F', 100, 10], ['F', 60, 70]], rapid: [['F', 98, 15], ['F', 99, 8], ['F', 95, 30]] };

test('registry: every weapon has the full slot contract', () => {
  for (const [k, w] of Object.entries(WP.WEAPONS)) {
    assert.equal(w.id, k);
    for (const f of ['fig', 'name', 'owner', 'shells', 'N', 'layout', 'launcher', 'fire', 'proj', 'rules', 'lines']) assert.ok(w[f] !== undefined, `${k}.${f}`);
    assert.ok(['ballistic', 'direct'].includes(w.fire.arc)); assert.ok(w.fire.burst >= 1 && w.fire.spread.length >= 1);
    assert.ok(w.fire.burst === 1 || w.fire.gap > 0); assert.ok(w.owner.token && w.lines.intro);
  }
  assert.deepEqual(S.FIGS.map(F => F.id), [1, 2, 3]); assert.deepEqual(S.lineup(1).map(F => F.key), ['catapult', 'tank']);
});

test('v1 records replay bit-identically (golden from b4f39c2, pre-refactor)', () => {
  for (const c of golden.cases) {
    const r = S.replay(c.seed, c.inputs, { simVersion: 1 });
    assert.ok(!r.error, r.error);
    assert.equal(S.stateHash(r.run), c.hash, `seed ${c.seed}`); assert.equal(r.result.total, c.total); assert.equal(r.result.ticks, c.ticks);
    assert.equal(r.finished, c.finished); assert.deepEqual(r.result.figs.map(f => [f.displaced, f.shots, f.total]), c.figs);
  }
});

for (const [k, plan] of Object.entries(PLANS)) {
  const idx = S.FIGS.findIndex(F => F.key === k);
  test(`${k}: deterministic (live stepping == replay, repeatable, seed-sensitive)`, () => {
    for (const seed of [3, 77, 4242]) {
      const ins = onFig(idx, plan), a = S.replay(seed, ins), b = S.replay(seed, ins);
      const run = S.newRun(seed); for (const x of ins) { if (run.phase === 'figdone') S.next(run); if (x[0] === 'F') { assert.ok(S.fire(run, x[1], x[2])); while (run.phase === 'flight') S.step(run); } }
      if (run.phase === 'figdone') S.next(run);
      assert.equal(S.stateHash(a.run), S.stateHash(b.run)); assert.equal(S.stateHash(a.run), S.stateHash(run)); assert.deepEqual(a.result, S.score(run));
      assert.notEqual(S.stateHash(S.replay(seed + 1, ins).run), S.stateHash(a.run));
    }
  });
  test(`${k}: scoring = locked formula over its shot log`, () => {
    const P = S.PTS, F = S.FIGS[idx];
    for (const seed of [3, 77, 4242]) {
      const r = S.replay(seed, onFig(idx, plan)), f = r.run.figs[idx], fs = r.result.figs[idx];
      assert.equal(f.shotsFired, plan.length); assert.ok(f.shotsFired <= F.shells);
      let pts = 0; for (const s of f.shots) pts += s.displaced * P.perSubject;
      const ref = Math.max(0, pts + (f.cleared ? P.clear + P.unusedShell * (F.shells - f.shotsFired) : 0) - P.overkill * f.overkill - P.wasted * f.wasted);
      assert.equal(fs.total, ref); assert.equal(fs.weapon, k);
      assert.equal(f.shots.reduce((a, s) => a + s.displaced, 0), f.displaced, 'per-shot gains sum to the FIG tally');
      assert.ok(f.displaced > 0 && f.displaced <= f.N && f.N === F.N);
    }
    const full = S.replay(3, onFig(idx, [...plan, ...Array(F.shells - plan.length + 1).fill(['F', 50, 50])]));
    if (idx === S.FIGS.length - 1) assert.ok(full.error, 'cannot exceed shell count'); else assert.equal(full.run.figs[idx].shotsFired, F.shells, 'extra shot rolls to the next FIG');
  });
}

test('rapid fire: one shell = a burst of rounds, spaced by the rate', () => {
  const F = S.FIGS[2], r = S.newRun(5); const ins = onFig(2, []);
  for (const x of ins) { if (r.phase === 'figdone') S.next(r); S.fire(r, x[1], x[2]); while (r.phase === 'flight') S.step(r); }
  S.next(r); assert.equal(r.fig, 2); S.fire(r, 100, 15);
  const rounds = () => r.bodies.filter(b => b.kind === 'proj').length;
  assert.equal(rounds(), 1); for (let i = 0; i < F.fire.gap * (F.fire.burst - 1); i++) S.step(r);
  assert.equal(rounds(), F.fire.burst); assert.equal(S.cur(r).shotsFired, 1, 'a burst costs one shell');
  const ys = r.bodies.filter(b => b.kind === 'proj').map(b => b.vy); assert.ok(new Set(ys.map(v => v.toFixed(3))).size > 1, 'spread varies rounds');
});

test('ceasefire gag only on weapons that declare it', () => {
  const r = S.replay(9, onFig(2, PLANS.rapid)).run; assert.equal(r.figs[1].ceasefire, 'denied'); assert.equal(r.figs[2].ceasefire, null); assert.equal(r.figs[0].ceasefire, null);
});
