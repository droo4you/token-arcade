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

test('a launch above the clear line flies, decays and lands past the rim for a bonus', () => {
  const s = emptyRoad(4); s.padBoost = 40;
  while (s.phase === 'road') S.step(s, {});
  assert.equal(s.phase, 'sky');
  assert.ok(s.launchV >= C.CLEAR_V);
  const m0 = s.m; for (let i = 0; i < 120; i++) S.step(s, {}); assert.ok(s.m < m0, 'momentum decays');
  s.sky.length = 0; s.sky.push = () => 0; // no traffic for this check
  while (!s.over) S.step(s, {});
  const r = S.score(s);
  assert.equal(r.reason, 'landed'); assert.equal(r.landing, C.LANDING_BONUS); assert.ok(r.pastRim > 0);
  assert.equal(r.total, r.distance + r.pickups + r.tricks + r.landing);
});

test('AIR boosts restore momentum and tricks score only when completed upright', () => {
  const s = emptyRoad(5); s.padBoost = 40; s.air = 2;
  while (s.phase === 'road') S.step(s, {});
  s.sky.push = () => 0;
  for (let i = 0; i < 240; i++) S.step(s, {});
  const before = s.m; S.step(s, { boostEdge: true });
  assert.ok(s.m > before + C.BOOST_M - 1); assert.equal(s.air, 1);
  S.step(s, { trickEdge: true }); assert.ok(s.trick > 0);
  for (let i = 0; i < C.TRICK_TIME * 120 + 2; i++) S.step(s, {});
  assert.equal(s.counts.tricks, 1); assert.equal(s.pts.tricks, C.TRICK_PTS);
  // Now start a flip right before touching down: botched.
  const t = emptyRoad(6); t.padBoost = 40; while (t.phase === 'road') S.step(t, {});
  t.sky.push = () => 0; t.z = C.ROAD_LEN + C.CANYON_W + 50; t.y = 12; t.vy = -30; t.m = 20;
  S.step(t, { trickEdge: true });
  while (!t.over) S.step(t, {});
  assert.equal(t.reason, 'botched'); assert.equal(S.score(t).landing, 0);
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

test('flips have a cooldown and cannot be spammed', () => {
  const s = launch(21); s.sky.push = () => 0; s.y = 60; s.vy = 0; s.m = 100;
  let starts = 0;
  for (let i = 0; i < 120 * 4; i++) { S.step(s, { trickEdge: true }); s.y = 60; s.m = 100; for (const e of s.events) if (e.e === 'trick') starts++; s.events.length = 0; }
  assert.ok(starts <= Math.ceil(4 / (C.TRICK_TIME + C.TRICK_CD)), `started ${starts} flips in 4 s`);
  const t = launch(22); t.y = 5; S.step(t, { trickEdge: true }); assert.equal(t.trick, 0, 'no flips near the ground');
});

test('steering is responsive and stops drifting when released', () => {
  const s = launch(23); s.sky.push = () => 0;
  for (let i = 0; i < 30; i++) S.step(s, { right: true }); // 0.25 s
  assert.ok(s.vx > C.STEER_V * 0.85, `vx ${s.vx}`);
  for (let i = 0; i < 30; i++) S.step(s, {});
  assert.ok(Math.abs(s.vx) < 2, `drift ${s.vx}`);
});

test('sky traffic lives in altitude bands and is never stacked into a wall', () => {
  const s = launch(24);
  for (let i = 0; i < 120 * 6; i++) { S.step(s, { up: true }); if (s.over) break; s.m = 90; }
  assert.ok(s.y > C.BAND_SAT, 'climbing reaches the satellite band');
  const types = new Set(s.sky.map(o => o.type)); assert.ok(types.has('plane') && types.has('satellite'), [...types].join());
  for (const o of s.sky) assert.equal(o.type, o.y < C.BAND_PLANE ? 'bird' : o.y < C.BAND_SAT ? 'plane' : 'satellite');
  for (const a of s.sky) for (const b of s.sky) if (a !== b && Math.abs(a.z - b.z) < 25) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r + 9, `stacked ${a.type}/${b.type}`);
});

// A competent sky pilot: dodges flagged threats, boosts below lift, flips every 2.5 s when high.
function pilot(s) {
  if (s.phase !== 'sky') return driver(s);
  const i = {}, th = S.threats(s).filter(t => t.tt < 1.0)[0];
  if (th) { if (th.x >= s.x) i.left = true; else i.right = true; if (th.y > s.y && s.y > 15) i.down = true; else i.up = true; }
  if (s.m < C.LIFT_REF - 10 && s.air > 0 && s.tick % 30 === 0) i.boostEdge = true;
  if (s.y > 25 && s.trick <= 0 && s.tick % 300 === 0) i.trickEdge = true;
  return i;
}
test('balance: a decent flight lasts ~15-25 s and distance outscores tricks', () => {
  const flights = [];
  for (let seed = 1; seed <= 20; seed++) {
    const s = S.newRun(seed); let t0 = 0;
    while (!s.over && s.tick < 240 * 120) { S.step(s, pilot(s)); if (s.phase === 'sky' && !t0) t0 = s.t; }
    if (!t0) continue;
    const r = S.score(s); flights.push(s.t - t0);
    assert.ok(r.distance > r.tricks * 4, `seed ${seed}: distance ${r.distance} vs tricks ${r.tricks}`);
  }
  const avg = flights.reduce((a, b) => a + b, 0) / flights.length;
  assert.ok(flights.length >= 10 && avg >= 15 && avg <= 26, `avg flight ${avg.toFixed(1)} s over ${flights.length}`);
});
