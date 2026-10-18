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
    // Flight: point-mass glider with real gravity. Lift = G·CL·(V/LIFT_REF)² (capped at G_LIMIT g), pitch input sets CL,
    // gravity along the path trades height for speed (dive = faster, climb = slower), drag bleeds energy so every flight ends.
    G: 9.8, G_SKY: 20, LIFT_REF: 70, CL_N: 0.32, CL_UP: 1.55, CL_DN: -0.5, G_LIMIT: 3.2, V_STALL: 44, V_MIN_LIFT: 28,
    DRAG0: 1.6, DRAG2: 0.00028, DRAG_I: 0.6, PITCH_RESP: 7, GAM_MIN: -1.25, GAM_MAX: 1.05, M_MAX: 180,
    STEER_V: 20, STEER_RESP: 10,
    BOOST_M: 20, BOOST_CD: 0.3, BOOST_POP: 0.06,
    // Tricks feed an unbanked combo: pot × multiplier pays out only on a clean landing past the far rim.
    FLIP_T: 0.7, ROLL_T: 1.05, FLIP_PTS: 60, ROLL_PTS: 100, TRICK_CD: 0.2, TRICK_COST: 3, TRICK_MIN_AGL: 8, VARIETY: 1.5,
    MULT_STEP: 0.5, MULT_MAX: 6, NEAR_POT: 25, NEAR_MULT: 0.25, RING_POT: 50, RING_MULT: 0.25, RING_V: 8, RING_R: 3.2,
    // Gorge wall profile shared by the sim and the 3D walls: [depth below the rim, inset into the gap] (m). Cliff bands,
    // benches and an inner gorge: the canyon narrows as it deepens, from 300 m at the rim to ~212 m at the river.
    WALL: [[0, 0], [4, 0.5], [30, 3], [34, 14], [68, 18], [74, 30], [104, 34], [110, 44]],
    // Landing forgiveness: nose-down up to 32° still sticks, and a trick at least 85% done at touchdown auto-finishes.
    LAND_MAX_DIVE: 0.56, TRICK_AUTO: 0.85, ROAD_BONUS: 150, ROAD_HW: 7,
    // STABILIZE (cold-gas thrusters): unwinds any trick to the nearest full turn, levels the nose to STAB_GAM and trims
    // the sink rate. One AIR can = 0.4 s burn, 1 s cooldown; with no cans it still fires, slower (0.9 s) with a 3 s cooldown.
    // A trick it cancels counts as landed (combo) if at least STAB_CREDIT done, otherwise it's just dropped. The pot is kept.
    STAB_T: 0.4, STAB_CD: 1, STAB_T_FREE: 0.9, STAB_CD_FREE: 3, STAB_GAM: -0.05, STAB_SINK: 0.3, STAB_CREDIT: 0.5,
    ORB_PTS: 50, AIR_PTS: 20, LANDING_BONUS: 500,
    SKY_X: 36, SKY_CEIL: 200, SKY_CHUNK: 80,
    BAND_PLANE: 35, BAND_SAT: 80, // altitude bands: birds below 35 m, planes 35–80 m, satellites above
    WARN_T: 1.6,
    // Mach 0.5 ≈ 617 km/h. Speed is m/s everywhere: road speed v on the ground, airspeed m in the air.
    // The road tops out at V_MAX (396 km/h), so Mach is earned in the sky: chain AIR boosts and/or trade altitude in a dive.
    MACH05: 617 / 3.6, MACH_BONUS: 250,
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
      // Forgiving opening: single-lane rows only for the first stretch, then the double blocks ramp in.
      let blocked = r() < (z < 450 ? 0 : 0.25 + progress * 0.4) ? 2 : 1;
      // Fisher–Yates with the seeded RNG: a random-comparator sort consumes RNG differently across JS engines.
      let lanes = [-1, 0, 1]; for (let k = 2; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [lanes[k], lanes[j]] = [lanes[j], lanes[k]]; }
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
      // sky: m = airspeed, gam = flight-path angle (rad, + = climbing), pIn = smoothed pitch input (-1 dive .. +1 climb)
      m: 0, vy: 0, vx: 0, gam: 0, pIn: 0, gLoad: 1, air: C.AIR_START, rot: 0, trick: 0, trickKind: null, trickDir: 1, trickDur: 0, lastTrickEnd: -9, stabT: 0, stabDur: 0, stabCd: 0, stabRot0: 0, stabRot1: 0,
      cmb: { pot: 0, mult: 1, n: 0, last: null }, bank: 0, boostCd: 0, boostT: 0, launchT: 0,
      obstacles: road.obstacles, pickups: road.pickups,
      sky: [], skyPickups: [], rings: [], skyChunk: 0,
      pts: { pickups: 0, tricks: 0, landing: 0, mach: 0 },
      counts: { orbs: 0, air: 0, pads: 0, tricks: 0, flips: 0, rolls: 0, rings: 0, boosts: 0, nearMiss: 0, mach: 0, bestMult: 1, stabs: 0, autoFinish: 0 }, maxV: 0,
      maxAlt: 0, landGam: 0, onRoad: false, events: [],
    };
  }

  function rampY(z) { const t = (z - (C.ROAD_LEN - C.RAMP_LEN)) / C.RAMP_LEN; return t <= 0 ? 0 : C.RAMP_H * Math.min(1, t) * Math.min(1, t); }
  function laneX(lane) { return lane * C.LANE_W; }
  function obstacleX(o, t) { return laneX(o.lane) + (o.type === 'tumbleweed' ? Math.sin(t * 1.7 + o.phase) * C.SWAY : 0); }
  const FAR_RIM = () => C.ROAD_LEN + C.CANYON_W;
  /* Ground height under z: the rim plateau (0) on both sides, the river floor over the gap. */
  function groundY(z) { return z > C.ROAD_LEN && z < C.ROAD_LEN + C.CANYON_W ? -C.CANYON_DEPTH : 0; }
  const agl = s => s.y - groundY(s.z);
  /* How far a wall at depth d (m below the rim) juts into the gap. */
  function wallInset(d) {
    const W = C.WALL; if (d <= 0) return 0; if (d >= W[W.length - 1][0]) return W[W.length - 1][1];
    let k = 0; while (W[k + 1][0] < d) k++;
    const [d0, i0] = W[k], [d1, i1] = W[k + 1]; return i0 + (i1 - i0) * (d - d0) / (d1 - d0);
  }
  /* Inside the rock of either gorge wall at (z, y)? */
  function inWall(z, y) { if (y >= 0 || z <= C.ROAD_LEN || z >= FAR_RIM()) return false; const k = wallInset(-y); return z < C.ROAD_LEN + k || z > FAR_RIM() - k; }

  function end(s, reason) { if (s.over) return; s.over = true; s.reason = reason; s.events.push({ e: 'end', reason }); }

  /* input: { leftEdge, rightEdge, boostEdge, trickEdge (kickflip), rollEdge (barrel roll), left, right, up, down,
     pitch (-1..1 analog, overrides up/down), steer (-1..1 analog, overrides left/right) }. */
  function step(s, input) {
    if (s.over) return s;
    const dt = C.DT; s.t += dt; s.tick++;
    if (s.phase === 'road') roadStep(s, input, dt);
    else if (s.phase === 'sky') skyStep(s, input, dt);
    else if (s.phase === 'fall') {
      // Too slow off the ramp: no lift, just a heavy tumble into the gorge.
      s.vy -= C.G_SKY * dt; s.y += s.vy * dt; s.z += s.m * dt; s.m = Math.max(0, s.m - 14 * dt);
      s.rot += dt * 2.2;
      if (s.y < 0 && s.z >= FAR_RIM() - wallInset(-s.y)) { s.z = FAR_RIM() - wallInset(-s.y); s.events.push({ e: 'crash', what: 'wall' }); end(s, 'short'); }
      else if (s.y <= -C.CANYON_DEPTH + 1) { s.y = -C.CANYON_DEPTH + 1; s.events.push({ e: 'splash' }); end(s, 'short'); }
    }
    if (!s.over) checkMach(s);
    return s;
  }

  function speedOf(s) { return s.phase === 'road' ? s.v : s.phase === 'sky' ? s.m : 0; }
  function checkMach(s) {
    const v = speedOf(s); if (v > s.maxV) s.maxV = v;
    if (!s.counts.mach && v >= C.MACH05) { s.counts.mach = 1; s.pts.mach = C.MACH_BONUS; s.events.push({ e: 'mach', v }); }
  }
  const LAUNCH_GAM = Math.atan(2 * C.RAMP_H / C.RAMP_LEN); // ramp lip angle (≈15°)
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
        s.phase = 'sky'; s.gam = LAUNCH_GAM; s.vy = s.v * Math.sin(LAUNCH_GAM); s.y = C.RAMP_H; s.launchT = s.t;
        s.events.push({ e: 'launch', v: s.v });
      } else {
        s.phase = 'fall'; s.vy = 4; s.y = C.RAMP_H;
        s.events.push({ e: 'short', v: s.v });
      }
    }
  }

  function bandType(y) { return y < C.BAND_PLANE ? 'bird' : y < C.BAND_SAT ? 'plane' : 'satellite'; }
  const SKY_R = { bird: 1.4, plane: 3.4, satellite: 2.8 };
  // Worst-case vertical drift of each type's motion (see skyObjPos): rewards on a risky line are offset vertically,
  // so horizontal sway can only move a hazard further from them.
  const SWAY_Y = { bird: 0.8, plane: 0, satellite: 0 };
  const RING_GAP = 1.6, CAN_GAP = 2.0;
  /* Sky traffic is spawned ~5 s ahead around the player's altitude, never stacked: objects in a chunk keep a
     flyable gap between them, and each type lives in its own altitude band. Rewards sit on risky lines: boost rings
     and AIR cans hug a hazard (just outside its hitbox, inside its near-miss radius), and dive gates (descending
     ring lines) pay out speed for trading height. */
  function spawnSkyChunk(s) {
    const i = s.skyChunk++;
    const r = rng((s.seed + 0x51ed27 + i * 7919) >>> 0);
    const z0 = C.ROAD_LEN + 140 + i * C.SKY_CHUNK;
    const overGap = z0 + C.SKY_CHUNK > C.ROAD_LEN && z0 < FAR_RIM();
    const yMin = overGap ? -C.CANYON_DEPTH + 18 : 8;
    const density = Math.min(3, 1 + Math.floor(i / 4) + (r() < 0.45 ? 1 : 0));
    const placed = [];
    for (let k = 0; k < density * 3 && placed.length < density; k++) {
      const y = clamp(s.y + (r() - 0.45) * 60, yMin, C.SKY_CEIL - 8), type = bandType(y), rad = SKY_R[type];
      const o = { type, z: z0 + r() * C.SKY_CHUNK, x: (r() * 2 - 1) * C.SKY_X * 0.85, y, phase: r() * 6.28, r: rad, hit: false, near: false };
      const near = placed.concat(s.sky.slice(-6));
      if (near.some(p => Math.abs(p.z - o.z) < 25 && Math.hypot(p.x - o.x, p.y - o.y) < p.r + o.r + 9)) continue;
      placed.push(o);
    }
    s.sky.push(...placed);
    const all = placed.concat(s.sky.slice(-9));
    // A reward is legal if it never overlaps any hazard's hitbox wherever that hazard sways.
    const clearOf = (x, y, z, rad) => all.every(o => Math.abs(o.z - z) > 12 || Math.hypot(o.x - x, o.y - y) - 4.5 > o.r + 1.1 + rad + SWAY_Y[o.type]);
    for (const o of placed) {
      const roll = r(), side = r() < 0.5 ? 1 : -1;
      if (roll < 0.45) { // boost ring above/below the hazard
        const d = o.r + C.RING_R + RING_GAP + SWAY_Y[o.type], ry = clamp(o.y + side * d, yMin, C.SKY_CEIL - 6);
        if (Math.abs(ry - o.y) >= d - 1e-9) s.rings.push({ x: o.x, y: ry, z: o.z, taken: false, risky: true, host: o.type, phase: o.phase });
      } else if (roll < 0.75) { // AIR can tucked against it
        const d = o.r + CAN_GAP + SWAY_Y[o.type], cy = clamp(o.y + side * d, yMin, C.SKY_CEIL - 5);
        if (Math.abs(cy - o.y) >= d - 1e-9) s.skyPickups.push({ type: 'air', x: o.x, y: cy, z: o.z, taken: false, risky: true, phase: o.phase });
      }
    }
    if (r() < 0.32) { // dive gate: three rings stepping down
      const gx = (r() * 2 - 1) * C.SKY_X * 0.6, gz = z0 + r() * C.SKY_CHUNK * 0.5;
      for (let k = 0; k < 3; k++) {
        const ring = { x: gx, y: clamp(s.y - 6 - k * 7, yMin + 4, C.SKY_CEIL - 6), z: gz + k * 30, taken: false, risky: false, gate: k };
        if (clearOf(ring.x, ring.y, ring.z, C.RING_R)) s.rings.push(ring);
      }
    }
    if (r() < 0.5) {
      const p = { type: r() < 0.25 ? 'air' : 'orb', z: z0 + r() * C.SKY_CHUNK, x: (r() * 2 - 1) * 18, y: clamp(s.y + (r() - 0.3) * 30, yMin, C.SKY_CEIL - 5), taken: false };
      if (clearOf(p.x, p.y, p.z, 2.6)) s.skyPickups.push(p);
    }
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
    const out = [], fwd = Math.max(10, s.m * Math.cos(s.gam));
    for (const o of s.sky) {
      if (o.hit || o.z < s.z) continue;
      const tt = (o.z - s.z) / fwd; if (tt > C.WARN_T) continue;
      const p = skyObjPos(o, s.t), py = s.y + s.vy * tt * 0.5, d = Math.hypot(p.x - s.x, p.y - py);
      if (d < o.r + 7) out.push({ o, x: p.x, y: p.y, tt, d });
    }
    return out;
  }
  const lerpRate = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

  /* Lift from pitch input and airspeed (m/s²). Exposed so the HUD and tests share the exact model. */
  function liftAccel(V, pIn) {
    const CL = pIn >= 0 ? C.CL_N + (C.CL_UP - C.CL_N) * pIn : C.CL_N + (C.CL_DN - C.CL_N) * -pIn;
    const stallK = clamp((V - C.V_MIN_LIFT) / (C.V_STALL - C.V_MIN_LIFT), 0, 1);
    return clamp(C.G_SKY * CL * (V / C.LIFT_REF) * (V / C.LIFT_REF) * stallK, -C.G_LIMIT * C.G_SKY, C.G_LIMIT * C.G_SKY);
  }
  function addCombo(s, pot, mult) { s.cmb.pot += pot; s.cmb.mult = Math.min(C.MULT_MAX, s.cmb.mult + mult); if (s.cmb.mult > s.counts.bestMult) s.counts.bestMult = s.cmb.mult; }
  function startTrick(s, kind, dir) {
    if (s.trick > 0 || s.stabT > 0 || s.t - s.lastTrickEnd < C.TRICK_CD || agl(s) <= C.TRICK_MIN_AGL) return false;
    s.trickKind = kind; s.trickDir = dir || 1; s.trickDur = kind === 'roll' ? C.ROLL_T : C.FLIP_T; s.trick = s.trickDur;
    s.m = Math.max(0, s.m - C.TRICK_COST); s.events.push({ e: 'trick', kind, dir: s.trickDir }); return true;
  }

  const trickProgress = s => s.trick > 0 ? 1 - s.trick / s.trickDur : 0;
  /* Bank a completed trick into the combo. via: undefined (spun all the way), 'stab' (thrusters, >= half done), 'auto' (touchdown). */
  function finishTrick(s, via) {
    s.trick = 0; s.counts.tricks++; s.counts[s.trickKind === 'roll' ? 'rolls' : 'flips']++;
    const base = s.trickKind === 'roll' ? C.ROLL_PTS : C.FLIP_PTS, varied = s.cmb.last && s.cmb.last !== s.trickKind;
    const pts = Math.round(base * (varied ? C.VARIETY : 1));
    s.cmb.n++; s.cmb.last = s.trickKind; addCombo(s, pts, s.cmb.n > 1 ? C.MULT_STEP : 0);
    s.lastTrickEnd = s.t; s.events.push({ e: 'landed_trick', kind: s.trickKind, pts, varied, n: s.cmb.n, mult: s.cmb.mult, pot: s.cmb.pot, via });
  }
  /* STABILIZE: fire the cold-gas thrusters. Returns false if still cooling down. */
  function stabilize(s) {
    if (s.phase !== 'sky' || s.stabCd > 0 || s.stabT > 0) return false;
    const free = s.air <= 0; if (!free) s.air--;
    s.stabDur = s.stabT = free ? C.STAB_T_FREE : C.STAB_T; s.stabCd = free ? C.STAB_CD_FREE : C.STAB_CD;
    let outcome = null; const kind = s.trick > 0 ? s.trickKind : null;
    s.stabRot0 = s.rot || 0; s.stabRot1 = 0;
    if (s.trick > 0) {
      const done = trickProgress(s);
      if (done >= C.STAB_CREDIT) { s.stabRot1 = s.trickDir * Math.PI * 2; outcome = 'credited'; finishTrick(s, 'stab'); }
      else { s.trick = 0; s.lastTrickEnd = s.t; outcome = 'cancelled'; }
    }
    s.counts.stabs++; s.events.push({ e: 'stab', free, kind, outcome, dur: s.stabDur });
    return true;
  }

  function skyStep(s, input, dt) {
    const sx = input.steer != null ? clamp(input.steer, -1, 1) : (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const sy = input.pitch != null ? clamp(input.pitch, -1, 1) : (input.up ? 1 : 0) - (input.down ? 1 : 0);
    // Steering: velocity snaps toward the stick target and damps fast when released (no floaty drift).
    s.vx = lerpRate(s.vx, sx * C.STEER_V, sx ? C.STEER_RESP : C.STEER_RESP * 1.3, dt);
    s.x = clamp(s.x + s.vx * dt, -C.SKY_X, C.SKY_X);
    if (Math.abs(s.x) >= C.SKY_X) s.vx = 0;
    s.bank = clamp(s.vx / 14, -1, 1);
    // Pitch -> lift. A roll in progress tilts the lift vector, so tricks cost height (only its vertical share holds you up).
    s.pIn = lerpRate(s.pIn, sy, C.PITCH_RESP, dt);
    let V = s.m, g = s.gam;
    const L = liftAccel(V, s.pIn), Lv = L * Math.cos(s.rot || 0);
    s.gLoad = L / C.G_SKY;
    g += (Lv - C.G_SKY * Math.cos(g)) / Math.max(V, 12) * dt;
    V += (-C.G_SKY * Math.sin(g) - C.DRAG0 - C.DRAG2 * V * V - C.DRAG_I * s.gLoad * s.gLoad) * dt;
    s.gam = clamp(g, C.GAM_MIN, C.GAM_MAX); s.m = clamp(V, 0, C.M_MAX);
    s.boostCd = Math.max(0, s.boostCd - dt); s.boostT = Math.max(0, s.boostT - dt);
    if (input.boostEdge && s.boostCd <= 0) {
      if (s.air > 0) { s.air--; s.m = Math.min(C.M_MAX, s.m + C.BOOST_M); s.gam = Math.min(C.GAM_MAX, s.gam + C.BOOST_POP); s.boostCd = C.BOOST_CD; s.boostT = 0.4; s.counts.boosts++; s.events.push({ e: 'boost' }); }
      else s.events.push({ e: 'empty' });
    }
    if (input.trickEdge) startTrick(s, 'flip', 1);
    else if (input.rollEdge) startTrick(s, 'roll', input.rollDir || (sx < 0 ? -1 : 1));
    if (input.stabEdge) stabilize(s);
    if (s.trick > 0) {
      s.trick -= dt; s.rot = s.trickDir * Math.PI * 2 * (1 - Math.max(0, s.trick) / s.trickDur);
      if (s.trick <= 0) { s.rot = 0; finishTrick(s); }
    }
    s.stabCd = Math.max(0, s.stabCd - dt);
    if (s.stabT > 0) {
      // Thrusters: unwind the spin along a smoothstep (no snap), and pull the flight path to the landing attitude.
      s.stabT = Math.max(0, s.stabT - dt);
      const u = 1 - s.stabT / s.stabDur, e = u * u * (3 - 2 * u);
      s.rot = s.stabRot0 + (s.stabRot1 - s.stabRot0) * e; if (s.stabT <= 0) s.rot = 0;
      s.gam = lerpRate(s.gam, C.STAB_GAM, 3 / s.stabDur, dt); s.pIn = lerpRate(s.pIn, 0, 3 / s.stabDur, dt);
    }
    s.vy = s.m * Math.sin(s.gam);
    if (s.stabT > 0 && s.vy < 0) s.vy *= 1 - C.STAB_SINK; // thrusters push up a little against the sink
    const z0 = s.z; s.z += Math.max(4, s.m * Math.cos(s.gam)) * dt;
    s.y = s.y + s.vy * dt;
    if (s.y >= C.SKY_CEIL) { s.y = C.SKY_CEIL; s.gam = Math.min(0, s.gam); s.vy = Math.min(0, s.vy); }
    s.maxAlt = Math.max(s.maxAlt, s.y);
    if (inWall(s.z, s.y) || (z0 < FAR_RIM() && s.z >= FAR_RIM() && s.y < 0)) { s.events.push({ e: 'crash', what: 'wall' }); end(s, 'short'); return; }
    if (z0 < FAR_RIM() && s.z >= FAR_RIM()) s.events.push({ e: 'rim' });
    while (C.ROAD_LEN + 140 + s.skyChunk * C.SKY_CHUNK < s.z + 520) spawnSkyChunk(s);
    for (const o of s.sky) {
      if (o.hit || o.z < z0 - 4 || o.z > s.z + 4) continue;
      if (Math.abs(o.z - s.z) < o.r + 1) {
        const p = skyObjPos(o, s.t), d = Math.hypot(p.x - s.x, p.y - s.y);
        if (d < o.r + 1.1) { o.hit = true; s.events.push({ e: 'crash', what: o.type }); end(s, 'air'); return; }
        if (!o.near && d < o.r + 4) { o.near = true; s.counts.nearMiss++; addCombo(s, C.NEAR_POT, C.NEAR_MULT); s.events.push({ e: 'near', what: o.type, pot: s.cmb.pot, mult: s.cmb.mult }); }
      }
    }
    for (const g2 of s.rings) {
      if (g2.taken || g2.z <= z0 || g2.z > s.z) continue;
      if (Math.hypot(g2.x - s.x, g2.y - s.y) < C.RING_R) {
        g2.taken = true; s.counts.rings++; s.m = Math.min(C.M_MAX, s.m + C.RING_V); addCombo(s, C.RING_POT, C.RING_MULT);
        s.events.push({ e: 'ring', risky: g2.risky, pot: s.cmb.pot, mult: s.cmb.mult });
      }
    }
    for (const p of s.skyPickups) {
      if (p.taken || p.z < z0 - 3 || p.z > s.z + 3) continue;
      if (Math.hypot(p.x - s.x, p.y - s.y) < 2.6 && Math.abs(p.z - s.z) < 3) {
        p.taken = true;
        if (p.type === 'air') { if (s.air < C.AIR_MAX) s.air++; s.counts.air++; s.pts.pickups += C.AIR_PTS; s.events.push({ e: 'air', risky: !!p.risky }); }
        else { s.counts.orbs++; s.pts.pickups += C.ORB_PTS; s.events.push({ e: 'orb' }); }
      }
    }
    const gy = groundY(s.z);
    if (s.y <= gy) {
      s.y = gy;
      if (gy < 0) { s.events.push({ e: 'splash' }); end(s, 'short'); return; }
      s.landGam = s.gam;
      // Forgiveness: a trick that is nearly round (>= TRICK_AUTO) is finished for you instead of botched.
      if (s.trick > 0 && trickProgress(s) >= C.TRICK_AUTO) { s.rot = 0; s.counts.autoFinish++; finishTrick(s, 'auto'); }
      const why = s.trick > 0 ? 'botched' : s.gam < -C.LAND_MAX_DIVE ? 'nosedive' : null;
      if (why) { s.events.push({ e: 'crash', what: why, lost: Math.round(s.cmb.pot * s.cmb.mult) }); end(s, 'botched'); return; }
      // Clean: pay the combo, the landing bonus, and a bonus for putting it on the far road.
      s.onRoad = Math.abs(s.x) < C.ROAD_HW;
      s.pts.tricks = Math.round(s.cmb.pot * s.cmb.mult);
      s.pts.landing = C.LANDING_BONUS + (s.onRoad ? C.ROAD_BONUS : 0);
      s.events.push({ e: 'land', combo: s.pts.tricks, mult: s.cmb.mult, onRoad: s.onRoad, gam: s.gam });
      end(s, 'landed');
    }
  }

  /* Reference pilot: the ?autopilot preview and the balance tests fly with this. Dodges flagged threats, flies
     rings and risky AIR, manages energy (dive when slow, climb when fast), chains tricks when it is safe, and
     levels out before touching down. Deterministic: reads only sim state. */
  function bot(s) {
    const i = {};
    if (s.phase === 'road') {
      const ahead = s.obstacles.filter(o => o.z > s.z - 2 && o.z < s.z + s.v * 0.75), bad = l => ahead.some(o => o.lane === l);
      const pad = s.pickups.find(p => !p.taken && p.type === 'pad' && p.z > s.z && p.z < s.z + 80);
      let want = s.lane;
      if (bad(s.lane)) want = [-1, 0, 1].filter(l => !bad(l)).sort((a, b) => Math.abs(a - s.lane) - Math.abs(b - s.lane))[0] ?? s.lane;
      else if (pad && !bad(pad.lane)) want = pad.lane;
      if (s.tick % 6 === 0) { if (want < s.lane) i.leftEdge = true; if (want > s.lane) i.rightEdge = true; }
      return i;
    }
    if (s.phase !== 'sky') return i;
    const pastRim = s.z > FAR_RIM(), h = pastRim ? agl(s) : s.y, fwd = Math.max(10, s.m * Math.cos(s.gam)); // over the gap, the far wall is the floor
    const landing = pastRim && s.air === 0 && s.m < 62;
    // Altitude target: cruise high and fast, come down to land when out of energy.
    let ty = landing ? 0 : clamp(20 + (s.m - 60) * 0.9, 25, 120);
    if (!pastRim) ty = Math.max(ty, 22);
    let tx = s.x;
    const tgt = s.rings.concat(s.skyPickups.filter(p => p.type === 'air' && s.air < C.AIR_MAX)).filter(r => !r.taken && r.z > s.z + 10 && (r.z - s.z) / fwd < 2.2)
      .sort((a, b) => a.z - b.z)[0];
    if (tgt && !landing && (pastRim || tgt.y > 12)) { tx = tgt.x; ty = tgt.y; }
    const th = threats(s).filter(t => t.tt < 1.1)[0];
    if (th) { tx = th.x >= s.x ? th.x - th.o.r - 6 : th.x + th.o.r + 6; ty = th.y > s.y ? th.y - th.o.r - 6 : th.y + th.o.r + 6; }
    i.steer = clamp((tx - s.x) * 0.3, -1, 1);
    // Desired path angle from the altitude error, then pitch input to reach it.
    let gDes = clamp((ty - s.y) / (fwd * 1.2), -0.55, 0.45);
    const tImpact = s.vy < 0 ? h / -s.vy : 99;
    if (pastRim && (h < 30 || tImpact < 2.6)) gDes = Math.max(gDes, -0.14); // flare: level out before touchdown
    if (!pastRim && h < 25 + Math.max(0, -s.vy)) gDes = Math.max(gDes, 0.15);
    i.pitch = clamp((gDes - s.gam) * 4 + (gDes > s.gam ? 0.15 : 0), -1, 1);
    if (s.m < 58 && h < 40) i.pitch = Math.max(i.pitch, 0.3);
    // Mach run: launched at top speed with 4+ cans, chain them while the boost cooldown allows.
    const machRun = !s.counts.mach && s.t - s.launchT < 3 && s.air >= 4 && s.launchV >= C.V_MAX - 1;
    if (machRun && s.boostCd <= 0) i.boostEdge = true;
    else if (s.air > 0 && s.boostCd <= 0 && s.tick % 12 === 0 && (s.m < 70 || (!pastRim && s.z > FAR_RIM() - 200 && s.m < 85))) i.boostEdge = true;
    // Final approach: thrusters if we're coming in steep, or a trick won't come round before touchdown.
    if (pastRim && s.vy < 0 && s.stabCd <= 0 && s.stabT <= 0 && tImpact < 1.5 && (s.gam < -C.LAND_MAX_DIVE * 0.7 || (s.trick > 0 && s.trick > tImpact * 0.9))) i.stabEdge = true;
    const quiet = !threats(s).some(t => t.tt < 1.6);
    if (quiet && !landing && h > 30 && s.m > 60 && s.trick <= 0 && s.t - s.lastTrickEnd > 0.6) { if (s.cmb.last === 'flip') { i.rollEdge = true; i.rollDir = s.tick % 2 ? 1 : -1; } else i.trickEdge = true; }
    return i;
  }

  function score(s) {
    const distance = Math.floor(s.z);
    const pastRim = Math.max(0, Math.floor(s.z - C.ROAD_LEN - C.CANYON_W));
    const total = distance + s.pts.pickups + s.pts.tricks + s.pts.landing + s.pts.mach;
    return { total, distance, pastRim, pickups: s.pts.pickups, tricks: s.pts.tricks, landing: s.pts.landing, mach: s.pts.mach, mach05: s.counts.mach, topKmh: Math.round(s.maxV * 3.6),
      launchV: Math.round(s.launchV), maxAlt: Math.round(s.maxAlt), counts: { ...s.counts }, reason: s.reason,
      combo: { pot: s.cmb.pot, mult: s.cmb.mult, n: s.cmb.n }, onRoad: s.onRoad };
  }

  const api = { C, stabilize, trickProgress, speedOf, rampY, rng, newRun, step, score, laneX, obstacleX, skyObjPos, threats, vEstAt, clamp, groundY, agl, liftAccel, bot, LAUNCH_GAM, wallInset, inWall };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CJSim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
