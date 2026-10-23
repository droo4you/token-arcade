import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const req = createRequire(import.meta.url);
const S = req('../src/sim.js'), WP = req('../src/weapons.js');
const golden = JSON.parse(fs.readFileSync(new URL('./fixtures/v1-golden.json', import.meta.url), 'utf8'));
const golden2 = JSON.parse(fs.readFileSync(new URL('./fixtures/v2-golden.json', import.meta.url), 'utf8'));
const golden3 = JSON.parse(fs.readFileSync(new URL('./fixtures/v3-golden.json', import.meta.url), 'utf8'));
const golden4 = JSON.parse(fs.readFileSync(new URL('./fixtures/v4-golden.json', import.meta.url), 'utf8'));
const golden5 = JSON.parse(fs.readFileSync(new URL('./fixtures/v5-golden.json', import.meta.url), 'utf8'));

// play through to FIG idx with a fixed lead-in, then fire `plan` at it
const LEAD = [[['F', 85, 40]], [['F', 100, 20], ['F', 100, 10], ['F', 90, 40]], [['F', 85, 45], ['F', 90, 35]], [['F', 98, 15]]];
function onFig(idx, plan) { let ins = []; for (let i = 0; i < idx; i++) ins = ins.concat(LEAD[i]); return ins.concat(plan); }
const PLANS = { catapult: [['F', 85, 40]], tank: [['F', 100, 20], ['F', 100, 10], ['F', 60, 70]], trailDrop: [['F', 85, 45], ['F', 90, 35]], blastOne: [['F', 98, 15]], biggerTrail: [['F', 90, 45], ['F', 100, 35], ['F', 85, 55]] };

test('registry: every weapon has the full slot contract', () => {
  for (const [k, w] of Object.entries(WP.WEAPONS)) {
    assert.equal(w.id, k);
    for (const f of ['fig', 'name', 'owner', 'shells', 'N', 'layout', 'launcher', 'fire', 'proj', 'rules', 'lines']) assert.ok(w[f] !== undefined, `${k}.${f}`);
    assert.ok(['ballistic', 'direct'].includes(w.fire.arc)); assert.ok(w.fire.burst >= 1 && w.fire.spread.length >= 1);
    assert.ok(w.fire.burst === 1 || w.fire.gap > 0 || (w.fire.pattern && w.fire.pattern.length === w.fire.burst)); assert.ok(w.owner.token && w.lines.intro);
  }
  assert.deepEqual(S.FIGS.map(F => F.id), [1, 2, 3, 4, 5]); assert.deepEqual(S.FIGS.map(F => F.key), ['catapult', 'tank', 'trailDrop', 'blastOne', 'biggerTrail']); assert.deepEqual(S.lineup(4).map(F => F.key), ['catapult', 'tank', 'trailDrop', 'blast']); assert.deepEqual(S.lineup(5).map(F => F.key), ['catapult', 'tank', 'trailDrop', 'blastOne', 'biggerTank']); assert.deepEqual(S.lineup(3).map(F => F.key), ['catapult', 'tank', 'trail', 'consensus']);
  assert.deepEqual(S.lineup(1).map(F => F.key), ['catapult', 'tank']); assert.deepEqual(S.lineup(2).map(F => F.key), ['catapult', 'tank', 'rapid']); assert.equal(S.SIM_VERSION, 6);
});

for (const [v, gold] of [[1, () => golden], [2, () => golden2], [3, () => golden3], [4, () => golden4], [5, () => golden5]]) test(`v${v} records replay bit-identically (golden fixture)`, () => {
  for (const c of gold().cases) {
    const r = S.replay(c.seed, c.inputs, { simVersion: v });
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

for (const idx of [2, 3]) test(`${S.FIGS[idx].key}: one shell = a burst of rounds, spaced by the rate`, () => {
  const F = S.FIGS[idx], r = S.newRun(5); const ins = onFig(idx, []);
  for (const x of ins) { if (r.phase === 'figdone') S.next(r); S.fire(r, x[1], x[2]); while (r.phase === 'flight') S.step(r); }
  S.next(r); assert.equal(r.fig, idx); S.fire(r, 99, 15);
  const rounds = () => r.bodies.filter(b => b.kind === 'proj').length;
  const PT = F.fire.pattern, firstN = PT ? PT.filter(p => p.t === 0).length : 1; assert.equal(rounds(), firstN);
  const last = PT ? PT[PT.length - 1].t : F.fire.gap * (F.fire.burst - 1); for (let i = 0; i < last; i++) S.step(r);
  assert.equal(rounds(), F.fire.burst); assert.equal(S.cur(r).shotsFired, 1, 'a burst costs one shell');
  if (PT && PT.length > 1 && PT[1].t > 0) { const gaps = PT.slice(1).map((p, i) => p.t - PT[i].t), pw = PT.map(p => p.p);
    assert.ok(gaps.every((g, i) => i === 0 || g >= gaps[i - 1]) && gaps[gaps.length - 1] > gaps[0], 'drop-off: gaps grow along the chain');
    assert.ok(pw.every((v, i) => i === 0 || v < pw[i - 1]), 'drop-off: power falls along the chain'); }
  const P = r.bodies.filter(b => b.kind === 'proj');
  if (F.fire.lead) { assert.equal(P[0].r, F.fire.lead.r); assert.ok(P.slice(1).every(b => b.r === F.proj.r && b.r < P[0].r), 'small chain behind a bigger lead');
    if (!PT) assert.ok(P.every((b, i) => i === 0 || b.x <= P[i - 1].x), 'chain trails the lead in order'); }
  else if (F.fire.pattern) assert.equal(P.length, F.fire.pattern.length);
  else { const ys = P.map(b => b.vy); assert.ok(new Set(ys.map(v => v.toFixed(3))).size > 1, 'spread varies rounds'); }
});

const L4 = [['F', 85, 40], ['F', 100, 20], ['F', 100, 10], ['F', 90, 40], ['F', 85, 45], ['F', 90, 35]];
const bestShare = (v, idx, lead, cands, seeds = 5) => { const out = []; for (let seed = 1; seed <= seeds; seed++) { let best = 0; for (const q of cands) { const r = S.replay(seed, [...lead, ['F', ...q]], { simVersion: v }); best = Math.max(best, r.run.figs[idx].shots.slice(-1)[0].displaced / r.run.figs[idx].N); } out.push(best); } return out; };
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;

test('balance: FIG.4 one-shell blast takes most but not all (best aim ~70-85%), weaker than v4 blast; still beats the trail', () => {
  const blast = bestShare(5, 3, L4, S.FIGS[3].auto, 6), oldBlast = bestShare(4, 3, L4, S.lineup(4)[3].auto, 6), trail = bestShare(5, 2, L4.slice(0, 4), S.FIGS[2].auto, 6);
  assert.ok(avg(blast) >= 0.62 && avg(blast) <= 0.88, 'blast avg ' + avg(blast)); assert.ok(blast.every(x => x < 1), 'never an automatic full clear: ' + blast);
  assert.ok(avg(blast) < avg(oldBlast), 'toned down'); assert.ok(avg(trail) < avg(blast), 'trail ' + avg(trail) + ' < blast');
  const aims = S.FIGS[3].auto.map(q => S.replay(2, [...L4, ['F', ...q]]).run.figs[3].displaced); assert.ok(Math.max(...aims) - Math.min(...aims) >= 10, 'aim matters: ' + aims);
});

test('balance: A BIGGER TANK hits hardest per shell but needs more than one well-aimed shell', () => {
  const lead = [...L4, ['F', 98, 15]], big = bestShare(5, 4, lead, S.FIGS[4].auto, 6), tank = bestShare(5, 1, [['F', 85, 40]], S.FIGS[1].auto, 6);
  assert.ok(avg(big) > avg(tank), `bigger trail-tank ${avg(big)} > tank ${avg(tank)}`); assert.ok(big.every(x => x < 1), 'no one-shell clear: ' + big);
  const v5 = bestShare(5, 4, lead, S.lineup(5)[4].auto, 6);
  assert.ok(avg(big) >= avg(v5) - 0.05, 'trail-tank at least as strong as v5 single shell');
});

test('A BIGGER TANK rolls forward each shell (approach speed) and fires a heavy lead + drop-off trail', () => {
  const F = S.FIGS[4], PT = F.fire.pattern;
  assert.ok(F.fire.lead && PT && PT.length === 9); assert.equal(PT[0].t, 0);
  const gaps = PT.slice(1).map((p, i) => p.t - PT[i].t), pw = PT.map(p => p.p);
  assert.ok(gaps.every((g, i) => i === 0 || g >= gaps[i - 1]) && gaps[gaps.length - 1] > gaps[0], 'gaps grow');
  assert.ok(pw.every((v, i) => i === 0 || v < pw[i - 1]), 'power falls');
  const run = S.newRun(5); for (const x of onFig(4, [])) { if (run.phase === 'figdone') S.next(run); S.fire(run, x[1], x[2]); S.settle(run); } S.next(run);
  assert.equal(run.fig, 4); S.fire(run, 90, 45);
  assert.equal(run.shot.projs.length, 1); assert.equal(run.shot.projs[0].r, F.fire.lead.r);
  while (run.shot && run.shot.t < PT[PT.length - 1].t) S.step(run);
  assert.equal(run.shot.projs.length, 9); assert.ok(run.shot.projs.slice(1).every(b => b.r === F.proj.r && b.r < F.fire.lead.r));
  assert.ok(run.shot.projs.every((b, i) => i === 0 || b.x <= run.shot.projs[i - 1].x + 0.01), 'chain trails the lead');
  S.settle(run);
  const xs = []; const run2 = S.newRun(5); for (const x of onFig(4, [])) { if (run2.phase === 'figdone') S.next(run2); S.fire(run2, x[1], x[2]); S.settle(run2); } S.next(run2);
  for (let k = 0; k < 4; k++) { xs.push(S.muzzleX(run2)); S.fire(run2, 50, 50); assert.equal(run2.shot.projs[0].x, xs[k]); S.settle(run2); }
  assert.deepEqual(xs.map(x => x - F.launcher.x), [0, 3, 6, 9]); assert.equal(run2.phase, 'figdone'); S.next(run2); assert.equal(run2.over, true, 'FIG.5 is the finale');
});

test('blast: dozens of rounds, settled rounds despawn, still deterministic', () => {
  const ins = [...L4, ['F', 99, 15]];
  const a = S.replay(11, ins), b = S.replay(11, ins); assert.equal(S.stateHash(a.run), S.stateHash(b.run));
  const run = S.newRun(11); for (const x of ins) { if (run.phase === 'figdone') S.next(run); S.fire(run, x[1], x[2]); S.settle(run); } // stop before FIG.5 replaces the bodies
  assert.equal(run.fig, 3); const P = run.bodies.filter(x => x.kind === 'proj' && x.r === S.FIGS[3].proj.r);
  assert.ok(P.length >= 40, 'blast rounds: ' + P.length); assert.ok(P.filter(x => x.gone).length > 0, 'settled rounds despawned');
});

test('ceasefire gag only on weapons that declare it', () => {
  const r = S.replay(9, onFig(4, PLANS.biggerTrail)).run; assert.equal(r.figs[4].ceasefire, null); assert.equal(r.figs[1].ceasefire, 'denied'); assert.equal(r.figs[2].ceasefire, null); assert.equal(r.figs[3].ceasefire, null); assert.equal(r.figs[0].ceasefire, null);
});
