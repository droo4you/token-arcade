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

test('the wide gorge: a top-speed launch clears it hands-off; a minimum launch needs some flying (a pull-up or one boost)', () => {
  const fly = (v, input, air = 0) => { const s = launchAt(v); assert.equal(s.phase, 'sky'); assert.ok(Math.abs(s.launchV - v) < 0.1, `launch ${s.launchV}`);
    quiet(s); s.air = air; while (!s.over) S.step(s, { ...input, boostEdge: s.air > 0 && s.boostCd <= 0 }); return S.score(s); };
  const top = fly(C.V_MAX, {});
  assert.equal(top.reason, 'landed'); assert.ok(top.landing >= C.LANDING_BONUS && top.pastRim > 0);
  assert.equal(top.total, top.distance + top.pickups + top.tricks + top.landing + top.mach);
  assert.equal(fly(C.CLEAR_V, {}).reason, 'short', 'a bare minimum launch, hands off, no longer makes it');
  for (const r of [fly(C.CLEAR_V, { pitch: 0.4 }), fly(C.CLEAR_V, {}, 1), fly(100, { pitch: 0.2 })]) { assert.equal(r.reason, 'landed'); assert.ok(r.pastRim > 0); }
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

test('rolls stay soft on pitch; front/back flips nudge the nose; left/right rolls kick laterally', () => {
  // Mid-spin TRICK_DIP still costs a tiny altitude dip for rolls (no flight-path kick).
  const roll = launchAt(105); roll.y = 100; roll.gam = 0; roll.m = 100; roll.vx = 0; roll.x = 0;
  const base = launchAt(105); base.y = 100; base.gam = 0; base.m = 100;
  S.step(roll, { rollLeftEdge: true }); assert.equal(roll.trickKind, 'roll'); assert.equal(roll.trickDir, -1);
  // Impulse is ramped with the spin: first frame only a slice of VX, but rot is already non-zero.
  assert.ok(roll.rot !== 0, 'roll visual starts same frame');
  assert.ok(Math.abs(roll.vx) < C.ROLL_VX * 0.35, `first-frame vx should be partial ${roll.vx}`);
  for (let i = 0; i < Math.ceil(C.ROLL_RAMP * 120); i++) { S.step(roll, {}); S.step(base, {}); }
  assert.ok(roll.vx < -C.ROLL_VX * 0.85, `left roll vx after ramp ${roll.vx}`);
  const n = Math.ceil(C.ROLL_T * 120) - Math.ceil(C.ROLL_RAMP * 120) + 2;
  for (let i = 0; i < n; i++) { S.step(roll, {}); S.step(base, {}); }
  assert.ok(base.y - roll.y > 0.05 && base.y - roll.y < 2.0, `roll altitude dip ${(base.y - roll.y).toFixed(2)}`);
  assert.ok(Math.abs(base.gam - roll.gam) < 0.08, `roll should not shove gam ${(base.gam - roll.gam).toFixed(3)}`);

  const right = launchAt(105); right.y = 100; right.gam = 0; right.m = 100; right.vx = 0;
  S.step(right, { rollRightEdge: true });
  for (let i = 0; i < Math.ceil(C.ROLL_RAMP * 120); i++) S.step(right, {});
  assert.ok(right.vx > C.ROLL_VX * 0.85, `right roll vx ${right.vx}`);

  const front = launchAt(105); front.y = 100; front.gam = 0; front.m = 100;
  S.step(front, { flipFrontEdge: true }); assert.equal(front.trickKind, 'flip'); assert.equal(front.trickDir, 1);
  assert.ok(front.gam < -C.FLIP_GAM * 0.9 && front.gam > -C.FLIP_GAM - 0.05, `front flip gam ${front.gam}`);
  assert.ok(front.gam > -0.5, 'front flip must not nosedive past the soft FLIP_GAM nudge');

  const back = launchAt(105); back.y = 100; back.gam = 0; back.m = 100;
  S.step(back, { flipBackEdge: true }); assert.equal(back.trickDir, -1);
  assert.ok(back.gam > C.FLIP_GAM * 0.9, `back flip gam ${back.gam}`);
});

test('roll coast: sideways kick travels for a beat instead of dying to steer damping', () => {
  const s = launchAt(105); s.y = 100; s.gam = 0; s.m = 100; s.vx = 0; s.x = 0;
  S.step(s, { rollRightEdge: true });
  for (let i = 0; i < Math.ceil(C.ROLL_RAMP * 120); i++) S.step(s, {}); // finish the coupled ramp
  const x0 = s.x, vx0 = s.vx;
  assert.ok(vx0 > C.ROLL_VX * 0.85, `ramped vx ${vx0}`);
  for (let i = 0; i < Math.round(C.ROLL_COAST * 0.7 * 120); i++) S.step(s, {}); // hands off
  assert.ok(s.x - x0 > 4, `coasted ${(s.x - x0).toFixed(2)} m`); assert.ok(Math.abs(s.vx) > Math.abs(vx0) * 0.35, 'vx still alive mid-coast');
});

test('roll shove and spin stay coupled: VX tracks rot through the ramp window', () => {
  const s = launchAt(105); s.y = 100; s.gam = 0; s.m = 100; s.vx = 0;
  S.step(s, { rollRightEdge: true });
  let prevU = 0;
  for (let i = 0; i < Math.ceil(C.ROLL_RAMP * 120); i++) {
    S.step(s, {});
    const elapsed = s.trickDur - s.trick, u = Math.min(1, elapsed / C.ROLL_RAMP);
    const spinU = Math.abs(s.rot) / (Math.PI * 2);
    // Sideways kick fraction stays within a beat of spin fraction over the ramp.
    assert.ok(Math.abs(s.rollKickGiven / C.ROLL_VX - u) < 0.05, `kick u ${s.rollKickGiven / C.ROLL_VX} vs ${u}`);
    assert.ok(spinU + 0.02 >= prevU, 'spin advances');
    prevU = spinU;
  }
  assert.ok(Math.abs(s.vx) > C.ROLL_VX * 0.85);
});

test('dive recovery: pull-up from a steep mid/high-speed dive catches in under 0.7 s', () => {
  const s = launchAt(105); s.y = 140; s.gam = -0.7; s.m = 140; s.pIn = 0; let t = 0;
  while (s.gam < -0.05 && t < 3) { S.step(s, { pitch: 1 }); t += C.DT; }
  assert.ok(t < 0.7, `dive recover ${t.toFixed(2)} s`);
  // 0.3 s of full pull from -0.7 should already be past the recover threshold.
  const u = launchAt(105); u.y = 140; u.gam = -0.7; u.m = 140; u.pIn = 0;
  for (let i = 0; i < 36; i++) S.step(u, { pitch: 1 });
  assert.ok(u.gam > -0.35, `0.3 s pull reached ${u.gam.toFixed(3)}`);
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
  const A = s.cfg; assert.ok(s.y > 150, 'climbing reaches the balloon band');
  const types = new Set(s.sky.map(o => o.type)); assert.ok(types.has('balloon'), [...types].join());
  for (const o of s.sky) if (o.type === 'satellite') assert.ok(o.y >= A.satellite.minY && o.y <= A.ceil - 8, `satellite at ${o.y}`); else assert.equal(o.type, S.bandType(s, o.y));
  for (const a of s.sky) for (const b of s.sky) if (a !== b && Math.abs(a.z - b.z) < 25) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r + 9, `stacked ${a.type}/${b.type}`);
});

test('distance is king: on every Mach 0.5 run the distance score beats the trick payout', () => {
  let n = 0;
  for (let seed = 1; seed <= 60; seed++) { const s = S.newRun(seed); while (!s.over && s.tick < 300 * 120) { S.step(s, S.bot(s)); s.events.length = 0; }
    const r = S.score(s); if (!r.mach05) continue; n++; assert.ok(r.distance > r.tricks, `seed ${seed}: distance ${r.distance} vs tricks ${r.tricks}`); }
  assert.ok(n >= 30, `mach runs ${n}`);
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
  assert.ok(launched >= 20 && avg >= 15 && avg <= 42, `avg flight ${avg.toFixed(1)} s over ${launched}`);
  assert.ok(landed >= launched * 0.7, `landed ${landed}/${launched}`);
  // Distance stays a major share of the score next to combos. (The pilot now completes Mach chains, which convert a
  // can stash into a fast, high, trick-friendly stretch; the old 'distance > combos' held only because its chain never fired.)
  assert.ok(dist > tricks, `distance ${dist} vs combo payouts ${tricks}`);
});

test('Mach 0.5 (617 km/h): out of reach on the road; a quick 3-boost chain off a good launch reaches it, 2 level boosts do not, 2 boosts in a committed dive do; once per run', () => {
  assert.ok(Math.abs(C.MACH05 * 3.6 - 617) < 1e-9);
  assert.ok(C.V_MAX < C.MACH05, 'road top speed stays under Mach 0.5');
  assert.ok(C.M_MAX > C.MACH05 + 15, 'sky momentum can go well past it');
  // Launch at v (pads held), then chain n boosts as fast as the cooldown allows, hands off the stick.
  const chain = (v, n, gap = C.BOOST_CD) => {
    const s = emptyRoad(30); while (s.phase === 'road') { s.padBoost = v - s.vBase; S.step(s, {}); }
    assert.ok(Math.abs(s.launchV - Math.min(v, C.V_MAX)) < 0.5); quiet(s); s.air = n; let used = 0, events = 0, last = -9;
    for (let i = 0; i < 120 * 6 && !s.over; i++) { const b = s.boostCd <= 0 && used < n && s.t - last >= gap - 1e-9; if (b) { used++; last = s.t; } S.step(s, { boostEdge: b }); for (const e of s.events) if (e.e === 'mach') events++; s.events.length = 0; }
    return { s, events };
  };
  for (const v of [C.V_MAX, 100]) assert.equal(chain(v, 3).s.counts.mach, 1, `3-chain off a ${Math.round(v * 3.6)} km/h launch reaches Mach 0.5`);
  assert.equal(chain(C.V_MAX, 3, 0.55).s.counts.mach, 1, 'a human-speed chain (taps 0.55 s apart) off a top-speed launch still makes it');
  assert.equal(chain(C.CLEAR_V, 3).s.counts.mach, 1, 'phase 6: a fast 3-chain is the Mach move even off a bare launch');
  assert.equal(chain(C.CLEAR_V, 2).s.counts.mach, 0, 'a bare launch with two boosts does not make it');
  assert.equal(chain(C.V_MAX, 2).s.counts.mach, 0, 'two boosts in level flight are not enough');
  assert.equal(chain(C.V_MAX, 3, C.CHAIN_T + 0.2).s.counts.mach, 0, 'three spaced-out boosts (no chain) are not enough');
  // Committed dive: at altitude, stick fully forward, and fire 2 boosts once the nose is down (dive boosts kick harder).
  const dive = (n, push = true) => {
    const s = launchAt(110, 40); s.z = C.ROAD_LEN + C.CANYON_W + 100; s.y = 120; s.m = 110; s.gam = 0; s.air = n; let used = 0;
    for (let i = 0; i < 120 * 10 && !s.over && S.agl(s) > 25; i++) { const b = s.boostCd <= 0 && used < n && (!push || s.gam <= C.DIVE_BOOST_GAM); if (b) used++; S.step(s, { pitch: push ? -1 : 0, boostEdge: b }); }
    return s;
  };
  const d2 = dive(2); assert.equal(d2.counts.mach, 1, `2 boosts in a dive: top ${Math.round(d2.maxV * 3.6)} km/h`); assert.equal(d2.counts.diveBoosts, 2);
  assert.equal(dive(2, false).counts.mach, 0, 'same 2 boosts without the dive fall short');
  assert.equal(dive(1).counts.mach, 0, 'one boost and a dive is not enough');
  const four = chain(C.V_MAX, 4); assert.equal(four.s.counts.mach, 1); assert.equal(four.events, 1, 'fires once');
  assert.equal(four.s.pts.mach, C.MACH_BONUS);
  const r = S.score(four.s); assert.equal(r.mach05, 1); assert.ok(r.topKmh >= 617);
  assert.equal(r.total, r.distance + r.pickups + r.tricks + r.landing + r.mach);
  // Determinism holds with the new state.
  assert.deepEqual(S.score(chain(C.V_MAX, 4).s), S.score(chain(C.V_MAX, 4).s));
});

test('AIR cans have no cap: every can you grab is kept (road and sky), and boosts spend them one at a time', () => {
  assert.equal(C.AIR_MAX, undefined, 'no AIR_MAX');
  const s = emptyRoad(5);
  for (let k = 0; k < 12; k++) s.pickups.push({ type: 'air', lane: 0, z: 200 + k * 60, taken: false });
  while (s.phase === 'road' && !s.over) { s.padBoost = 105 - s.vBase; S.step(s, {}); }
  assert.equal(s.phase, 'sky'); assert.equal(s.counts.air, 12); assert.equal(s.air, C.AIR_START + 12);
  quiet(s); s.y = 90; s.gam = 0;
  s.skyPickups.push = Array.prototype.push; s.skyPickups.push({ type: 'air', x: s.x, y: s.y, z: s.z + 2, taken: false });
  for (let i = 0; i < 12; i++) S.step(s, {});
  assert.equal(s.air, C.AIR_START + 13, 'sky cans stack past the old 5-can limit too');
  let used = 0; for (let i = 0; i < 120 * 6 && !s.over; i++) { const b = s.boostCd <= 0; S.step(s, { boostEdge: b, pitch: 0.2 }); if (b) used++; }
  assert.ok(s.counts.boosts >= 10 && s.air === C.AIR_START + 13 - s.counts.boosts, `boosts ${s.counts.boosts}, air ${s.air}`);
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

test('runway never runs out: the longest reference-pilot flight lands well inside the drawn past-rim road', () => {
  let max = 0;
  for (let seed = 1; seed <= 40; seed++) { const s = S.newRun(seed); while (!s.over && s.tick < 300 * 120) { S.step(s, S.bot(s)); s.events.length = 0; }
    max = Math.max(max, s.z - C.ROAD_LEN - C.CANYON_W); }
  // Worst case: top-speed launch, a full can stash chained, then a gentle glide for range.
  const s = emptyRoad(7); while (s.phase === 'road') { s.padBoost = C.V_MAX - s.vBase; S.step(s, {}); } s.air = 12;
  for (let i = 0; i < 300 * 120 && !s.over; i++) { S.step(s, { boostEdge: s.boostCd <= 0 && s.air > 0, pitch: S.agl(s) < 30 ? 0.3 : 0.05 }); s.events.length = 0; }
  max = Math.max(max, s.z - C.ROAD_LEN - C.CANYON_W);
  assert.ok(max * 1.5 < C.RUNWAY_PAST_RIM, `longest flight ${Math.round(max)} m vs runway ${C.RUNWAY_PAST_RIM} m`);
});

test('near-misses pay: a wider band and a real payout on road and in the sky', () => {
  assert.ok(C.NEAR_ROAD_BAND >= 1.25 && C.NEAR_ROAD_BAND < C.LANE_W - C.OBST_HW.rock - C.CAR_HW && C.NEAR_ROAD_PTS >= 50 && C.NEAR_BAND >= 6 && C.NEAR_POT >= 40);
  // Driving straight down the middle lane past rocks in both side lanes is NOT a near miss.
  const s = emptyRoad(3); s.obstacles = [{ type: 'rock', lane: 1, z: 60, phase: 0, hit: false }, { type: 'rock', lane: -1, z: 90, phase: 0, hit: false }];
  while (s.z < 100 && !s.over) S.step(s, {}); assert.equal(s.counts.nearMiss, 0);
  // Shaving a cone (edge gap 1.2 m < band) is.
  const t = emptyRoad(3); t.obstacles = [{ type: 'cone', lane: 1, z: 60, phase: 0, hit: false }];
  while (t.z < 70 && !t.over) { t.x = 1.2; S.step(t, {}); }
  assert.equal(t.counts.nearMiss, 1); assert.equal(t.pts.pickups, C.NEAR_ROAD_PTS); assert.equal(t.over, false);
});

test('pitch is snappy: full up stick swings a -0.2 rad dive to +0.1 rad climb in under 0.85 s at 100-180 m/s', () => {
  for (const v of [100, 150, 180]) {
    const s = S.newRun(1); s.phase = 'sky'; s.z = C.ROAD_LEN + 600; s.y = 100; s.m = v; s.gam = -0.2; let t = 0;
    while (s.gam < 0.1 && t < 5) { S.step(s, { pitch: 1 }); s.events.length = 0; t += C.DT; }
    assert.ok(t < 0.85, `${v} m/s: ${t.toFixed(2)} s`);
  }
});

test('rewards: magnet pulls a safe ring onto a modest miss; Mach bonus is big but distance stays king', () => {
  const s = launchAt(105); s.gam = 0.02; s.rings = [{ x: 8, y: s.y, z: s.z + 50, taken: false }]; s.sky.push = () => 0;
  for (let i = 0; i < 120 && !s.over; i++) S.step(s, {});
  assert.equal(s.counts.rings, 1, 'an 8 m miss still collects');
  assert.ok(C.MACH_BONUS >= 1000);
});

test('level 1 air: settings come from the level file; balloons are the main hazard, satellites rare and only near the ceiling', () => {
  const L = require('../src/levels.js'), air = L.get('snake-river').air;
  assert.equal(S.newRun(1).cfg, air, 'newRun reads the default level file');
  assert.ok(air.ceil > 200, 'ceiling raised');
  let n = { balloon: 0, satellite: 0, bird: 0, plane: 0 }, chunks = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = launchAt(110, seed); s.y = 120; s.sky.push = s.rings.push = s.skyPickups.push = Array.prototype.push;
    while (s.skyChunk < 40) { s.z += 80; s.y = 60 + (s.skyChunk % 5) * 30; S.step(s, {}); if (s.over) { s.over = false; s.phase = 'sky'; } }
    chunks += s.skyChunk; for (const o of s.sky) n[o.type]++;
    for (const o of s.sky) if (o.type === 'satellite') assert.ok(o.y >= air.satellite.minY);
  }
  assert.ok(n.balloon > n.satellite * 5 && n.balloon > n.bird, JSON.stringify(n));
  assert.equal(n.plane, 0, 'no jets on level 1');
  assert.ok(n.satellite / chunks < 0.15, `satellites per chunk ${n.satellite / chunks}`);
  // Balloons drift, deterministically, and the hitbox is smaller than the drawn envelope.
  const b = { type: 'balloon', x: 0, y: 100, z: 0, phase: 1, dx: air.balloon.driftX, dy: air.balloon.driftY, rate: air.balloon.rate };
  assert.notDeepEqual(S.skyObjPos(b, 0), S.skyObjPos(b, 10)); assert.deepEqual(S.skyObjPos(b, 3), S.skyObjPos(b, 3));
  assert.ok(air.balloon.r < air.balloon.drawR);
  // A balloon brushed (inside the near band, outside the hitbox) counts as a near miss and does not crash.
  const t = launchAt(110, 3); t.sky.push = () => 0; t.y = 100; t.gam = 0; t.m = 100;
  t.sky.length = 0; t.sky[0] = { type: 'balloon', x: 0, y: 100 + air.balloon.r + 3, z: t.z + 30, phase: 0, dx: 0, dy: 0, rate: 0, r: air.balloon.r, hit: false, near: false };
  for (let i = 0; i < 60 && !t.over; i++) { S.step(t, {}); t.y = 100; t.gam = 0; }
  assert.equal(t.over, false); assert.equal(t.counts.nearMiss, 1);
});
