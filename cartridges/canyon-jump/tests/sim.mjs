import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../src/sim.js');
const { C } = S;

function play(seed, policy, maxSeconds = 240) {
  const s = S.newRun(seed);
  for (let i = 0; i < maxSeconds * 120 && !s.over; i++) S.step(s, policy(s) || {});
  return s;
}
// Dodges obstacles and chases speed pads; the same policy the ?autopilot preview uses.
function driver(s) {
  const i = {};
  if (s.phase === 'road') {
    const ahead = s.obstacles.filter(o => o.z > s.z - 2 && o.z < s.z + s.v * 0.75), bad = l => ahead.some(o => o.lane === l);
    const pad = s.pickups.find(p => !p.taken && p.type === 'pad' && p.z > s.z && p.z < s.z + 80);
    let want = s.lane;
    if (bad(s.lane)) want = [-1, 0, 1].filter(l => !bad(l)).sort((a, b) => Math.abs(a - s.lane) - Math.abs(b - s.lane))[0] ?? s.lane;
    else if (pad && !bad(pad.lane)) want = pad.lane;
    if (s.tick % 6 === 0) { if (want < s.lane) i.leftEdge = true; if (want > s.lane) i.rightEdge = true; }
  }
  return i;
}
// Strip the road so tests can isolate the launch rule.
function emptyRoad(seed) { const s = S.newRun(seed); s.obstacles = []; s.pickups = []; return s; }

test('runs are deterministic for a seed and input stream', () => {
  const a = play(11, driver), b = play(11, driver);
  assert.deepEqual(S.score(a), S.score(b));
  assert.equal(a.tick, b.tick);
  assert.notDeepEqual(S.newRun(11).obstacles.map(o => o.lane), S.newRun(12).obstacles.map(o => o.lane));
});

test('every obstacle row leaves an open lane and the ramp run-up is clear', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const rows = new Map();
    for (const o of S.newRun(seed).obstacles) rows.set(o.z, (rows.get(o.z) || 0) + 1);
    for (const [z, n] of rows) { assert.ok(n <= 2, `seed ${seed} row ${z} blocks all lanes`); assert.ok(z < C.ROAD_LEN - 60, 'no obstacle on the ramp'); }
  }
});

test('natural top speed is under the clear line, so pads are required', () => {
  assert.ok(C.V_NATURAL < C.CLEAR_V);
  const s = emptyRoad(3);
  while (!s.over && s.phase === 'road') S.step(s, {});
  assert.equal(s.phase, 'fall');
  while (!s.over) S.step(s, {});
  assert.equal(s.reason, 'short');
  assert.equal(S.score(s).landing, 0);
});

// No traffic, rings or sky pickups: isolates the flight model.
function quiet(s) { s.sky.push = () => 0; s.rings.push = () => 0; s.skyPickups.push = () => 0; return s; }
function launchAt(v, seed = 4) { const s = emptyRoad(seed); while (s.phase === 'road') { s.padBoost = v - s.vBase; S.step(s, {}); } return quiet(s); }
const energy = s => s.m * s.m / 2 + C.G_SKY * s.y;

test('a launch at or above the clear line clears the gorge hands-off and lands past the rim for a bonus', () => {
  for (const v of [C.CLEAR_V, 100, C.V_MAX]) {
    const s = launchAt(v); assert.equal(s.phase, 'sky'); assert.ok(Math.abs(s.launchV - v) < 0.1, `launch ${s.launchV}`);
    while (!s.over) S.step(s, {});
    const r = S.score(s);
    assert.equal(r.reason, 'landed', `launch ${v}: ${r.reason}`); assert.ok(r.landing >= C.LANDING_BONUS); assert.ok(r.pastRim > 0);
    assert.equal(r.total, r.distance + r.pickups + r.tricks + r.landing + r.mach);
  }
});

test('weight: heavy gravity, a real ballistic arc off the lip, and a hard fall once lift is gone', () => {
  assert.ok(C.G_SKY >= 2 * C.G, 'sky gravity is heavier than real g');
  const s = launchAt(C.CLEAR_V); assert.ok(s.vy > 15, 'leaves the lip climbing');
  let peakT = null, prevY = s.y;
  for (let i = 0; i < 120 * 4 && !s.over; i++) { S.step(s, {}); if (peakT === null && s.y < prevY) peakT = s.t - s.launchT; prevY = s.y; }
  assert.ok(peakT !== null && peakT < 2.2, `arc peaks quickly (${peakT})`);
  // Stalled: no lift below V_MIN_LIFT, so it drops at sky gravity.
  assert.equal(S.liftAccel(C.V_MIN_LIFT - 1, 1), 0);
  const f = launchAt(100); f.z = C.ROAD_LEN + C.CANYON_W + 100; f.y = 150; f.m = 20; f.gam = 0;
  for (let i = 0; i < 120; i++) S.step(f, {});
  assert.ok(f.vy < -0.75 * C.G_SKY, `falls hard when stalled (vy ${f.vy.toFixed(1)})`);
});

test('energy management: climbing trades speed for height, diving trades height for speed, and energy only drains', () => {
  const run = inp => { const s = launchAt(105); s.y = 80; s.gam = 0; for (let i = 0; i < 180; i++) S.step(s, inp); return s; };
  const n = run({}), up = run({ up: true }), dn = run({ down: true });
  assert.ok(up.y > n.y + 10 && up.m < n.m - 5, `climb: y ${up.y.toFixed(0)} vs ${n.y.toFixed(0)}, v ${up.m.toFixed(0)} vs ${n.m.toFixed(0)}`);
  assert.ok(dn.y < n.y - 10 && dn.m > n.m + 5, `dive: y ${dn.y.toFixed(0)} vs ${n.y.toFixed(0)}, v ${dn.m.toFixed(0)} vs ${n.m.toFixed(0)}`);
  // analog pitch sits between
  const half = run({ pitch: 0.5 }); assert.ok(half.y > n.y && half.y < up.y);
  // Without boosts or rings total energy never rises.
  const s = launchAt(110); let e = energy(s);
  for (let i = 0; i < 120 * 8 && !s.over; i++) { S.step(s, { pitch: Math.sin(i / 60) }); const e2 = energy(s); assert.ok(e2 <= e + 1e-6, 'energy rose'); e = e2; }
});

test('the gorge: you can dive below the rim, but the river and the far wall end the run', () => {
  const a = launchAt(110); a.z = C.ROAD_LEN + 120; a.y = -40; a.gam = -0.3; // deep in the canyon, heading down
  while (!a.over) S.step(a, { down: true });
  assert.equal(a.reason, 'short'); assert.ok(a.z < C.ROAD_LEN + C.CANYON_W);
  const b = launchAt(110); b.z = C.ROAD_LEN + C.CANYON_W - 30; b.y = -20; b.gam = 0;
  while (!b.over) S.step(b, {});
  assert.equal(b.reason, 'short'); assert.ok(b.z <= C.ROAD_LEN + C.CANYON_W - S.wallInset(20) + 2, 'stopped by the far wall where its profile juts out');
  // The wall profile narrows the gorge with depth and is shared with the 3D walls.
  for (let d = 0; d < C.CANYON_DEPTH; d += 5) assert.ok(S.wallInset(d + 5) >= S.wallInset(d));
  assert.ok(S.inWall(C.ROAD_LEN + 10, -60) && !S.inWall(C.ROAD_LEN + C.CANYON_W / 2, -100) && !S.inWall(C.ROAD_LEN + 10, 5));
  const c = launchAt(110); c.z = C.ROAD_LEN + 200; c.y = -30; c.gam = 0.35; // pull out of the canyon in time
  for (let i = 0; i < 120 * 2 && !c.over; i++) S.step(c, { up: true });
  assert.ok(!c.over || c.reason === 'landed', 'climbing out of the canyon is survivable');
});

test('AIR boosts add speed; tricks build an unbanked combo that pays only on a clean landing', () => {
  const s = launchAt(105); s.air = 2; s.y = 90; s.gam = 0;
  const before = s.m; S.step(s, { boostEdge: true });
  assert.ok(s.m > before + C.BOOST_M - 1); assert.equal(s.air, 1);
  S.step(s, { trickEdge: true }); assert.equal(s.trickKind, 'flip');
  for (let i = 0; i < C.FLIP_T * 120 + C.TRICK_CD * 120 + 4; i++) { S.step(s, {}); s.y = Math.max(s.y, 60); }
  assert.equal(s.counts.tricks, 1); assert.equal(s.cmb.pot, C.FLIP_PTS); assert.equal(s.cmb.mult, 1);
  S.step(s, { rollEdge: true, rollDir: -1 }); assert.equal(s.trickKind, 'roll'); assert.equal(s.trickDir, -1);
  for (let i = 0; i < C.ROLL_T * 120 + 4; i++) { S.step(s, {}); s.y = Math.max(s.y, 60); }
  assert.equal(s.counts.rolls, 1); assert.equal(s.cmb.pot, C.FLIP_PTS + C.ROLL_PTS * C.VARIETY, 'switching tricks pays the variety bonus');
  assert.equal(s.cmb.mult, 1 + C.MULT_STEP); assert.equal(s.pts.tricks, 0, 'nothing banked mid-air');
  // Clean landing: shallow, upright, on the road.
  s.z = C.ROAD_LEN + C.CANYON_W + 60; s.y = 0.4; s.gam = -0.05; s.x = 0; s.m = 60;
  while (!s.over) S.step(s, {});
  assert.equal(s.reason, 'landed'); assert.equal(s.pts.tricks, Math.round((C.FLIP_PTS + C.ROLL_PTS * C.VARIETY) * (1 + C.MULT_STEP)));
  assert.equal(s.pts.landing, C.LANDING_BONUS + C.ROAD_BONUS); assert.ok(s.onRoad);
});

test('landing mid-trick or in a steep dive crashes and loses the combo', () => {
  const mk = () => { const t = launchAt(105); t.cmb = { pot: 300, mult: 3, n: 4, last: 'roll' }; t.z = C.ROAD_LEN + C.CANYON_W + 50; return t; };
  const t = mk(); t.y = 12; t.gam = -0.3; t.m = 40;
  S.step(t, { trickEdge: true }); assert.ok(t.trick > 0);
  while (!t.over) S.step(t, {});
  assert.equal(t.reason, 'botched'); assert.equal(S.score(t).landing, 0); assert.equal(S.score(t).tricks, 0);
  const d = mk(); d.y = 3; d.gam = -0.8; d.m = 120;
  while (!d.over) S.step(d, { down: true });
  assert.equal(d.reason, 'botched'); assert.ok(d.landGam < -C.LAND_MAX_DIVE); assert.equal(S.score(d).tricks, 0);
});

test('tricks cost height: a roll tilts the lift vector', () => {
  const run = trick => { const s = launchAt(105); s.y = 100; s.gam = 0; s.m = 100; if (trick) S.step(s, { trickEdge: true }); for (let i = 0; i < 90; i++) S.step(s, {}); return s.y; };
  assert.ok(run(true) < run(false) - 1.5, 'flipping drops you');
});

test('rings give speed and combo; risky rewards hug hazards but never overlap a hitbox anywhere they sway', () => {
  const s = launchAt(105); s.rings = [{ x: 0, y: s.y + 1, z: s.z + 5, taken: false }]; s.gam = 0.05;
  const v0 = s.m; for (let i = 0; i < 12; i++) S.step(s, {});
  assert.equal(s.counts.rings, 1); assert.ok(s.m > v0 + C.RING_V - 2); assert.equal(s.cmb.pot, C.RING_POT);
  let risky = 0, gates = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const r = launchAt(110, seed); r.sky.push = Array.prototype.push; r.rings.push = Array.prototype.push; r.skyPickups.push = Array.prototype.push;
    for (let i = 0; i < 120 * 10 && !r.over; i++) { S.step(r, S.bot(r)); }
    const rewards = r.rings.map(g => ({ ...g, rad: C.RING_R })).concat(r.skyPickups.map(p => ({ ...p, rad: 2.6 })));
    for (const w of rewards) {
      if (w.risky) risky++; if (w.gate != null) gates++;
      for (const o of r.sky) { if (Math.abs(o.z - w.z) > 6) continue;
        // Flying through the middle of a ring or can never hits the host hazard.
        for (let t = 0; t < 60; t += 0.25) { const p = S.skyObjPos(o, t); assert.ok(Math.hypot(p.x - w.x, p.y - w.y) >= o.r + 1.1, `seed ${seed}: centre line hits a ${o.type}`); }
      }
    }
  }
  assert.ok(risky > 40 && gates > 20, `risky ${risky}, gate rings ${gates}`);
});

test('hitting an obstacle ends the run on the highway', () => {
  const s = S.newRun(8); s.pickups = [];
  s.obstacles = [{ type: 'rock', lane: 0, z: 60, phase: 0, hit: false }];
  while (!s.over) S.step(s, {});
  assert.equal(s.reason, 'road'); assert.ok(s.z < 70);
});

test('the driver policy clears the canyon on most seeds (difficulty sanity)', () => {
  let cleared = 0;
  for (let seed = 1; seed <= 20; seed++) if (play(seed, driver).launchV >= C.CLEAR_V) cleared++;
  assert.ok(cleared >= 10, `cleared ${cleared}/20`);
});

// Mirrors a player: after passing a row, waits REACT_T, then commits to one lane. Uses the real step() so
// tumbleweed sway, hitboxes, lane-switch easing and speed all count. Explores every lane choice per row.
function passable(seed, padBoost) {
  const base = S.newRun(seed); base.pickups = [];
  const rows = [...new Set(base.obstacles.map(o => o.z))].sort((a, b) => a - b);
  let states = [base], prevZ = 0;
  for (const rz of rows) {
    const next = new Map();
    for (const st of states) for (const target of [-1, 0, 1]) {
      const s = structuredClone(st); let t0 = null;
      while (!s.over && s.z < rz + 2.5) {
        if (s.z > prevZ + 2.5 && t0 === null) t0 = s.t;
        const inp = {};
        if (t0 !== null && s.t - t0 >= C.REACT_T) { if (target < s.lane) inp.leftEdge = true; else if (target > s.lane) inp.rightEdge = true; }
        if (padBoost) s.padBoost = padBoost;
        S.step(s, inp);
      }
      if (!s.over && !next.has(s.lane)) next.set(s.lane, s);
    }
    if (!next.size) return rz;
    states = [...next.values()]; prevZ = rz;
  }
  return null;
}

test('a reachable open lane exists at every moment, at natural and pad-boosted speed', () => {
  for (let seed = 1; seed <= 60; seed++) for (const boost of [0, 20]) {
    const stuck = passable(seed, boost);
    assert.equal(stuck, null, `seed ${seed} boost ${boost}: no passable path at row z=${stuck}`);
  }
});

test('tumbleweeds sway inside their own lane and hitboxes cover the drawn sprites', () => {
  const TUMBLE_DRAWN_R = 0.75; // render.js tumbleweed radius in meters
  assert.ok(C.SWAY + TUMBLE_DRAWN_R <= C.LANE_W / 2, 'tumbleweed stays in its lane');
  assert.ok(C.OBST_HW.tumbleweed >= TUMBLE_DRAWN_R);
  for (const seed of [1, 2, 3]) for (const o of S.newRun(seed).obstacles) for (let t = 0; t < 10; t += 0.05)
    assert.ok(Math.abs(S.obstacleX(o, t) - S.laneX(o.lane)) <= C.SWAY + 1e-9);
  // A car centred in the next lane is never touched by a neighbour, even a rock.
  const worst = Math.max(...Object.values(C.OBST_HW)) + C.SWAY + C.CAR_HW;
  assert.ok(worst < C.LANE_W);
});

test('rows are spaced by time: at worst-case speed each gap allows reaction plus a lane switch', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const zs = [...new Set(S.newRun(seed).obstacles.map(o => o.z))].sort((a, b) => a - b);
    for (let i = 1; i < zs.length; i++) assert.ok((zs[i] - zs[i - 1]) / S.vEstAt(zs[i]) >= C.REACT_T + C.SWITCH_T - 1e-9, `seed ${seed} row ${i}`);
  }
});

function launch(seed) { const s = emptyRoad(seed); s.padBoost = 40; while (s.phase === 'road') S.step(s, {}); return s; }

test('tricks have a cooldown, cannot be spammed, and need height above the ground', () => {
  const s = launchAt(110, 21); s.y = 60; s.gam = 0; s.m = 100;
  let starts = 0;
  for (let i = 0; i < 120 * 4; i++) { S.step(s, { trickEdge: true }); s.y = 60; s.m = 100; s.gam = 0; for (const e of s.events) if (e.e === 'trick') starts++; s.events.length = 0; }
  assert.ok(starts <= Math.ceil(4 / (C.FLIP_T + C.TRICK_CD)), `started ${starts} flips in 4 s`);
  const t = launchAt(110, 22); t.z = C.ROAD_LEN + C.CANYON_W + 20; t.y = 5; S.step(t, { trickEdge: true }); assert.equal(t.trick, 0, 'no flips near the ground');
  const u = launchAt(110, 23); u.y = 5; S.step(u, { trickEdge: true }); assert.ok(u.trick > 0, 'over the gorge the river is the ground, so low over the rim is still high');
});

test('steering is responsive and stops drifting when released', () => {
  const s = launchAt(110, 23);
  for (let i = 0; i < 30; i++) S.step(s, { right: true }); // 0.25 s
  assert.ok(s.vx > C.STEER_V * 0.85, `vx ${s.vx}`);
  for (let i = 0; i < 30; i++) S.step(s, {});
  assert.ok(Math.abs(s.vx) < 2, `drift ${s.vx}`);
});

test('sky traffic lives in altitude bands and is never stacked into a wall', () => {
  const s = launch(24);
  for (let i = 0; i < 120 * 6; i++) { S.step(s, { up: true }); if (s.over) break; s.m = 100; }
  assert.ok(s.y > C.BAND_SAT, 'climbing reaches the satellite band');
  const types = new Set(s.sky.map(o => o.type)); assert.ok(types.has('plane') && types.has('satellite'), [...types].join());
  for (const o of s.sky) assert.equal(o.type, o.y < C.BAND_PLANE ? 'bird' : o.y < C.BAND_SAT ? 'plane' : 'satellite');
  for (const a of s.sky) for (const b of s.sky) if (a !== b && Math.abs(a.z - b.z) < 25) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r + 9, `stacked ${a.type}/${b.type}`);
});

test('balance: the reference pilot mostly lands, flights last ~15-35 s, and distance still matters next to combos', () => {
  const flights = []; let landed = 0, launched = 0, dist = 0, tricks = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const s = S.newRun(seed); let t0 = 0;
    while (!s.over && s.tick < 300 * 120) { S.step(s, S.bot(s)); s.events.length = 0; if (s.phase === 'sky' && !t0) t0 = s.t; }
    if (!t0) continue;
    launched++; flights.push(s.t - t0); if (s.reason === 'landed') landed++;
    const r = S.score(s); dist += r.distance; tricks += r.tricks;
  }
  const avg = flights.reduce((a, b) => a + b, 0) / flights.length;
  assert.ok(launched >= 20 && avg >= 15 && avg <= 35, `avg flight ${avg.toFixed(1)} s over ${launched}`);
  assert.ok(landed >= launched * 0.7, `landed ${landed}/${launched}`);
  assert.ok(dist > tricks, `distance ${dist} vs combo payouts ${tricks}`);
});

test('Mach 0.5 (617 km/h) is out of reach on the road and earned in the sky with a 4-boost chain off a top-speed launch, once per run', () => {
  assert.ok(Math.abs(C.MACH05 * 3.6 - 617) < 1e-9);
  assert.ok(C.V_MAX < C.MACH05, 'road top speed stays under Mach 0.5');
  assert.ok(C.M_MAX > C.MACH05, 'sky momentum can exceed it');
  const chain = (n) => { // launch at the road's top speed (pads kept stacked), then chain n boosts as fast as allowed
    const s = emptyRoad(30); while (s.phase === 'road') { s.padBoost = 60; S.step(s, {}); }
    assert.equal(Math.round(s.launchV), C.V_MAX); quiet(s); s.air = n; let used = 0, events = 0;
    for (let i = 0; i < 120 * 6 && !s.over; i++) { const b = s.boostCd <= 0 && used < n; if (b) used++; S.step(s, { boostEdge: b }); for (const e of s.events) if (e.e === 'mach') events++; s.events.length = 0; }
    return { s, events };
  };
  const three = chain(3); assert.equal(three.s.counts.mach, 0, 'three boosts are not enough');
  const four = chain(4); assert.equal(four.s.counts.mach, 1); assert.equal(four.events, 1, 'fires once');
  assert.equal(four.s.pts.mach, C.MACH_BONUS);
  const r = S.score(four.s); assert.equal(r.mach05, 1); assert.ok(r.topKmh >= 617);
  assert.equal(r.total, r.distance + r.pickups + r.tricks + r.landing + r.mach);
  // Determinism holds with the new state.
  assert.deepEqual(S.score(chain(4).s), S.score(chain(4).s));
});

/* ---------- STABILIZE (cold-gas thrusters) and landing forgiveness ---------- */
function highFlight(seed = 40) { const s = launchAt(105, seed); s.y = 80; s.gam = 0; s.m = 95; s.air = 3; return s; }
const stepN = (s, n, input = {}) => { for (let i = 0; i < n && !s.over; i++) S.step(s, input); };

test('stabilize cancels an in-progress trick smoothly and levels a steep dive in ~0.4 s', () => {
  const s = highFlight(); S.step(s, { trickEdge: true }); stepN(s, Math.round(0.2 * 120)); // flip ~30% round
  assert.ok(s.trick > 0 && S.trickProgress(s) < C.STAB_CREDIT);
  s.gam = -0.9; const rot0 = s.rot, pot0 = s.cmb.pot;
  S.step(s, { stabEdge: true });
  assert.equal(s.trick, 0, 'trick stopped'); assert.ok(s.stabT > 0);
  const ev = s.events.find(e => e.e === 'stab'); assert.equal(ev.outcome, 'cancelled'); assert.equal(ev.free, false);
  // the spin unwinds monotonically back to upright (no snap)
  let prev = Math.abs(s.rot);
  for (let i = 0; i < C.STAB_T * 120; i++) { S.step(s, {}); assert.ok(Math.abs(s.rot) <= prev + 1e-9); prev = Math.abs(s.rot); }
  assert.ok(Math.abs(rot0) > 0.5); assert.equal(s.rot, 0, 'upright when the burn ends');
  assert.ok(Math.abs(s.gam - C.STAB_GAM) < 0.06, `nose levelled to ${(s.gam * 57.3).toFixed(1)}°`);
  assert.ok(s.gam > -5 / 57.3 - 0.02 && s.gam < 0.02, 'about 0 to -5°');
  assert.equal(s.cmb.pot, pot0, 'combo pot kept'); assert.equal(s.counts.tricks, 0, 'a cancelled trick scores nothing');
});

test('a trick cancelled at least half done counts as landed for the combo', () => {
  const s = highFlight(41); S.step(s, { trickEdge: true }); stepN(s, Math.round(C.FLIP_T * 0.6 * 120));
  assert.ok(S.trickProgress(s) >= C.STAB_CREDIT);
  S.step(s, { stabEdge: true });
  assert.equal(s.counts.tricks, 1); assert.equal(s.cmb.pot, C.FLIP_PTS);
  assert.ok(s.events.some(e => e.e === 'landed_trick' && e.via === 'stab'));
  assert.equal(s.events.find(e => e.e === 'stab').outcome, 'credited');
  stepN(s, C.STAB_T * 120 + 2); assert.equal(s.rot, 0); assert.ok(!s.over);
});

test('stabilize costs one AIR can, has a short cooldown, and still works slower with no cans', () => {
  const s = highFlight(42); s.air = 2;
  S.step(s, { stabEdge: true }); assert.equal(s.air, 1); assert.equal(s.stabDur, C.STAB_T); assert.equal(s.counts.stabs, 1);
  // spam is ignored until the cooldown runs out
  for (let i = 0; i < Math.round(C.STAB_CD * 120) - 2; i++) S.step(s, { stabEdge: true });
  assert.equal(s.counts.stabs, 1); assert.equal(s.air, 1);
  stepN(s, 3); S.step(s, { stabEdge: true }); assert.equal(s.counts.stabs, 2); assert.equal(s.air, 0);
  // zero cans: the lifeline fires anyway, slower, with a long cooldown
  stepN(s, Math.round(C.STAB_CD * 120) + 2); s.gam = -0.8;
  S.step(s, { stabEdge: true }); assert.equal(s.counts.stabs, 3); assert.equal(s.air, 0);
  assert.equal(s.stabDur, C.STAB_T_FREE); assert.ok(s.events.some(e => e.e === 'stab' && e.free));
  stepN(s, Math.round(C.STAB_T * 120)); assert.ok(s.gam < C.STAB_GAM - 0.1, 'the free burn is slower than a paid one');
  stepN(s, Math.round((C.STAB_T_FREE - C.STAB_T) * 120)); assert.ok(Math.abs(s.gam - C.STAB_GAM) < 0.08, 'but still levels the nose');
  for (let i = 0; i < Math.round(C.STAB_CD_FREE * 120) - Math.round(C.STAB_T_FREE * 120) - 3; i++) S.step(s, { stabEdge: true });
  assert.equal(s.counts.stabs, 3, 'free stabilize has a 3 s cooldown');
  stepN(s, 6); S.step(s, { stabEdge: true }); assert.equal(s.counts.stabs, 4);
});

test('stabilize trims the sink rate and blocks new tricks while firing; deterministic', () => {
  const a = highFlight(43), b = highFlight(43); a.gam = b.gam = -0.4;
  S.step(a, { stabEdge: true }); S.step(b, {});
  stepN(a, 20); stepN(b, 20);
  assert.ok(a.y > b.y + 1, 'thrusters hold you up compared with no burn');
  S.step(a, { trickEdge: true }); assert.equal(a.trick, 0, 'no tricks mid-burn');
  const run = () => { const s = highFlight(44); s.z = C.ROAD_LEN + C.CANYON_W + 40; s.y = 30; s.gam = -0.5; s.cmb = { pot: 200, mult: 2, n: 3, last: 'flip' };
    S.step(s, { trickEdge: true }); for (let i = 0; i < 40 * 120 && !s.over; i++) S.step(s, i === 40 ? { stabEdge: true } : {}); return S.score(s); };
  assert.deepEqual(run(), run());
});

test('stabilizing on final approach turns a certain crash into a clean landing and keeps the combo', () => {
  const mk = () => { const t = highFlight(45); t.cmb = { pot: 300, mult: 3, n: 4, last: 'roll' }; t.z = C.ROAD_LEN + C.CANYON_W + 50; t.y = 14; t.gam = -0.75; t.m = 70; return t; };
  const crash = mk(); while (!crash.over) S.step(crash, {}); assert.equal(crash.reason, 'botched');
  const save = mk(); S.step(save, { stabEdge: true }); while (!save.over) S.step(save, {});
  assert.equal(save.reason, 'landed'); assert.equal(save.pts.tricks, 900, 'pot × mult cashed');
});

test('forgiveness: nose-down up to 32° sticks, steeper crashes; a trick >= 85% round at touchdown auto-finishes', () => {
  assert.ok(Math.abs(C.LAND_MAX_DIVE * 57.2958 - 32) < 0.2); assert.equal(C.TRICK_AUTO, 0.85);
  const at = (gamDeg, trickDone) => { const s = highFlight(46); s.z = C.ROAD_LEN + C.CANYON_W + 60; s.m = 70; s.gam = gamDeg / 57.2958; s.y = 0.05; s.pIn = 0;
    if (trickDone != null) { s.y = 20; S.step(s, { trickEdge: true }); s.trick = s.trickDur * (1 - trickDone); s.y = 0.05; s.gam = gamDeg / 57.2958; }
    S.step(s, {}); while (!s.over) S.step(s, {}); return s; };
  assert.equal(at(-28).reason, 'landed', '28° nose-down was a crash before, now clean');
  assert.equal(at(-36).reason, 'botched');
  const auto = at(-5, 0.9); assert.equal(auto.reason, 'landed'); assert.equal(auto.counts.tricks, 1); assert.equal(auto.counts.autoFinish, 1); assert.ok(auto.pts.tricks > 0);
  assert.equal(at(-5, 0.6).reason, 'botched', 'a trick barely past half still botches');
});
