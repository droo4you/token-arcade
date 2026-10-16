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
  t.sky.push = () => 0; t.z = C.ROAD_LEN + C.CANYON_W + 50; t.y = 4; t.vy = -30; t.m = 20;
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
