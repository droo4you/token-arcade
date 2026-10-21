import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const req = createRequire(import.meta.url);
const S = req('../src/sim.js'), WP = req('../src/weapons.js');
const golden = JSON.parse(fs.readFileSync(new URL('./fixtures/v1-golden.json', import.meta.url), 'utf8'));
const golden2 = JSON.parse(fs.readFileSync(new URL('./fixtures/v2-golden.json', import.meta.url), 'utf8'));
const golden3 = JSON.parse(fs.readFileSync(new URL('./fixtures/v3-golden.json', import.meta.url), 'utf8'));

// play through to FIG idx with a fixed lead-in, then fire `plan` at it
const LEAD = [[['F', 85, 40]], [['F', 100, 20], ['F', 100, 10], ['F', 90, 40]], [['F', 85, 45], ['F', 90, 35]]];
function onFig(idx, plan) { let ins = []; for (let i = 0; i < idx; i++) ins = ins.concat(LEAD[i]); return ins.concat(plan); }
const PLANS = { catapult: [['F', 85, 40]], tank: [['F', 100, 20], ['F', 100, 10], ['F', 60, 70]], trailDrop: [['F', 85, 45], ['F', 90, 35]], blast: [['F', 98, 15], ['F', 99, 8]] };

test('registry: every weapon has the full slot contract', () => {
  for (const [k, w] of Object.entries(WP.WEAPONS)) {
    assert.equal(w.id, k);
    for (const f of ['fig', 'name', 'owner', 'shells', 'N', 'layout', 'launcher', 'fire', 'proj', 'rules', 'lines']) assert.ok(w[f] !== undefined, `${k}.${f}`);
    assert.ok(['ballistic', 'direct'].includes(w.fire.arc)); assert.ok(w.fire.burst >= 1 && w.fire.spread.length >= 1);
    assert.ok(w.fire.burst === 1 || w.fire.gap > 0 || (w.fire.pattern && w.fire.pattern.length === w.fire.burst)); assert.ok(w.owner.token && w.lines.intro);
  }
  assert.deepEqual(S.FIGS.map(F => F.id), [1, 2, 3, 4]); assert.deepEqual(S.FIGS.map(F => F.key), ['catapult', 'tank', 'trailDrop', 'blast']); assert.deepEqual(S.lineup(3).map(F => F.key), ['catapult', 'tank', 'trail', 'consensus']);
  assert.deepEqual(S.lineup(1).map(F => F.key), ['catapult', 'tank']); assert.deepEqual(S.lineup(2).map(F => F.key), ['catapult', 'tank', 'rapid']); assert.equal(S.SIM_VERSION, 4);
});

for (const [v, gold] of [[1, () => golden], [2, () => golden2], [3, () => golden3]]) test(`v${v} records replay bit-identically (golden fixture)`, () => {
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

test('balance: trail < blast; blast is the strongest (flattens the pile); trail weaker than v3 trail', () => {
  const share = (v, idx, lead, cands) => { let t = 0; for (let seed = 1; seed <= 5; seed++) { let best = 0; for (const q of cands) { const r = S.replay(seed, [...lead, ['F', ...q]], { simVersion: v }); best = Math.max(best, r.run.figs[idx].shots[0].displaced / r.run.figs[idx].N); } t += best; } return t / 5; };
  const L3 = [['F', 85, 40], ['F', 100, 20], ['F', 100, 10], ['F', 90, 40]];
  const trail = share(4, 2, L3, S.FIGS[2].auto), blast = share(4, 3, [...L3, ['F', 85, 45], ['F', 90, 35]], S.FIGS[3].auto), oldTrail = share(3, 2, L3, S.lineup(3)[2].auto);
  assert.ok(trail < blast, `trail ${trail} < blast ${blast}`); assert.ok(blast >= 0.9, `blast flattens: ${blast}`); assert.ok(trail <= oldTrail, `drop-off trail ${trail} <= v3 trail ${oldTrail}`);
});

test('blast: dozens of rounds, settled rounds despawn, still deterministic', () => {
  const ins = [['F', 85, 40], ['F', 100, 20], ['F', 100, 10], ['F', 90, 40], ['F', 85, 45], ['F', 90, 35], ['F', 99, 15]];
  const a = S.replay(11, ins), b = S.replay(11, ins); assert.equal(S.stateHash(a.run), S.stateHash(b.run));
  const P = a.run.bodies.filter(x => x.kind === 'proj' && x.r === S.FIGS[3].proj.r);
  assert.ok(P.length >= 90, 'blast rounds: ' + P.length); assert.ok(P.filter(x => x.gone).length > 0, 'settled rounds despawned');
});

test('ceasefire gag only on weapons that declare it', () => {
  const r = S.replay(9, onFig(3, PLANS.blast)).run; assert.equal(r.figs[1].ceasefire, 'denied'); assert.equal(r.figs[2].ceasefire, null); assert.equal(r.figs[3].ceasefire, null); assert.equal(r.figs[0].ceasefire, null);
});
