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
    // Straightaway fairness: hitbox half-widths match the drawn sprites; tumbleweeds sway inside their own lane.
    CAR_HW: 0.8, OBST_HW: { cactus: 0.85, rock: 1.25, tumbleweed: 0.8, cone: 0.4 }, SWAY: 0.45,
    REACT_T: 0.45, SWITCH_T: 0.3, // seconds budgeted to notice a row and to cross one lane
    // Flight
    G: 9.8, LIFT_REF: 70, M_DECAY: 6, M_MAX: 140,
    STEER_V: 20, STEER_RESP: 10, CLIMB_K: 20, PITCH_V: 10, VY_RESP: 2.8,
    BOOST_M: 20, BOOST_VY: 8, BOOST_CD: 0.3,
    TRICK_TIME: 0.85, TRICK_CD: 0.5, TRICK_COST: 5, TRICK_MIN_ALT: 8, TRICK_PTS: 50, COMBO_WINDOW: 1.0,
    ORB_PTS: 50, AIR_PTS: 20, LANDING_BONUS: 500,
    SKY_X: 36, SKY_CEIL: 200, SKY_CHUNK: 80,
    BAND_PLANE: 35, BAND_SAT: 80, // altitude bands: birds below 35 m, planes 35–80 m, satellites above
    WARN_T: 1.6,
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

  /* Worst-case speed at a given z: natural acceleration plus a generous allowance for stacked pads. */
  function vEstAt(z) {
    const t = (-C.V0 + Math.sqrt(C.V0 * C.V0 + 2 * C.ACCEL * z)) / C.ACCEL;
    return Math.min(C.V_MAX, Math.min(C.V_NATURAL, C.V0 + C.ACCEL * t) + 20);
  }
  /* Lay out the highway. Rows are spaced by time at the worst-case speed, and each row's open lane is
     chosen so it is reachable from the previous row's open lanes within the reaction + lane-switch budget. */
  function buildRoad(seed) {
    const r = rng(seed ^ 0x9e3779b9);
    const obstacles = [], pickups = [];
    let z = 110, pads = 0, prevFree = [-1, 0, 1], prevZ = -1e9;
    while (z < C.ROAD_LEN - 90) {
      const progress = z / C.ROAD_LEN;
      const dtRow = (z - prevZ) / vEstAt(z);
      const lanesIn = d => prevFree.some(l => Math.abs(l - d) * C.SWITCH_T + C.REACT_T <= dtRow);
      let blocked = r() < 0.3 + progress * 0.35 ? 2 : 1;
      let lanes = [-1, 0, 1].sort(() => r() - 0.5);
      let free = lanes.slice(blocked);
      if (!free.some(lanesIn)) {
        const ok = [-1, 0, 1].filter(lanesIn);
        if (ok.length) { const open = ok[Math.floor(r() * ok.length)]; lanes = [-1, 0, 1].filter(l => l !== open).concat([open]); }
        else blocked = 0; // can't happen with the spacing below, but never trap the player
        free = lanes.slice(blocked);
      }
      for (let i = 0; i < blocked; i++) {
        const type = OBST[Math.floor(r() * OBST.length)];
        obstacles.push({ type, lane: lanes[i], z, phase: r() * 6.28, hit: false });
      }
      // Only lanes the player can actually be in by this row count as "open" for the next row.
      const reach = free.filter(lanesIn);
      const lane = reach[Math.floor(r() * reach.length)];
      const roll = r();
      const padChance = 0.12 + progress * 0.16;
      if (roll < padChance) { pickups.push({ type: 'pad', lane, z: z + 8, taken: false }); pads++; }
      else if (roll < padChance + 0.24) pickups.push({ type: 'air', lane, z: z + 6, taken: false });
      else for (let k = 0; k < 4; k++) pickups.push({ type: 'orb', lane, z: z - 10 + k * 7, taken: false });
      prevFree = reach; prevZ = z;
      // Gap in seconds at worst-case speed: always enough to react and cross one lane, sometimes two.
      const gapT = C.REACT_T + C.SWITCH_T * (r() < 0.35 ? 2 : 1) + 0.12 + r() * 0.25 - progress * 0.08;
      z += Math.max(46, gapT * vEstAt(z));
    }
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
      m: 0, vy: 0, vx: 0, air: C.AIR_START, rot: 0, trick: 0, combo: 0, lastTrickEnd: -9, bank: 0, boostCd: 0, boostT: 0, launchT: 0,
      obstacles: road.obstacles, pickups: road.pickups,
      sky: [], skyPickups: [], skyChunk: 0,
      pts: { pickups: 0, tricks: 0, landing: 0 }, counts: { orbs: 0, air: 0, pads: 0, tricks: 0, boosts: 0, nearMiss: 0 },
      maxAlt: 0, events: [],
    };
  }

  function rampY(z) { const t = (z - (C.ROAD_LEN - C.RAMP_LEN)) / C.RAMP_LEN; return t <= 0 ? 0 : C.RAMP_H * Math.min(1, t) * Math.min(1, t); }
  function laneX(lane) { return lane * C.LANE_W; }
  function obstacleX(o, t) { return laneX(o.lane) + (o.type === 'tumbleweed' ? Math.sin(t * 1.7 + o.phase) * C.SWAY : 0); }

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
        if (gap < C.OBST_HW[o.type] + C.CAR_HW) { o.hit = true; s.events.push({ e: 'crash', what: o.type }); end(s, 'road'); return; }
        if (!o.near && gap < C.OBST_HW[o.type] + C.CAR_HW + 1) { o.near = true; s.counts.nearMiss++; s.pts.pickups += 10; s.events.push({ e: 'near' }); }
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
        s.phase = 'sky'; s.vy = 12 + (s.v - C.CLEAR_V) * 0.4; s.y = C.RAMP_H; s.launchT = s.t;
        s.events.push({ e: 'launch', v: s.v });
      } else {
        s.phase = 'fall'; s.vy = 4; s.y = C.RAMP_H;
        s.events.push({ e: 'short', v: s.v });
      }
    }
  }

  function bandType(y) { return y < C.BAND_PLANE ? 'bird' : y < C.BAND_SAT ? 'plane' : 'satellite'; }
  const SKY_R = { bird: 1.4, plane: 3.4, satellite: 2.8 };
  /* Sky traffic is spawned ~6 s ahead around the player's altitude, never stacked: objects in a chunk keep a
     flyable gap between them, and each type lives in its own altitude band. */
  function spawnSkyChunk(s) {
    const i = s.skyChunk++;
    const r = rng((s.seed + 0x51ed27 + i * 7919) >>> 0);
    const z0 = C.ROAD_LEN + 140 + i * C.SKY_CHUNK;
    const density = Math.min(3, 1 + Math.floor(i / 5) + (r() < 0.4 ? 1 : 0));
    const placed = [];
    for (let k = 0; k < density * 3 && placed.length < density; k++) {
      const y = clamp(s.y + (r() - 0.4) * 50, 8, C.SKY_CEIL - 8), type = bandType(y), rad = SKY_R[type];
      const o = { type, z: z0 + r() * C.SKY_CHUNK, x: (r() * 2 - 1) * C.SKY_X * 0.85, y, phase: r() * 6.28, r: rad, hit: false, near: false };
      const near = placed.concat(s.sky.slice(-6));
      if (near.some(p => Math.abs(p.z - o.z) < 25 && Math.hypot(p.x - o.x, p.y - o.y) < p.r + o.r + 9)) continue;
      placed.push(o);
    }
    s.sky.push(...placed);
    if (r() < 0.5) s.skyPickups.push({ type: r() < 0.3 ? 'air' : 'orb', z: z0 + r() * C.SKY_CHUNK, x: (r() * 2 - 1) * 18,
      y: clamp(s.y + (r() - 0.3) * 30, 8, C.SKY_CEIL - 5), taken: false });
  }
  // Motion is small and bounded so what you see 5 s out is where it will be.
  function skyObjPos(o, t) {
    if (o.type === 'bird') return { x: o.x + Math.sin(t * 1.3 + o.phase) * 2, y: o.y + Math.sin(t * 2.6 + o.phase) * 0.8 };
    if (o.type === 'plane') return { x: o.x + Math.sin(t * 0.35 + o.phase) * 4, y: o.y };
    return { x: o.x + Math.sin(t * 0.4 + o.phase) * 1.5, y: o.y };
  }
  /* Objects the car will reach within WARN_T seconds and that sit near its current line: the HUD flags these. */
  function threats(s) {
    if (s.phase !== 'sky') return [];
    const out = [];
    for (const o of s.sky) {
      if (o.hit || o.z < s.z) continue;
      const tt = (o.z - s.z) / Math.max(10, s.m); if (tt > C.WARN_T) continue;
      const p = skyObjPos(o, s.t), d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d < o.r + 7) out.push({ o, x: p.x, y: p.y, tt, d });
    }
    return out;
  }
  const lerpRate = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

  function skyStep(s, input, dt) {
    const sx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const sy = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    // Steering: velocity snaps toward the stick target and damps fast when released (no floaty drift).
    s.vx = lerpRate(s.vx, sx * C.STEER_V, sx ? C.STEER_RESP : C.STEER_RESP * 1.3, dt);
    s.x = clamp(s.x + s.vx * dt, -C.SKY_X, C.SKY_X);
    if (Math.abs(s.x) >= C.SKY_X) s.vx = 0;
    s.bank = clamp(s.vx / 14, -1, 1);
    // Vertical: momentum above LIFT_REF climbs, below it sinks; pitch nudges on top. Pitching up bleeds momentum, diving gains it.
    const lift = s.m / C.LIFT_REF;
    const vyT = clamp((lift - 1) * C.CLIMB_K, -24, 12) + sy * C.PITCH_V;
    s.vy = lerpRate(s.vy, vyT, C.VY_RESP, dt);
    if (sy > 0) s.m -= 3 * dt; else if (sy < 0) s.m += 2.5 * dt;
    s.m = clamp(s.m - C.M_DECAY * dt, 0, C.M_MAX);
    s.boostCd = Math.max(0, s.boostCd - dt); s.boostT = Math.max(0, s.boostT - dt);
    if (input.boostEdge && s.boostCd <= 0) {
      if (s.air > 0) { s.air--; s.m = Math.min(C.M_MAX, s.m + C.BOOST_M); s.vy = Math.max(s.vy, 0) + C.BOOST_VY; s.boostCd = C.BOOST_CD; s.boostT = 0.4; s.counts.boosts++; s.events.push({ e: 'boost' }); }
      else s.events.push({ e: 'empty' });
    }
    if (input.trickEdge && s.trick <= 0 && s.t - s.lastTrickEnd >= C.TRICK_CD && s.y > C.TRICK_MIN_ALT) {
      s.trick = C.TRICK_TIME; s.m = Math.max(0, s.m - C.TRICK_COST); s.events.push({ e: 'trick' });
    }
    if (s.trick > 0) {
      s.trick -= dt; s.rot = Math.PI * 2 * (1 - Math.max(0, s.trick) / C.TRICK_TIME);
      if (s.trick <= 0) {
        s.rot = 0; s.counts.tricks++;
        s.combo = s.t - s.lastTrickEnd < C.COMBO_WINDOW + C.TRICK_TIME + C.TRICK_CD ? s.combo + 1 : 0;
        const pts = Math.round(C.TRICK_PTS * (1 + Math.min(s.combo, 2) * 0.25));
        s.pts.tricks += pts; s.lastTrickEnd = s.t; s.events.push({ e: 'landed_trick', pts, combo: s.combo });
      }
    }
    const z0 = s.z; s.z += Math.max(s.m, 12) * dt;
    if (z0 < C.ROAD_LEN + C.CANYON_W && s.z >= C.ROAD_LEN + C.CANYON_W) s.events.push({ e: 'rim' });
    s.y = Math.min(C.SKY_CEIL, s.y + s.vy * dt);
    if (s.y >= C.SKY_CEIL) s.vy = Math.min(0, s.vy);
    s.maxAlt = Math.max(s.maxAlt, s.y);
    while (C.ROAD_LEN + 140 + s.skyChunk * C.SKY_CHUNK < s.z + 520) spawnSkyChunk(s);
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

  const api = { C, rampY, rng, newRun, step, score, laneX, obstacleX, skyObjPos, threats, vEstAt, clamp };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CJSim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
