import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const S0 = require('../src/sim.js');
const L = require('../src/levels.js');
const SB = L.get('starbase');
const S = S0.forLevel(SB);

function fly(seed, pilot = S.bot, maxT = 240) {
  const s = S.newRun(seed, SB.air), ev = [];
  while (!s.over && s.tick < maxT * 120) { S.step(s, pilot(s)); ev.push(...s.events); s.events.length = 0; }
  return { s, ev, sc: S.score(s) };
}
/* A sky state parked just short of the rocket, launch clock set so the stack is tau seconds into its climb. */
function parked(x, y, tau, extra = {}) {
  const s = S.newRun(3, SB.air); const R = SB.air.rocket;
  Object.assign(s, { phase: 'sky', z: S.C.ROAD_LEN + R.z - 3, x, y, m: 90, gam: 0, vx: 0, launchT: 0, rkTick: s.tick - Math.round(tau * 120), rkY: R.base + 0.5 * R.acc * tau * tau, rkVy: R.acc * tau, rkChunks: true }, extra);
  return s;
}

test('starbase is registered, valid, level 3, and reachable by id', () => {
  assert.equal(L.LEVELS[2].id, 'starbase'); assert.deepEqual(L.validate(SB), []);
  assert.equal(L.get('starbase'), SB); assert.equal(L.DEFAULT, 'snake-river');
  assert.ok(SB.sim.CANYON_W > L.get('grand-canyon').sim.CANYON_W, 'bigger gap than Grand Canyon');
});

test('Snake River and Grand Canyon sims are tick-for-tick identical to the pre-Starbase sim (golden fingerprints)', () => {
  const want = { 'snake-river': '2df7d4271cc7f4fd209c887f2699bd5d', 'grand-canyon': '95c33becb3945c3370b41e2ee223fa57' };
  for (const id of Object.keys(want)) {
    const Sim = id === 'snake-river' ? S0 : S0.forLevel(L.get(id)), h = crypto.createHash('md5');
    for (let seed = 1; seed <= 30; seed++) {
      const s = Sim.newRun(seed, L.get(id).air);
      while (!s.over && s.tick < 120 * 240) { Sim.step(s, Sim.bot(s)); h.update(s.tick + ':' + s.x + ',' + s.y + ',' + s.z + ',' + s.m + ';'); s.events.length = 0; }
      h.update(JSON.stringify(Sim.score(s)));
    }
    assert.equal(h.digest('hex'), want[id], id);
  }
});

test('starbase runs are deterministic (same seed + inputs = same run)', () => {
  const a = fly(21), b = fly(21);
  assert.deepEqual(a.sc, b.sc); assert.equal(a.s.tick, b.s.tick); assert.equal(a.s.rkTick, b.s.rkTick);
});

test('guided launch: lights on the final straight, and meets normal AND steep lines', () => {
  const G = SB.air.rocket.guide, R = SB.air.rocket;
  const r = fly(21), ig = r.ev.find(e => e.e === 'ignition'); assert.ok(ig);
  const s = S.newRun(21, SB.air); while (s.rkTick == null) S.step(s, S.bot(s));
  assert.equal(s.phase, 'road', 'ignites before the ramp'); assert.ok(s.z >= S.C.ROAD_LEN - G.igniteBefore - 2 && s.z < S.C.ROAD_LEN - G.igniteBefore + 3);
  assert.equal(fly(21).s.rkTick, r.s.rkTick, 'deterministic');
  // steep line: climb hard after the ramp; the stack is still level with the car when it arrives
  for (const [name, pitch] of [['normal', 0], ['steep', 1]]) {
    const q = S.newRun(5, SB.air); let at = null;
    while (!q.over && q.tick < 120 * 60) { const i = S.bot(q); if (q.phase === 'sky' && q.t - q.launchT < 4) { i.pitch = pitch; } S.step(q, i); q.events.length = 0;
      const k = S.rocketAt(q); if (!at && q.phase === 'sky' && q.z >= k.z - 1) at = { y: q.y, yB: k.yB, yT: k.yT }; }
    assert.ok(at, name + ' reached the stack');
    assert.ok(at.y > at.yB - 60 && at.y < at.yT + 30, `${name}: car ${at.y.toFixed(0)} vs stack ${at.yB.toFixed(0)}..${at.yT.toFixed(0)}`);
  }
});

test('Booster Chunks: dropped beside the stack on approach; grabbing one gives seconds of thrust', () => {
  const R = SB.air.rocket, B = R.chunks;
  const s = parked(-30, 120, 2, { z: S.C.ROAD_LEN + R.z - B.spawnAt + 1, rkChunks: false }); S.step(s, {});
  const ch = s.skyPickups.filter(p => p.type === 'booster'); assert.equal(ch.length, B.n);
  for (const c of ch) assert.ok(Math.abs(c.x - R.x) > R.r + 4 && Math.abs(c.x - R.x) < R.r + 8, 'just outside the body');
  const g = parked(ch[0].x, ch[0].y, 2, { z: ch[0].z - 1, skyPickups: [Object.assign({}, ch[0])], m: 80, rkChunks: true });
  const m0 = g.m; let got = false; for (let i = 0; i < 12; i++) { S.step(g, {}); if (g.events.some(e => e.e === 'booster')) got = true; g.events.length = 0; }
  assert.ok(got && g.boosterT > 0); const h = parked(ch[0].x, ch[0].y, 2, { z: ch[0].z - 1, skyPickups: [], m: 80, rkChunks: true });
  for (let i = 0; i < 240; i++) { S.step(g, {}); S.step(h, {}); }
  assert.ok(g.m > h.m + 25, `thrust ${g.m.toFixed(1)} vs ${h.m.toFixed(1)}`);
});

test('back half of the gap carries extra rings and AIR cans', () => {
  const from = S.C.ROAD_LEN + S.C.CANYON_W * SB.air.back.from; let rings = 0, cans = 0;
  for (let seed = 1; seed <= 10; seed++) { const s = fly(seed).s; rings += s.rings.filter(r => r.back && r.z >= from).length; cans += s.skyPickups.filter(p => p.back && p.type === 'air').length; }
  assert.ok(rings >= 40 && cans >= 8, `rings ${rings} cans ${cans}`);
});

test('stall nose-over (Starbase only): below stallFree the nose drops and the car falls', () => {
  const st = parked(-30, 400, 0, { z: S.C.ROAD_LEN + 100, m: 5, gam: 1.0, rkTick: 1e9 });
  const y0 = st.y; for (let i = 0; i < 240; i++) S.step(st, { pitch: 1 });
  assert.ok(st.gam < 0, `nose over (gam ${st.gam})`); assert.ok(st.y < y0 - 5, 'falls');
  const off = parked(-30, 400, 0, { z: S.C.ROAD_LEN + 100, m: 5, gam: 1.0, rkTick: 1e9 }); off.cfg = Object.assign({}, SB.air, { recover: Object.assign({}, SB.air.recover, { stallFree: 0 }) });
  for (let i = 0; i < 240; i++) S.step(off, { pitch: 1 });
  assert.ok(off.gam > st.gam, 'without it the nose-drop cap holds the nose up (the old hover)');
  assert.equal(L.get('grand-canyon').air.recover.stallFree, undefined);
});

test('flying into the rocket body or the tower ends the run', () => {
  const R = SB.air.rocket;
  const s = parked(0, 60, 3); for (let i = 0; i < 30 && !s.over; i++) S.step(s, {});
  assert.equal(s.reason, 'air'); assert.ok(s.events.some(e => e.e === 'crash' && e.what === 'rocket'));
  const t = parked(R.tower.x, 30, 3); for (let i = 0; i < 30 && !t.over; i++) S.step(t, {});
  assert.ok(t.events.some(e => e.e === 'crash' && e.what === 'tower'));
  const ok = parked(-30, 60, 3); for (let i = 0; i < 30 && !ok.over; i++) S.step(ok, {});
  assert.equal(ok.over, false, 'wide of the stack is clear');
});

test('plume pushes the car outward and down; its edge lifts a skimmer', () => {
  const R = SB.air.rocket, tau = 6, yB = R.base + 0.5 * R.acc * tau * tau, y = yB - 40, rp = S.plumeR(R, 40);
  const inP = parked(-rp * 0.4, y, tau), ref = parked(-rp * 0.4, y, tau); ref.cfg = Object.assign({}, SB.air, { rocket: null });
  for (let i = 0; i < 24; i++) { S.step(inP, {}); S.step(ref, {}); }
  assert.ok(inP.events.some(e => e.e === 'plume'));
  assert.ok(inP.x < ref.x - 0.5, 'shoved outward (left)'); assert.ok(inP.y < ref.y - 1, 'pushed down'); assert.ok(inP.m < ref.m, 'bleeds airspeed');
  const sk = parked(-(rp + R.plume.edge * 0.3), y, tau), ref2 = parked(-(rp + R.plume.edge * 0.3), y, tau); ref2.cfg = ref.cfg;
  S.step(sk, {}); S.step(ref2, {});
  assert.ok(sk.y > ref2.y, 'edge lift'); assert.ok(sk.events.some(e => e.e === 'skim'));
});

test('a careful pilot clears it; flying straight at the stack does not; distance stays king', () => {
  let best = null, clear = 0;
  for (let seed = 1; seed <= 60; seed++) { const r = fly(seed); if (r.s.reason === 'landed') { clear++; assert.ok(r.sc.tricks < r.sc.distance, 'seed ' + seed); } if (r.s.reason === 'landed' && (!best || r.sc.distance > best.sc.distance)) best = r; }
  assert.ok(clear >= 30 && clear <= 42, `bot clear rate ${clear}/60 (target ~55-65%)`);
  assert.ok(best, 'bot lands at least one run'); assert.ok(best.sc.pastRim > 0);
  assert.ok(best.sc.tricks < best.sc.distance, 'tricks never outscore distance');
  const straight = s => { const i = S.bot(s); if (s.phase === 'sky' && s.z < S.C.ROAD_LEN + SB.air.rocket.z + 50) i.steer = -s.x * 0.3; return i; };
  const r = fly(1, straight); assert.equal(r.s.reason, 'air'); assert.ok(r.ev.some(e => e.e === 'crash' && e.what === 'rocket'));
});
