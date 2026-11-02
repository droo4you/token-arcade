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
  Object.assign(s, { phase: 'sky', z: S.C.ROAD_LEN + R.z - 3, x, y, m: 90, gam: 0, vx: 0, launchT: 0, rkTick: s.tick - Math.round(tau * 120) }, extra);
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

test('rocket ignites by proximity (deterministic), and rises beside the car', () => {
  const R = SB.air.rocket, IG = R.ignite;
  const r = fly(21); const ig = r.ev.find(e => e.e === 'ignition'); assert.ok(ig, 'ignited');
  assert.ok(r.s.rkTick > 0 && r.s.rkAcc >= IG.accMin && r.s.rkAcc <= IG.accMax);
  assert.equal(fly(21).s.rkTick, r.s.rkTick, 'same tick every time');
  const pre = S.newRun(3, SB.air); assert.equal(pre.rkTick, undefined); assert.equal(S.rocketAt(pre).tau, 0);
  // a car parked 700 m out does not light it; at 300 m and 100 m/s (3 s out) it does, aimed ~`below` m under the car
  const far = parked(-30, 80, 0, { rkTick: undefined, z: S.C.ROAD_LEN + R.z - 700 }); S.step(far, {}); assert.equal(far.rkTick, undefined);
  const near = parked(-30, 200, 0, { rkTick: undefined, z: S.C.ROAD_LEN + R.z - 300, m: 100 }); S.step(near, {});
  assert.ok(near.rkTick != null); const tt = 300 / 100, want = 2 * (200 - IG.below - R.base) / (tt * tt);
  assert.ok(Math.abs(near.rkAcc - want) / want < 0.05, `acc ${near.rkAcc} vs ${want}`);
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
  let best = null;
  for (let seed = 1; seed <= 40; seed++) { const r = fly(seed); if (r.s.reason === 'landed' && (!best || r.sc.distance > best.sc.distance)) best = r; }
  assert.ok(best, 'bot lands at least one run'); assert.ok(best.sc.pastRim > 0);
  assert.ok(best.sc.tricks < best.sc.distance, 'tricks never outscore distance');
  const straight = s => { const i = S.bot(s); if (s.phase === 'sky' && s.z < S.C.ROAD_LEN + SB.air.rocket.z + 50) i.steer = -s.x * 0.3; return i; };
  const r = fly(1, straight); assert.equal(r.s.reason, 'air'); assert.ok(r.ev.some(e => e.e === 'crash' && e.what === 'rocket'));
});
