import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S0 = require('../src/sim.js');
const L = require('../src/levels.js');
const GC = L.get('grand-canyon');
const S = S0.forLevel(GC);

function fly(Sim, seed, maxT = 240) {
  const s = Sim.newRun(seed); const ev = [];
  while (!s.over && s.tick < maxT * 120) { Sim.step(s, Sim.bot(s)); ev.push(...s.events); s.events.length = 0; }
  return { s, ev, sc: Sim.score(s) };
}

test('grand canyon is registered, valid, and Snake River stays the default', () => {
  assert.equal(GC.id, 'grand-canyon'); assert.deepEqual(L.validate(GC), []);
  assert.equal(L.DEFAULT, 'snake-river'); assert.equal(L.LEVELS[0].id, 'snake-river');
  assert.equal(S.C.CANYON_W, GC.sim.CANYON_W); assert.equal(S.C.CANYON_DEPTH, GC.sim.CANYON_DEPTH);
  assert.equal(S0.C.CANYON_W, 520, 'base sim untouched');
  assert.ok(GC.sim.CANYON_W >= 2200 && GC.sim.CANYON_W <= 2600);
  assert.equal(GC.car.paint, L.get('snake-river').car.paint, 'car stays white');
});
test('base sim and forLevel(snake-river) fly byte-identical runs', () => {
  const S1 = S0.forLevel(L.get('snake-river'));
  for (const seed of [1, 7, 42, 1234]) assert.deepEqual(JSON.stringify(fly(S1, seed).sc), JSON.stringify(fly(S0, seed).sc), 'seed ' + seed);
});
test('grand canyon runs are deterministic per seed', () => {
  for (const seed of [3, 99, 2026]) {
    const a = fly(S, seed), b = fly(S, seed);
    assert.equal(JSON.stringify(a.sc), JSON.stringify(b.sc)); assert.equal(a.s.tick, b.s.tick);
    assert.equal(JSON.stringify(a.s.drafts), JSON.stringify(b.s.drafts));
  }
});
test('spawn bands: condors low, helicopters mid, balloons above, satellites near the ceiling', () => {
  const A = GC.air; let n = { heli: 0, condor: 0, satellite: 0 };
  for (let seed = 1; seed <= 40; seed++) {
    const { s } = fly(S, seed);
    for (const o of s.sky) {
      n[o.type] = (n[o.type] || 0) + 1;
      if (o.type === 'heli') assert.ok(o.y >= 40 - 1e-9 && o.y < 170, `heli y ${o.y}`);
      if (o.type === 'condor' && !o.draft) assert.ok(o.y < 40, `condor y ${o.y}`);
      if (o.type === 'balloon') assert.ok(o.y >= 170 && o.y < 235, `balloon y ${o.y}`);
      if (o.type === 'satellite') assert.ok(o.y >= A.satellite.minY && o.y <= A.ceil, `sat y ${o.y}`);
      for (let t = 0; t < 30; t += 0.5) { const p = S.skyObjPos(o, t); assert.ok(Math.abs(p.x - o.x) <= (o.dx || 4) + 1e-9); }
    }
  }
  assert.ok(n.heli > 20 && n.condor > 5, JSON.stringify(n));
});
test('updraft lift is bounded per column (altitude only, capped at maxGain)', () => {
  const U = GC.air.updraft;
  let rode = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { s } = fly(S, seed);
    for (const d of s.drafts) { assert.ok(d.gain <= (d.max || U.maxGain) + 1e-9, 'gain ' + d.gain); assert.ok(d.w <= Math.max(U.w * 1.15, GC.air.gorge.w) + 1e-9); if (d.gain > 0) rode++; }
  }
  assert.ok(rode > 10, 'bots ride some updrafts: ' + rode);
  // Hover in one column: the gain caps at maxGain.
  const s = S.newRun(5); s.phase = 'sky'; s.z = S.C.ROAD_LEN + 300; s.y = 20; s.m = 80; s.gam = 0;
  s.drafts.push({ x: 0, z: s.z + 5, r: 34, w: 22, top: 190, bottom: -320, gain: 0 }); s.sky = [];
  const y0 = s.y; let i = 0; while (i++ < 360 && !s.over) { s.z = s.drafts[0].z; S.step(s, {}); }
  assert.ok(s.drafts[0].gain <= U.maxGain + 1e-9 && s.drafts[0].gain > U.maxGain * 0.9, 'gain ' + s.drafts[0].gain);
  assert.ok(Number.isFinite(s.y - y0));
});
test('distance stays king on grand canyon Mach runs', () => {
  let mach = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { sc } = fly(S, seed); if (!sc.mach05 || sc.reason !== 'landed') continue; mach++;
    assert.ok(sc.distance > sc.tricks && sc.distance >= Math.max(sc.pickups, sc.landing, sc.mach), JSON.stringify(sc));
  }
  assert.ok(mach > 5, 'mach runs ' + mach);
});
test('gorge route: rings and cans spawn below the rim over the gap, gorge thermals are capped', () => {
  let rings = 0, cans = 0, th = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { s } = fly(S, seed);
    for (const g of s.rings) if (g.gorge) { rings++; assert.ok(g.y < 0 && g.y > -S.C.CANYON_DEPTH * 0.6 && g.z > S.C.ROAD_LEN && g.z < S.C.ROAD_LEN + S.C.CANYON_W + 200); }
    for (const p of s.skyPickups) if (p.gorge) { cans++; assert.ok(p.y < 0); }
    for (const d of s.drafts) if (d.gorge) { th++; assert.ok(d.gain <= GC.air.gorge.maxGain + 1e-9); }
  }
  assert.ok(rings > 20 && cans > 3 && th > 10, JSON.stringify({ rings, cans, th }));
});
test('thin air only exists on grand canyon', () => { assert.ok(GC.air.thin); assert.equal(L.get('snake-river').air.thin, undefined); assert.equal(L.get('snake-river').air.gorge, undefined); });
test('nose-dive recovery: full pull-up gets the nose out of a real dive within 0.8 s from 50-100 m/s, in the gorge and up high, and it stays out', () => {
  for (const [y, V, gam] of [[-60, 50, -0.5], [-60, 70, -0.5], [-60, 100, -0.6], [100, 60, -0.3], [60, 60, -0.3]]) {
    const s = S.newRun(1); s.phase = 'sky'; s.z = S.C.ROAD_LEN + 800; s.y = y; s.m = V; s.gam = gam; s.sky = []; s.drafts = []; s.skyChunk = 999;
    let t = 0; while (s.gam < -0.2 && t < 0.8) { S.step(s, { pitch: 1 }); t += S.C.DT; }
    assert.ok(s.gam >= -0.2, `y${y} V${V}: gam ${s.gam.toFixed(2)} after ${t.toFixed(2)} s`);
    // latched assist releases at -0.1; slow (sub-56 m/s) pull-ups settle into a shallow glide, never back into a nose-dive
    let worst = 0; for (let k = 0; k < 3 * 120 && !s.over; k++) { S.step(s, { pitch: 1 }); worst = Math.min(worst, s.gam); }
    assert.ok(worst > -0.25, `y${y} V${V}: fell back to ${worst.toFixed(2)}`);
  }
});
test('thin air never drains speed below its floor', () => {
  const s = S.newRun(1); s.phase = 'sky'; s.z = S.C.ROAD_LEN + 800; s.y = 200; s.m = 48; s.gam = 0; s.sky = []; s.drafts = []; s.skyChunk = 999;
  const m0 = S0.forLevel({ ...GC, air: { ...GC.air, thin: undefined } }).newRun(1); Object.assign(m0, { phase: 'sky', z: s.z, y: 200, m: 48, gam: 0, sky: [], drafts: [], skyChunk: 999 });
  S.step(s, { pitch: 0.3 }); S0.forLevel({ ...GC, air: { ...GC.air, thin: undefined } }).step(m0, { pitch: 0.3 });
  assert.ok(Math.abs(s.m - m0.m) < 1e-9, 'below vFloor thin air adds nothing');
});
test('lip grace: clipping the far wall 2 m below the lip scrapes onto the rim; 10 m below is still a crash', () => {
  for (const [dy, ok] of [[-2, true], [-10, false]]) {
    const s = S.newRun(1), far = S.C.ROAD_LEN + S.C.CANYON_W; s.phase = 'sky'; s.z = far - 3; s.y = dy; s.m = 70; s.gam = -0.05; s.sky = []; s.drafts = []; s.skyChunk = 999;
    for (let k = 0; k < 30 && !s.over; k++) S.step(s, {});
    assert.equal(!s.over || s.reason === 'landed', ok, `dy ${dy}: ${s.reason}`);
    if (ok) assert.equal(s.counts.lipSaves, 1);
  }
});

test('ceiling float is dead: a stick-back hover from the ceiling cannot reach the far rim', () => {
  // droober's float line: reach the ceiling over the first ~700 m of the gap, then hold full stick-back with no boosts.
  // (Reaching the ceiling >1 km into the gap is a committed glide, not a float; that still clears.)
  const far = S.C.ROAD_LEN + S.C.CANYON_W;
  for (const dz of [300, 500, 700]) for (const V of [55, 60, 70, 80]) { const z0 = S.C.ROAD_LEN + dz;
    const s = S.newRun(1); Object.assign(s, { phase: 'sky', z: z0, y: GC.air.ceil, m: V, gam: 0, sky: [], drafts: [], skyChunk: 1e9 });
    let k = 0; while (!s.over && k++ < 120 * 200) S.step(s, { pitch: 1 });
    assert.ok(s.z < far, `hover from z${z0} V${V} reached z ${s.z.toFixed(0)} (${s.reason})`);
  }
  // and it can't hold altitude: 10 s of stick-back at the ceiling loses real height
  const s = S.newRun(1); Object.assign(s, { phase: 'sky', z: S.C.ROAD_LEN + 300, y: GC.air.ceil, m: 60, gam: 0, sky: [], drafts: [], skyChunk: 1e9 });
  for (let k = 0; k < 1200; k++) S.step(s, { pitch: 1 });
  assert.ok(s.y < GC.air.ceil - 40, 'still floating at ' + s.y.toFixed(0));
});
test('no nose sawtooth: a long stick-back glide settles smoothly (assist blends, no on/off limit cycle)', () => {
  for (const V of [40, 45, 55]) {
    const s = S.newRun(1); Object.assign(s, { phase: 'sky', z: S.C.ROAD_LEN + 300, y: GC.air.ceil, m: V, gam: 0, sky: [], drafts: [], skyChunk: 1e9 });
    let flips = 0, prev = 0, maxRate = 0;
    for (let k = 0; k < 120 * 20 && !s.over; k++) { const g0 = s.gam; S.step(s, { pitch: 1 }); if (k < 240) continue; const r = (s.gam - g0) * 120; if (Math.sign(r) !== Math.sign(prev) && Math.abs(r - prev) > 0.05) flips++; prev = r; maxRate = Math.max(maxRate, Math.abs(r)); }
    assert.ok(flips <= 2 && maxRate < 0.3, `V${V}: ${flips} pitch reversals, max ${(maxRate * 57.3).toFixed(0)}°/s`);
  }
});
