/* Canyon Jump simulation. Pure and deterministic: fixed 120 Hz step, seeded RNG, no DOM, no clock.
   Units are meters and seconds. x = lateral, y = altitude, z = forward along the highway. */
(function (root) {
  'use strict';
  const C = Object.freeze({
    DT: 1 / 120,
    ROAD_LEN: 2000,      // canyon rim (ramp lip) at this z
    CANYON_W: 300,       // far rim at ROAD_LEN + CANYON_W
    CANYON_DEPTH: 110,   // river level below the rim
    RAMP_LEN: 44, RAMP_H: 6, // kicker at the lip
    LANE_W: 3.4,
    V0: 36, ACCEL: 1.25, V_NATURAL: 72, V_MAX: 110,
    PAD_BOOST: 7, PAD_DECAY: 0.6,
    CLEAR_V: 90,         // launch speed needed to clear the canyon
    AIR_MAX: 5, AIR_START: 1,
    G: 9.8, LIFT_REF: 78, M_DECAY: 3.2, M_MAX: 140,
    BOOST_M: 15, BOOST_VY: 5,
    TRICK_TIME: 0.75, TRICK_COST: 3.5, TRICK_PTS: 150, COMBO_WINDOW: 1.1,
    ORB_PTS: 50, AIR_PTS: 20, LANDING_BONUS: 500,
    SKY_X: 36, SKY_CEIL: 280,
  });

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const OBST = ['cactus', 'rock', 'tumbleweed', 'cone'];

  /* Lay out the highway: rows of obstacles that always leave at least one open lane, pickups in the gaps. */
  function buildRoad(seed) {
    const r = rng(seed ^ 0x9e3779b9);
    const obstacles = [], pickups = [];
    let z = 110, pads = 0, prevFree = [-1, 0, 1], prevZ = 0;
    while (z < C.ROAD_LEN - 90) {
      const progress = z / C.ROAD_LEN;
      const blocked = r() < 0.3 + progress * 0.35 ? 2 : 1;
      let lanes = [-1, 0, 1].sort(() => r() - 0.5);
      // Fairness: with two lanes blocked, the open lane must be reachable from the last row's open lanes.
      if (blocked === 2 && !prevFree.some(l => Math.abs(l - lanes[2]) <= 1 && (Math.abs(l - lanes[2]) === 0 || z - prevZ > 54))) {
        const open = prevFree[Math.floor(r() * prevFree.length)];
        lanes = [-1, 0, 1].filter(l => l !== open).concat([open]);
      }
      for (let i = 0; i < blocked; i++) {
        const type = OBST[Math.floor(r() * OBST.length)];
        obstacles.push({ type, lane: lanes[i], z, phase: r() * 6.28, hit: false });
      }
      const free = lanes.slice(blocked);
      const lane = free[Math.floor(r() * free.length)];
      const roll = r();
      // Pads matter most late: the natural top speed is under the clear line.
      const padChance = 0.12 + progress * 0.16;
      if (roll < padChance) { pickups.push({ type: 'pad', lane, z: z + 8, taken: false }); pads++; }
      else if (roll < padChance + 0.24) pickups.push({ type: 'air', lane, z: z + 6, taken: false });
      else for (let k = 0; k < 4; k++) pickups.push({ type: 'orb', lane, z: z - 10 + k * 7, taken: false });
      prevFree = free; prevZ = z;
      z += Math.max(44, 70 - progress * 20 - r() * 8);
    }
    // Guarantee a fair late run-up: two pads in the final stretch, in different lanes.
    if (pads < 8) for (let i = 0; i < 8 - pads; i++) pickups.push({ type: 'pad', lane: (i % 3) - 1, z: 300 + i * 180, taken: false });
    pickups.push({ type: 'pad', lane: 0, z: C.ROAD_LEN - 70, taken: false });
    pickups.push({ type: 'pad', lane: -1, z: C.ROAD_LEN - 210, taken: false });
    pickups.push({ type: 'pad', lane: 1, z: C.ROAD_LEN - 210, taken: false });
    obstacles.sort((a, b) => a.z - b.z); pickups.sort((a, b) => a.z - b.z);
    return { obstacles, pickups };
  }

  function newRun(seed) {
    seed = seed >>> 0;
    const road = buildRoad(seed);
    return {
      seed, t: 0, tick: 0, phase: 'road', over: false, reason: null,
      z: 0, x: 0, y: 0, lane: 0, v: C.V0, vBase: C.V0, padBoost: 0, launchV: 0,
      m: 0, vy: 0, vx: 0, air: C.AIR_START, rot: 0, trick: 0, combo: 0, lastTrickEnd: -9, bank: 0,
      obstacles: road.obstacles, pickups: road.pickups,
      sky: [], skyPickups: [], skyChunk: 0,
      pts: { pickups: 0, tricks: 0, landing: 0 }, counts: { orbs: 0, air: 0, pads: 0, tricks: 0, boosts: 0, nearMiss: 0 },
      maxAlt: 0, events: [],
    };
  }

  function rampY(z) { const t = (z - (C.ROAD_LEN - C.RAMP_LEN)) / C.RAMP_LEN; return t <= 0 ? 0 : C.RAMP_H * Math.min(1, t) * Math.min(1, t); }
  function laneX(lane) { return lane * C.LANE_W; }
  function obstacleX(o, t) { return laneX(o.lane) + (o.type === 'tumbleweed' ? Math.sin(t * 1.7 + o.phase) * 1.3 : 0); }

  function end(s, reason) { if (s.over) return; s.over = true; s.reason = reason; s.events.push({ e: 'end', reason }); }

  /* input: { left, right, up, down, boost, trick } — booleans; left/right/boost/trick are edges on the road/sky,
     up/down/left/right are held axes in the sky. */
  function step(s, input) {
    if (s.over) return s;
    const dt = C.DT; s.t += dt; s.tick++;
    if (s.phase === 'road') roadStep(s, input, dt);
    else if (s.phase === 'sky') skyStep(s, input, dt);
    else if (s.phase === 'fall') {
      s.vy -= C.G * 1.6 * dt; s.y += s.vy * dt; s.z += s.m * dt; s.m = Math.max(0, s.m - 14 * dt);
      s.rot += dt * 2.2;
      if (s.y <= -C.CANYON_DEPTH + 1) { s.y = -C.CANYON_DEPTH + 1; s.events.push({ e: 'splash' }); end(s, 'short'); }
    }
    return s;
  }

  function roadStep(s, input, dt) {
    if (input.leftEdge && s.lane > -1) { s.lane--; s.events.push({ e: 'lane' }); }
    if (input.rightEdge && s.lane < 1) { s.lane++; s.events.push({ e: 'lane' }); }
    const tx = laneX(s.lane), dx = tx - s.x;
    const step = Math.sign(dx) * Math.min(Math.abs(dx), (6 + Math.abs(dx) * 9) * dt);
    s.x += step; s.bank = clamp(step / dt / 18, -1, 1);
    s.vBase = Math.min(C.V_NATURAL, s.vBase + C.ACCEL * dt);
    s.padBoost = Math.max(0, s.padBoost - C.PAD_DECAY * dt);
    s.v = Math.min(C.V_MAX, s.vBase + s.padBoost);
    const z0 = s.z; s.z += s.v * dt;
    s.y = rampY(s.z);
    for (const o of s.obstacles) {
      if (o.z > s.z + 3) break;
      if (o.hit || o.z < z0 - 3) continue;
      if (Math.abs(o.z - s.z) < 1.9) {
        const gap = Math.abs(obstacleX(o, s.t) - s.x);
        if (gap < 1.55) { o.hit = true; s.events.push({ e: 'crash', what: o.type }); end(s, 'road'); return; }
        if (!o.near && gap < 2.6) { o.near = true; s.counts.nearMiss++; s.pts.pickups += 10; s.events.push({ e: 'near' }); }
      }
    }
    for (const p of s.pickups) {
      if (p.z > s.z + 2) break;
      if (p.taken || p.z < z0 - 2.5) continue;
      if (Math.abs(laneX(p.lane) - s.x) < 1.7) {
        p.taken = true;
        if (p.type === 'pad') { s.padBoost += C.PAD_BOOST; s.counts.pads++; s.events.push({ e: 'pad' }); }
        else if (p.type === 'air') { if (s.air < C.AIR_MAX) s.air++; s.counts.air++; s.pts.pickups += C.AIR_PTS; s.events.push({ e: 'air' }); }
        else { s.counts.orbs++; s.pts.pickups += C.ORB_PTS; s.events.push({ e: 'orb' }); }
      }
    }
    if (s.z >= C.ROAD_LEN) {
      s.launchV = s.v; s.m = s.v;
      if (s.v >= C.CLEAR_V) {
        s.phase = 'sky'; s.vy = 9 + (s.v - C.CLEAR_V) * 0.35; s.y = C.RAMP_H;
        s.events.push({ e: 'launch', v: s.v });
      } else {
        s.phase = 'fall'; s.vy = 4; s.y = C.RAMP_H;
        s.events.push({ e: 'short', v: s.v });
      }
    }
  }

  function spawnSkyChunk(s) {
    const i = s.skyChunk++;
    const r = rng((s.seed + 0x51ed27 + i * 7919) >>> 0);
    const z0 = C.ROAD_LEN + 120 + i * 70;
    const density = Math.min(4, 1 + Math.floor(i / 6) + (r() < 0.5 ? 1 : 0));
    for (let k = 0; k < density; k++) {
      const y = clamp(s.y + (r() - 0.45) * 60, 6, C.SKY_CEIL - 6);
      const type = y < 70 ? 'bird' : y < 170 ? 'plane' : 'satellite';
      s.sky.push({ type, z: z0 + r() * 70, x: (r() * 2 - 1) * C.SKY_X * 0.9, y, phase: r() * 6.28,
        vx: type === 'plane' ? (r() < 0.5 ? -1 : 1) * (4 + r() * 4) : 0,
        r: type === 'plane' ? 3.4 : type === 'satellite' ? 2.8 : 1.4, hit: false, near: false });
    }
    if (r() < 0.55) s.skyPickups.push({ type: r() < 0.4 ? 'air' : 'orb', z: z0 + r() * 70, x: (r() * 2 - 1) * 18,
      y: clamp(s.y + (r() - 0.5) * 30, 5, C.SKY_CEIL - 5), taken: false });
  }
  function skyObjPos(o, t) {
    if (o.type === 'bird') return { x: o.x + Math.sin(t * 1.3 + o.phase) * 3, y: o.y + Math.sin(t * 2.6 + o.phase) * 1.2 };
    if (o.type === 'plane') return { x: o.x + o.vx * (t % 1000), y: o.y };
    return { x: o.x + Math.sin(t * 0.4 + o.phase) * 1.5, y: o.y };
  }

  function skyStep(s, input, dt) {
    const sx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const sy = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    s.vx += (sx * 22 - s.vx * 3) * dt;
    s.x = clamp(s.x + s.vx * dt, -C.SKY_X, C.SKY_X);
    s.bank = clamp(s.vx / 12, -1, 1);
    s.vy += sy * 15 * dt;
    if (sy > 0) s.m -= 1.6 * dt; else if (sy < 0) s.m += 1.1 * dt;
    const lift = clamp(s.m / C.LIFT_REF, 0, 1.12);
    s.vy += (-C.G + C.G * lift) * dt;
    s.vy = clamp(s.vy * (1 - 0.55 * dt), -34, 26);
    s.m = clamp(s.m - C.M_DECAY * dt, 0, C.M_MAX);
    if (input.boostEdge) {
      if (s.air > 0) { s.air--; s.m = Math.min(C.M_MAX, s.m + C.BOOST_M); s.vy += C.BOOST_VY; s.counts.boosts++; s.events.push({ e: 'boost' }); }
      else s.events.push({ e: 'empty' });
    }
    if (input.trickEdge && s.trick <= 0 && s.y > 3) {
      s.trick = C.TRICK_TIME; s.m = Math.max(0, s.m - C.TRICK_COST); s.events.push({ e: 'trick' });
    }
    if (s.trick > 0) {
      s.trick -= dt; s.rot = Math.PI * 2 * (1 - Math.max(0, s.trick) / C.TRICK_TIME);
      if (s.trick <= 0) {
        s.rot = 0; s.counts.tricks++;
        s.combo = s.t - s.lastTrickEnd < C.COMBO_WINDOW + C.TRICK_TIME ? s.combo + 1 : 0;
        const pts = Math.round(C.TRICK_PTS * (1 + Math.min(s.combo, 2) * 0.5));
        s.pts.tricks += pts; s.lastTrickEnd = s.t; s.events.push({ e: 'landed_trick', pts, combo: s.combo });
      }
    }
    const z0 = s.z; s.z += s.m * dt;
    if (z0 < C.ROAD_LEN + C.CANYON_W && s.z >= C.ROAD_LEN + C.CANYON_W) s.events.push({ e: 'rim' });
    s.y = Math.min(C.SKY_CEIL, s.y + s.vy * dt);
    if (s.y >= C.SKY_CEIL) s.vy = Math.min(0, s.vy);
    s.maxAlt = Math.max(s.maxAlt, s.y);
    while (C.ROAD_LEN + 120 + s.skyChunk * 70 < s.z + 520) spawnSkyChunk(s);
    for (const o of s.sky) {
      if (o.hit || o.z < z0 - 4 || o.z > s.z + 4) continue;
      if (Math.abs(o.z - s.z) < o.r + 1) {
        const p = skyObjPos(o, s.t), d = Math.hypot(p.x - s.x, p.y - s.y);
        if (d < o.r + 1.1) { o.hit = true; s.events.push({ e: 'crash', what: o.type }); end(s, 'air'); return; }
        if (!o.near && d < o.r + 4) { o.near = true; s.counts.nearMiss++; s.pts.pickups += 25; s.events.push({ e: 'near' }); }
      }
    }
    for (const p of s.skyPickups) {
      if (p.taken || p.z < z0 - 3 || p.z > s.z + 3) continue;
      if (Math.hypot(p.x - s.x, p.y - s.y) < 2.6 && Math.abs(p.z - s.z) < 3) {
        p.taken = true;
        if (p.type === 'air') { if (s.air < C.AIR_MAX) s.air++; s.counts.air++; s.pts.pickups += C.AIR_PTS; s.events.push({ e: 'air' }); }
        else { s.counts.orbs++; s.pts.pickups += C.ORB_PTS; s.events.push({ e: 'orb' }); }
      }
    }
    if (s.y <= 0) {
      s.y = 0;
      if (s.z < C.ROAD_LEN + C.CANYON_W) { s.phase = 'fall'; s.vy = Math.min(s.vy, -6); s.events.push({ e: 'short' }); }
      else if (s.trick > 0) { s.events.push({ e: 'crash', what: 'botched' }); end(s, 'botched'); }
      else { s.pts.landing = C.LANDING_BONUS; s.events.push({ e: 'land' }); end(s, 'landed'); }
    }
  }

  function score(s) {
    const distance = Math.floor(s.z);
    const pastRim = Math.max(0, Math.floor(s.z - C.ROAD_LEN - C.CANYON_W));
    const total = distance + s.pts.pickups + s.pts.tricks + s.pts.landing;
    return { total, distance, pastRim, pickups: s.pts.pickups, tricks: s.pts.tricks, landing: s.pts.landing,
      launchV: Math.round(s.launchV), maxAlt: Math.round(s.maxAlt), counts: { ...s.counts }, reason: s.reason };
  }

  const api = { C, rampY, rng, newRun, step, score, laneX, obstacleX, skyObjPos, clamp };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CJSim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
