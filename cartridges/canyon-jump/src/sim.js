/* Canyon Jump simulation. Pure and deterministic: fixed 120 Hz step, seeded RNG, no DOM, no clock.
   Units are meters and seconds. x = lateral, y = altitude, z = forward along the highway. */
(function (root) {
  'use strict';
  const BASE = {
    DT: 1 / 120,
    ROAD_LEN: 2300,      // canyon rim (ramp lip) at this z
    CANYON_W: 520,       // far rim at ROAD_LEN + CANYON_W
    CANYON_DEPTH: 160,   // river ~525 ft below the rim (Twin Falls / Snake River)
    RAMP_LEN: 44, RAMP_H: 6, // kicker at the lip
    LANE_W: 3.4,
    V0: 36, ACCEL: 1.25, V_NATURAL: 72, V_MAX: 110,
    PAD_BOOST: 7, PAD_DECAY: 0.6,
    // Coins (orbs) give a tiny permanent speed bump (+1.26 km/h each, road and sky) so clean lines pay off in speed too.
    COIN_V: 0.35, COIN_DECAY: 0.8,
    CLEAR_V: 90,         // launch speed needed to clear the canyon
    AIR_START: 1,        // AIR cans stack without limit (no cap): hoard them for a Mach run or spend them to stabilize
    // Straightaway fairness: hitbox half-widths match the drawn sprites; tumbleweeds sway inside their own lane.
    CAR_HW: 0.8, OBST_HW: { cactus: 0.85, rock: 1.25, tumbleweed: 0.8, cone: 0.4 }, SWAY: 0.45,
    REACT_T: 0.45, SWITCH_T: 0.3, // seconds budgeted to notice a row and to cross one lane
    // Flight: point-mass glider with real gravity. Lift = G·CL·(V/LIFT_REF)² (capped at G_LIMIT g), pitch input sets CL,
    // gravity along the path trades height for speed (dive = faster, climb = slower), drag bleeds energy so every flight ends.
    G: 9.8, G_SKY: 20, LIFT_REF: 70, CL_N: 0.32, CL_UP: 1.55, CL_DN: -0.5, G_LIMIT: 4.2, V_STALL: 44, V_MIN_LIFT: 28,
    DRAG0: 1.6, DRAG2: 0.00028, DRAG_I: 0.6, DIVE_TUCK: 0.5, // stick held forward in a dive tucks the car: up to 50% less parasitic drag (never adds energy, so no climb/dive pump)
    PITCH_RESP: 16, GAM_MIN: -1.25, GAM_MAX: 1.05, M_MAX: 195, // sky speed cap 702 km/h
    STEER_V: 20, STEER_RESP: 10,
    BOOST_M: 24, BOOST_CD: 0.3, BOOST_POP: 0.06,
    // CHAIN: a boost fired within CHAIN_T of the previous one hits CHAIN_STEP harder per link (24 → 34 → 44, capped at
    // CHAIN_MAX links), so a 3-chain inside ~1.8 s gaps is +102 m/s (that's the Mach move) while lone boosts stay ~what they were.
    CHAIN_T: 1.8, CHAIN_STEP: 10, CHAIN_MAX: 2,
    // DIVE BOOST: an AIR boost fired with the nose at least DIVE_BOOST_GAM below the horizon kicks DIVE_BOOST_K× harder (gravity is with you).
    DIVE_BOOST_GAM: -0.3, DIVE_BOOST_K: 1.5,
    // Tricks feed an unbanked combo: pot × multiplier pays out only on a clean landing past the far rim.
    FLIP_T: 0.7, ROLL_T: 1.05, FLIP_PTS: 30, ROLL_PTS: 50, TRICK_CD: 0.2, TRICK_COST: 3,
    // Mid-spin lift dip stays soft (never a nosedive). Front/back flips also nudge flight-path angle a little so they
    // feel different and useful for aiming; left/right rolls kick a lateral impulse so you can dodge while spinning.
    TRICK_DIP: 0.12, FLIP_GAM: 0.18, ROLL_VX: 22, ROLL_COAST: 0.55, ROLL_RAMP: 0.2, TRICK_MIN_AGL: 8, VARIETY: 1.5,
    // ROLL_RAMP: sideways impulse is delivered over the first 0.2 s of the spin (lockstep with rot), so the car
    // doesn't slide then roll — the shove and the barrel start together.
    // Dive recovery: when the nose is clearly down and the stick is pulling up at mid/high speed, pitch snaps
    // faster and lift can briefly exceed G_LIMIT so pull-ups catch a nosedive without changing low-speed stall.
    DIVE_RECOVER_GAM: -0.22, DIVE_RECOVER_V: 70, DIVE_RECOVER_PITCH_K: 1.8, DIVE_RECOVER_G_K: 1.45, DIVE_RECOVER_RATE: 1.15,
    // Near misses: sky band = hitbox + NEAR_BAND m; road band = edge gap < NEAR_ROAD_BAND (kept under the 1.35 m that would
    // flag every rock/tumbleweed in the next lane, so it still means a real shave). MULT_MAX 2.5 keeps distance king.
    MULT_STEP: 0.5, MULT_MAX: 2.5, NEAR_POT: 40, NEAR_BAND: 6, NEAR_ROAD_BAND: 1.3, NEAR_ROAD_PTS: 50, NEAR_MULT: 0.25, RING_POT: 25, RING_MULT: 0.25, RING_V: 8, RING_R: 4.4, RING_PICK: 6, RING_FADE: 0.8, // each ring's speed kick is 80% of the last, so ring chains can't keep a flight alive forever
    CAN_PICK: 4.5,
    // MAGNET: rings and sky pickups within MAGNET_R (x/y) and MAGNET_Z ahead slide toward the car at MAGNET_V m/s, so a modest correction collects them.
    MAGNET_R: 10, MAGNET_Z: 60, MAGNET_V: 9,
    // Gorge wall profile shared by the sim and the 3D walls: [depth below the rim, inset into the gap] (m). Cliff bands,
    // benches and an inner gorge: the canyon narrows as it deepens, from 520 m at the rim to ~432 m at the river.
    WALL: [[0, 0], [4, 0.4], [22, 2], [28, 10], [70, 14], [78, 22], [120, 28], [140, 36], [160, 48]],
    // Landing forgiveness: nose-down up to 32° still sticks, and a trick at least 85% done at touchdown auto-finishes.
    LAND_MAX_DIVE: 0.56, TRICK_AUTO: 0.85, ROAD_BONUS: 150, ROAD_HW: 7,
    // STABILIZE (cold-gas thrusters): unwinds any trick to the nearest full turn, levels the nose to STAB_GAM and trims
    // the sink rate. One AIR can = 0.4 s burn, 1 s cooldown; with no cans it still fires, slower (0.9 s) with a 3 s cooldown.
    // A trick it cancels counts as landed (combo) if at least STAB_CREDIT done, otherwise it's just dropped. The pot is kept.
    STAB_T: 0.4, STAB_CD: 1, STAB_T_FREE: 0.9, STAB_CD_FREE: 3, STAB_GAM: -0.05, STAB_SINK: 0.3, STAB_CREDIT: 0.5,
    ORB_PTS: 50, AIR_PTS: 20, LANDING_BONUS: 500,
    SKY_X: 36, SKY_CHUNK: 80, // ceiling, traffic bands, density and hazard sizes are per level: level.air (src/levels/<id>.js)
    WARN_T: 1.6,
    // Mach 0.5 ≈ 617 km/h. Speed is m/s everywhere: road speed v on the ground, airspeed m in the air.
    // The road tops out at V_MAX (396 km/h), so Mach is earned in the sky: chain AIR boosts and/or trade altitude in a dive.
    MACH05: 617 / 3.6, MACH_BONUS: 1250,
    // Ground and road past the far rim are drawn this far (the 3D road is also a treadmill): ~2x the longest flight we can produce.
    RUNWAY_PAST_RIM: 20000,
  };
  /* make(over, air): a sim bound to one level's geometry. make() with no overrides is the original Snake River sim,
     byte for byte. forLevel(L) builds one from L.sim (+ L.wall) and L.air; the page swaps window.CJSim for it at load. */
  function make(over, levelAir) {
  const C = Object.freeze(Object.assign({}, BASE, over || {}));

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
      const padChance = 0.15 + progress * 0.18;
      if (roll < padChance) { pickups.push({ type: 'pad', lane, z: z + 8, taken: false }); pads++; }
      else if (roll < padChance + 0.24) pickups.push({ type: 'air', lane, z: z + 6, taken: false });
      else for (let k = 0; k < 4; k++) pickups.push({ type: 'orb', lane, z: z - 10 + k * 7, taken: false });
      prevFree = reach; prevZ = z;
      // Gap in seconds at worst-case speed: always enough to react and cross one lane, sometimes two.
      const gapT = C.REACT_T + C.SWITCH_T * (r() < 0.35 ? 2 : 1) + 0.12 + r() * 0.25 - progress * 0.08;
      z += Math.max(46, gapT * vEstAt(z));
    }
    if (pads < 10) for (let i = 0; i < 10 - pads; i++) pickups.push({ type: 'pad', lane: (i % 3) - 1, z: 300 + i * 180, taken: false });
    pickups.push({ type: 'pad', lane: 0, z: C.ROAD_LEN - 70, taken: false });
    pickups.push({ type: 'pad', lane: -1, z: C.ROAD_LEN - 210, taken: false });
    pickups.push({ type: 'pad', lane: 1, z: C.ROAD_LEN - 210, taken: false });
    obstacles.sort((a, b) => a.z - b.z); pickups.sort((a, b) => a.z - b.z);
    return { obstacles, pickups };
  }

  /* Sky settings for a run: the level's air block (defaults to the default level's file). */
  function defaultAir() {
    if (levelAir) return levelAir;
    const L = root.CJLevels || (typeof require === 'function' ? require('./levels.js') : null);
    return L.get(L.DEFAULT).air;
  }
  function newRun(seed, air) {
    seed = seed >>> 0; air = air || defaultAir();
    const road = buildRoad(seed);
    return {
      seed, cfg: air, t: 0, tick: 0, phase: 'road', over: false, reason: null,
      z: 0, x: 0, y: 0, lane: 0, v: C.V0, vBase: C.V0, padBoost: 0, coinBoost: 0, launchV: 0,
      // sky: m = airspeed, gam = flight-path angle (rad, + = climbing), pIn = smoothed pitch input (-1 dive .. +1 climb)
      m: 0, vy: 0, vx: 0, gam: 0, pIn: 0, gLoad: 1, air: C.AIR_START, rot: 0, trick: 0, trickKind: null, trickDir: 1, trickDur: 0, lastTrickEnd: -9, stabT: 0, stabDur: 0, stabCd: 0, stabRot0: 0, stabRot1: 0,
      cmb: { pot: 0, mult: 1, n: 0, last: null }, bank: 0, boostCd: 0, chain: 0, lastBoostT: -9, boostT: 0, rollCoast: 0, rollKick: 0, rollKickGiven: 0, launchT: 0,
      obstacles: road.obstacles, pickups: road.pickups,
      sky: [], skyPickups: [], rings: [], skyChunk: 0, drafts: [],
      pts: { pickups: 0, tricks: 0, landing: 0, mach: 0 },
      counts: { orbs: 0, air: 0, pads: 0, tricks: 0, flips: 0, rolls: 0, rings: 0, boosts: 0, nearMiss: 0, mach: 0, bestMult: 1, stabs: 0, autoFinish: 0, diveBoosts: 0 }, maxV: 0,
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
    s.coinBoost = Math.max(0, s.coinBoost - C.COIN_DECAY * dt);
    s.v = Math.min(C.V_MAX, s.vBase + s.padBoost + s.coinBoost);
    const z0 = s.z; s.z += s.v * dt;
    s.y = rampY(s.z);
    for (const o of s.obstacles) {
      if (o.z > s.z + 3) break;
      if (o.hit || o.z < z0 - 3) continue;
      if (Math.abs(o.z - s.z) < 1.9) {
        const gap = Math.abs(obstacleX(o, s.t) - s.x);
        if (gap < C.OBST_HW[o.type] + C.CAR_HW) { o.hit = true; s.events.push({ e: 'crash', what: o.type }); end(s, 'road'); return; }
        if (!o.near && gap < C.OBST_HW[o.type] + C.CAR_HW + C.NEAR_ROAD_BAND) { o.near = true; s.counts.nearMiss++; s.pts.pickups += C.NEAR_ROAD_PTS; s.events.push({ e: 'near' }); }
      }
    }
    for (const p of s.pickups) {
      if (p.z > s.z + 2) break;
      if (p.taken || p.z < z0 - 2.5) continue;
      if (Math.abs(laneX(p.lane) - s.x) < 1.7) {
        p.taken = true;
        if (p.type === 'pad') { s.padBoost += C.PAD_BOOST; s.counts.pads++; s.events.push({ e: 'pad' }); }
        else if (p.type === 'air') { s.air++; s.counts.air++; s.pts.pickups += C.AIR_PTS; s.events.push({ e: 'air', n: s.air }); }
        else { s.counts.orbs++; s.coinBoost += C.COIN_V; s.pts.pickups += C.ORB_PTS; s.events.push({ e: 'orb' }); }
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

  function bandType(s, y) { const B = s.cfg.bands; for (const b of B) if (y < b.top) return b.type; return B[B.length - 1].type; }
  /* Altitude zone name for the HUD: the main band at y, or SATELLITES above the satellite floor. */
  function zoneAt(s, y) { return y >= s.cfg.satellite.minY ? 'satellite' : bandType(s, y); }
  // Worst-case vertical drift of each type's motion (see skyObjPos): rewards on a risky line are offset vertically,
  // so horizontal sway can only move a hazard further from them.
  const SWAY = { bird: 0.8, plane: 0, satellite: 0 }; const swayY = o => o.dy != null ? o.dy : SWAY[o.type] || 0;
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
    const A = s.cfg, D = A.density, ceil = A.ceil, mainTop = A.bands[A.bands.length - 1].top;
    const density = Math.min(D.max, D.base + Math.floor(i / D.rampChunks) + (r() < D.extraP ? 1 : 0));
    const placed = [];
    for (let k = 0; k < density * 3 && placed.length < density; k++) {
      const y = clamp(s.y + (r() - 0.45) * 60, yMin, mainTop - 6), type = bandType(s, y), rad = A[type].r;
      const o = { type, z: z0 + r() * C.SKY_CHUNK, x: (r() * 2 - 1) * C.SKY_X * 0.85, y, phase: r() * 6.28, r: rad, hit: false, near: false };
      if (type === 'balloon') { o.dx = A.balloon.driftX; o.dy = A.balloon.driftY; o.rate = A.balloon.rate; o.hue = Math.floor(r() * 4); }
      else if (type === 'heli' || type === 'condor') { const T = A[type]; o.dx = o.sx = T.dx; o.dy = T.dy; o.rate = T.rate * (0.8 + r() * 0.4); o.hue = Math.floor(r() * 4); }
      const near = placed.concat(s.sky.slice(-6));
      if (near.some(p => Math.abs(p.z - o.z) < 25 && Math.hypot(p.x - o.x, p.y - o.y) < p.r + o.r + 9)) continue;
      placed.push(o);
    }
    // Satellites: rare, and only up near the ceiling (an opt-in risk for climbers).
    if (r() < A.satellite.chance) {
      const o = { type: 'satellite', z: z0 + r() * C.SKY_CHUNK, x: (r() * 2 - 1) * C.SKY_X * 0.85, y: A.satellite.minY + r() * Math.max(0, ceil - 8 - A.satellite.minY), phase: r() * 6.28, r: A.satellite.r, hit: false, near: false };
      if (!placed.concat(s.sky.slice(-6)).some(p => Math.abs(p.z - o.z) < 25 && Math.hypot(p.x - o.x, p.y - o.y) < p.r + o.r + 9)) placed.push(o);
    }
    s.sky.push(...placed);
    const all = placed.concat(s.sky.slice(-9));
    // A reward is legal if it never overlaps any hazard's hitbox wherever that hazard sways.
    const clearOf = (x, y, z, rad) => all.every(o => Math.abs(o.z - z) > 12 || Math.hypot(o.x - x, o.y - y) - 4.5 > o.r + 1.1 + rad + swayY(o) + (o.sx || 0));
    for (const o of placed) {
      const roll = r(), side = r() < 0.5 ? 1 : -1;
      if (roll < 0.45) { // boost ring above/below the hazard
        const d = o.r + C.RING_R + RING_GAP + swayY(o), ry = clamp(o.y + side * d, yMin, s.cfg.ceil - 6);
        if (Math.abs(ry - o.y) >= d - 1e-9) s.rings.push({ x: o.x, y: ry, z: o.z, taken: false, risky: true, host: o.type, phase: o.phase });
      } else if (roll < 0.75) { // AIR can tucked against it
        const d = o.r + CAN_GAP + swayY(o), cy = clamp(o.y + side * d, yMin, s.cfg.ceil - 5);
        if (Math.abs(cy - o.y) >= d - 1e-9) s.skyPickups.push({ type: 'air', x: o.x, y: cy, z: o.z, taken: false, risky: true, phase: o.phase });
      }
    }
    if (r() < 0.32) { // dive gate: three rings stepping down
      const gx = (r() * 2 - 1) * C.SKY_X * 0.6, gz = z0 + r() * C.SKY_CHUNK * 0.5;
      for (let k = 0; k < 3; k++) {
        const ring = { x: gx, y: clamp(s.y - 6 - k * 7, yMin + 4, s.cfg.ceil - 6), z: gz + k * 30, taken: false, risky: false, gate: k };
        if (clearOf(ring.x, ring.y, ring.z, C.RING_R)) s.rings.push(ring);
      }
    }
    if (r() < 0.5) {
      const p = { type: r() < 0.3 ? 'air' : 'orb', z: z0 + r() * C.SKY_CHUNK, x: (r() * 2 - 1) * 18, y: clamp(s.y + (r() - 0.3) * 30, yMin, s.cfg.ceil - 5), taken: false };
      if (clearOf(p.x, p.y, p.z, 2.6)) s.skyPickups.push(p);
    }
    // Optional high-band rewards (level air.high). Own RNG stream so the main chunk draws above stay identical.
    // Only when already flying high, so it rewards the float without luring low Mach dives upward.
    if (A.high && s.y >= A.high.minY - (A.high.reach || 50)) {
      const H = A.high, h = rng((s.seed + 0x9e3779 + i * 104729) >>> 0), hy = () => H.minY + h() * Math.max(0, ceil - 8 - H.minY);
      if (h() < H.ringLine) { // gentle line of 3 rings, drifting a few meters, easy to thread with the magnet
        const gx = (h() * 2 - 1) * C.SKY_X * 0.5, gz = z0 + h() * C.SKY_CHUNK * 0.5, y0 = hy(), dy = (h() - 0.5) * 8;
        for (let k = 0; k < 3; k++) {
          const ring = { x: gx, y: clamp(y0 + k * dy, H.minY, ceil - 6), z: gz + k * 28, taken: false, risky: false, high: true };
          if (clearOf(ring.x, ring.y, ring.z, C.RING_R)) s.rings.push(ring);
        }
      }
      if (h() < H.can) { const p = { type: 'air', z: z0 + h() * C.SKY_CHUNK, x: (h() * 2 - 1) * 16, y: hy(), taken: false, high: true }; if (clearOf(p.x, p.y, p.z, 2.6)) s.skyPickups.push(p); }
      if (h() < H.orb) { const p = { type: 'orb', z: z0 + h() * C.SKY_CHUNK, x: (h() * 2 - 1) * 16, y: hy(), taken: false, high: true }; if (clearOf(p.x, p.y, p.z, 2.6)) s.skyPickups.push(p); }
    }
    // Updraft columns (level air.updraft): thermals rising off the canyon floor and the far rim. Own RNG stream.
    // Condors ride them: some columns carry a circling condor, so the free lift has a price.
    if (A.updraft) {
      const U = A.updraft, u = rng((s.seed + 0x7f4a7c15 + i * 15485863) >>> 0), zc = z0 + u() * C.SKY_CHUNK;
      if (zc < FAR_RIM() + U.pastRim && u() < U.chance) {
        const d = { x: (u() * 2 - 1) * C.SKY_X * 0.7, z: zc, r: U.r * (0.85 + u() * 0.3), w: U.w * (0.85 + u() * 0.3), top: U.top * (0.75 + u() * 0.25), bottom: groundY(zc), gain: 0 };
        s.drafts.push(d);
        if (A.condor && u() < U.condorP) {
          const T = A.condor, oy = clamp(s.y + (u() - 0.4) * 40, d.bottom + 20, d.top - 12);
          const o = { type: 'condor', z: d.z + (u() - 0.5) * d.r, x: d.x, y: oy, phase: u() * 6.28, r: T.r, hit: false, near: false, dx: d.r * 0.55, sx: d.r * 0.55, dy: T.dy, rate: T.rate, hue: 0, draft: true };
          s.sky.push(o);
        }
      }
    }
    // Inside-the-gorge route (level air.gorge): ring lines and AIR cans below the rim, and strong gorge thermals that are
    // the way back out. Own RNG stream; only over the gap.
    if (A.gorge && overGap) {
      const Gz = A.gorge, g = rng((s.seed + 0x2545f491 + i * 32452843) >>> 0);
      const lo = -C.CANYON_DEPTH * Gz.depth, hi = -12;
      if (g() < Gz.ringLine) {
        const gx = (g() * 2 - 1) * C.SKY_X * 0.5, gz = z0 + g() * C.SKY_CHUNK * 0.4, y0 = lo + g() * (hi - lo);
        for (let k = 0; k < 4; k++) { const ring = { x: gx + (k - 1.5) * 2, y: y0, z: gz + k * 26, taken: false, risky: false, gorge: true }; if (clearOf(ring.x, ring.y, ring.z, C.RING_R)) s.rings.push(ring); }
      }
      if (g() < Gz.can) { const p = { type: 'air', z: z0 + g() * C.SKY_CHUNK, x: (g() * 2 - 1) * 14, y: lo + g() * (hi - lo), taken: false, gorge: true }; if (clearOf(p.x, p.y, p.z, 2.6)) s.skyPickups.push(p); }
      if (g() < Gz.thermal) {
        const zc = z0 + g() * C.SKY_CHUNK;
        s.drafts.push({ x: (g() * 2 - 1) * C.SKY_X * 0.6, z: zc, r: Gz.r, w: Gz.w, top: Gz.top, bottom: -C.CANYON_DEPTH, gain: 0, max: Gz.maxGain, gorge: true });
      }
    }
  }
  /* Vertical air speed (m/s) of any updraft column at (x, y, z): strongest at the core, fading to the edge and near the top. */
  function updraftAt(s, x, y, z) {
    let w = 0; if (!s.drafts) return 0;
    for (const d of s.drafts) {
      if (Math.abs(z - d.z) > d.r || y > d.top || d.gain >= (d.max || s.cfg.updraft.maxGain)) continue;
      const q = Math.hypot(x - d.x, z - d.z) / d.r; if (q >= 1) continue;
      w = Math.max(w, d.w * (1 - q * q) * Math.min(1, (d.top - y) / 30));
    }
    return w;
  }
  // Motion is small and bounded so what you see 5 s out is where it will be.
  // Tour helicopters sweep slowly across the gap (dx up to ~16 m); condors circle (inside a thermal when they ride one).
  function skyObjPos(o, t) {
    if (o.type === 'heli') return { x: o.x + Math.sin(t * o.rate + o.phase) * o.dx, y: o.y + Math.sin(t * 0.9 + o.phase) * o.dy };
    if (o.type === 'condor') return { x: o.x + Math.cos(t * o.rate + o.phase) * o.dx, y: o.y + Math.sin(t * o.rate * 0.5 + o.phase) * o.dy };
    if (o.type === 'balloon') return { x: o.x + Math.sin(t * o.rate + o.phase) * o.dx, y: o.y + Math.sin(t * o.rate * 1.7 + o.phase * 2) * o.dy };
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
  function liftAccel(V, pIn, gLim) {
    const lim = gLim == null ? C.G_LIMIT : gLim;
    const CL = pIn >= 0 ? C.CL_N + (C.CL_UP - C.CL_N) * pIn : C.CL_N + (C.CL_DN - C.CL_N) * -pIn;
    const stallK = clamp((V - C.V_MIN_LIFT) / (C.V_STALL - C.V_MIN_LIFT), 0, 1);
    return clamp(C.G_SKY * CL * (V / C.LIFT_REF) * (V / C.LIFT_REF) * stallK, -lim * C.G_SKY, lim * C.G_SKY);
  }
  function addCombo(s, pot, mult) { s.cmb.pot += pot; s.cmb.mult = Math.min(C.MULT_MAX, s.cmb.mult + mult); if (s.cmb.mult > s.counts.bestMult) s.counts.bestMult = s.cmb.mult; }
  /* kind 'flip'|'roll'; dir: flip +1 = front (nose down), -1 = back (nose up); roll +1 = right, -1 = left. */
  function startTrick(s, kind, dir) {
    if (s.trick > 0 || s.stabT > 0 || s.t - s.lastTrickEnd < C.TRICK_CD || agl(s) <= C.TRICK_MIN_AGL) return false;
    const d = dir || 1;
    s.trickKind = kind; s.trickDir = d; s.trickDur = kind === 'roll' ? C.ROLL_T : C.FLIP_T; s.trick = s.trickDur;
    s.m = Math.max(0, s.m - C.TRICK_COST);
    if (kind === 'roll') {
      // Don't dump VX this frame — deliver it across ROLL_RAMP in lockstep with rot (see deliverRollKick).
      s.rollKick = d * C.ROLL_VX; s.rollKickGiven = 0; s.rollCoast = C.ROLL_COAST + C.ROLL_RAMP;
      s.rot = d * 1e-4; // same-frame visual kick so the first rendered frame already shows spin starting
    } else s.gam = clamp(s.gam - d * C.FLIP_GAM, C.GAM_MIN, C.GAM_MAX); // front (+1) noses down; back (-1) noses up
    s.events.push({ e: 'trick', kind, dir: d }); return true;
  }
  /* Deliver the roll's sideways shove in proportion to how far the barrel has spun through ROLL_RAMP. */
  function deliverRollKick(s) {
    if (!s.rollKick) return;
    const spinning = s.trick > 0 && s.trickKind === 'roll';
    const elapsed = spinning ? (s.trickDur - s.trick) : C.ROLL_RAMP;
    const u = clamp(elapsed / C.ROLL_RAMP, 0, 1);
    const want = s.rollKick * u, add = want - s.rollKickGiven;
    if (add) { s.vx = clamp(s.vx + add, -C.STEER_V * 2.2, C.STEER_V * 2.2); s.rollKickGiven = want; }
    if (u >= 1) s.rollKick = 0;
  }

  const trickProgress = s => s.trick > 0 ? 1 - s.trick / s.trickDur : 0;
  /* Bank a completed trick into the combo. via: undefined (spun all the way), 'stab' (thrusters, >= half done), 'auto' (touchdown). */
  function finishTrick(s, via) {
    s.trick = 0; s.counts.tricks++; s.counts[s.trickKind === 'roll' ? 'rolls' : 'flips']++;
    const base = s.trickKind === 'roll' ? C.ROLL_PTS : C.FLIP_PTS, varied = s.cmb.last && s.cmb.last !== s.trickKind;
    const pts = Math.round(base * (varied ? C.VARIETY : 1));
    s.cmb.n++; s.cmb.last = s.trickKind; addCombo(s, pts, s.cmb.n > 1 ? C.MULT_STEP : 0);
    s.lastTrickEnd = s.t; s.events.push({ e: 'landed_trick', kind: s.trickKind, dir: s.trickDir, pts, varied, n: s.cmb.n, mult: s.cmb.mult, pot: s.cmb.pot, via });
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

  function magnet(s, list, dt) {
    for (const p of list) {
      if (p.taken || p.risky || p.z < s.z || p.z > s.z + C.MAGNET_Z) continue;
      const dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy); if (d > C.MAGNET_R || d < 1e-6) continue;
      const k = Math.min(d, C.MAGNET_V * dt) / d, nx = p.x + dx * k, ny = p.y + dy * k;
      // Never drag a reward toward a hazard: stop if the new spot would sit inside any nearby hazard's clearance.
      if (s.sky.some(o => Math.abs(o.z - p.z) < 12 && Math.hypot(o.x - nx, o.y - ny) < o.r + 1.1 + C.RING_R + 4.5 + swayY(o) + (o.sx || 0) + 4)) continue;
      p.x = nx; p.y = ny;
    }
  }
  function skyStep(s, input, dt) {
    const sx = input.steer != null ? clamp(input.steer, -1, 1) : (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const sy = input.pitch != null ? clamp(input.pitch, -1, 1) : (input.up ? 1 : 0) - (input.down ? 1 : 0);
    // Steering: snaps to the stick, except during a short post-roll coast so the sideways kick actually travels.
    s.rollCoast = Math.max(0, (s.rollCoast || 0) - dt);
    const ramping = s.rollKick && Math.abs(s.rollKickGiven) < Math.abs(s.rollKick) * 0.999;
    if (ramping) {
      // While the shove is still coupling into the spin, only allow the stick to add — don't damp the kick away.
      const stickVx = sx * C.STEER_V;
      if (sx && Math.sign(stickVx) === Math.sign(s.rollKick || 1) && Math.abs(stickVx) > Math.abs(s.vx)) s.vx = lerpRate(s.vx, stickVx, C.STEER_RESP, dt);
    } else if (s.rollCoast > 0) {
      const stickVx = sx * C.STEER_V;
      if (sx && Math.sign(stickVx) === Math.sign(s.vx || 1) && Math.abs(stickVx) > Math.abs(s.vx)) s.vx = lerpRate(s.vx, stickVx, C.STEER_RESP, dt);
      else s.vx *= Math.exp(-0.55 * dt); // slow bleed, not an instant kill
    } else {
      s.vx = lerpRate(s.vx, sx * C.STEER_V, sx ? C.STEER_RESP : C.STEER_RESP * 1.3, dt);
    }
    // Crosswind (level air.gust): a slow, deterministic sideways push over the deepest part of the gap.
    const G = s.cfg.gust; if (G && s.z > C.ROAD_LEN + C.CANYON_W * G.from && s.z < C.ROAD_LEN + C.CANYON_W * G.to) s.x += G.vx * Math.sin(s.t * G.rate + (s.seed % 7)) * dt;
    s.x = clamp(s.x + s.vx * dt, -C.SKY_X, C.SKY_X);
    if (Math.abs(s.x) >= C.SKY_X) s.vx = 0;
    s.bank = clamp(s.vx / 14, -1, 1);
    // Pitch -> lift. Dive recovery: nose-down + stick up at mid/high speed gets faster pitch and a higher g cap.
    let V = s.m, g = s.gam;
    // Level recover block (Grand Canyon): pull-up authority from a lower speed, and a cap on how fast the nose can fall
    // when you are not pushing it down. Absent on Snake River, so the base sim is unchanged.
    const RC = s.cfg.recover;
    // Assist strength 0..1. Base sim: on/off. Level recover block: latched on/off (v4), or with RC.blend a smooth ramp
    // from 0 at `until` to 1 at `engage` (no latch, no bang-bang: the v4 latch made a 2 Hz nose sawtooth in long glides).
    let ak;
    if (RC && RC.blend) {
      const u = Math.max(0, Math.min(1, (RC.until - g) / (RC.until - RC.engage)));
      ak = sy > 0.15 && V >= RC.v ? u * u * (3 - 2 * u) : 0;
    } else if (RC) {
      if (s.rcv) s.rcv = g <= RC.until; else s.rcv = RC.engage == null ? g <= RC.until : g <= RC.engage;
      ak = s.rcv && sy > 0.15 && V >= RC.v ? 1 : 0;
    } else ak = g <= C.DIVE_RECOVER_GAM && sy > 0.15 && V >= C.DIVE_RECOVER_V ? 1 : 0;
    const recovering = ak > 0;
    s.pIn = lerpRate(s.pIn, sy, ak === 1 ? C.PITCH_RESP * C.DIVE_RECOVER_PITCH_K : ak === 0 ? C.PITCH_RESP : C.PITCH_RESP * (1 + ak * (C.DIVE_RECOVER_PITCH_K - 1)), dt);
    const L = liftAccel(V, s.pIn, ak === 1 ? C.G_LIMIT * C.DIVE_RECOVER_G_K : ak === 0 ? C.G_LIMIT : C.G_LIMIT * (1 + ak * (C.DIVE_RECOVER_G_K - 1))), Lv = L * (1 - C.TRICK_DIP * (1 - Math.cos(s.rot || 0)) / 2);
    s.gLoad = L / C.G_SKY;
    g += (Lv - C.G_SKY * Math.cos(g)) / Math.max(V, 12) * dt;
    // Extra flight-path authority while recovering: high-speed nosedives otherwise turn too slowly (÷V).
    if (recovering) g += sy * (RC ? RC.rate : C.DIVE_RECOVER_RATE) * (ak === 1 ? 1 : ak) * dt;
    if (RC && sy >= 0 && g < s.gam) g = Math.max(g, s.gam - RC.maxDrop * dt);
    // Committed dive (stick forward, nose below the horizon): the car tucks and parasitic drag drops, so a dive banks real speed.
    const tuck = s.pIn < 0 && g < 0 ? -s.pIn * C.DIVE_TUCK : 0;
    V += (-C.G_SKY * Math.sin(g) - (C.DRAG0 + C.DRAG2 * V * V) * (1 - tuck) - C.DRAG_I * s.gLoad * s.gLoad) * dt;
    const TH = s.cfg.thin; if (TH && s.y > TH.y && V > TH.vFloor) V = Math.max(TH.vFloor, V - TH.k * Math.min(1, (s.y - TH.y) / TH.span) * dt); // never drains you below vFloor (that was the nose-dive trap) // thin air up high (level 2+): floating high bleeds speed
    s.gam = clamp(g, C.GAM_MIN, C.GAM_MAX); s.m = clamp(V, 0, C.M_MAX);
    s.boostCd = Math.max(0, s.boostCd - dt); s.boostT = Math.max(0, s.boostT - dt);
    if (input.boostEdge && s.boostCd <= 0) {
      if (s.air > 0) { const dive = s.gam <= C.DIVE_BOOST_GAM; s.chain = s.t - s.lastBoostT <= C.CHAIN_T ? Math.min(C.CHAIN_MAX, s.chain + 1) : 0; s.lastBoostT = s.t;
        s.air--; s.m = Math.min(C.M_MAX, s.m + (C.BOOST_M + C.CHAIN_STEP * s.chain) * (dive ? C.DIVE_BOOST_K : 1)); if (!dive) s.gam = Math.min(C.GAM_MAX, s.gam + C.BOOST_POP);
        s.boostCd = C.BOOST_CD; s.boostT = 0.4; s.counts.boosts++; if (dive) s.counts.diveBoosts++; s.events.push({ e: 'boost', dive, chain: s.chain, n: s.air }); }
      else s.events.push({ e: 'empty' });
    }
    if (input.rollLeftEdge) startTrick(s, 'roll', -1);
    else if (input.rollRightEdge) startTrick(s, 'roll', 1);
    else if (input.flipFrontEdge) startTrick(s, 'flip', 1);
    else if (input.flipBackEdge) startTrick(s, 'flip', -1);
    else if (input.trickEdge) startTrick(s, 'flip', input.flipDir || 1);
    else if (input.rollEdge) startTrick(s, 'roll', input.rollDir || (sx < 0 ? -1 : 1));
    if (input.stabEdge) stabilize(s);
    if (s.trick > 0) {
      s.trick -= dt; s.rot = s.trickDir * Math.PI * 2 * (1 - Math.max(0, s.trick) / s.trickDur);
      if (s.trick <= 0) { s.rot = 0; finishTrick(s); }
    }
    deliverRollKick(s);
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
    // Updrafts lift the car with the rising air (altitude only, no airspeed), capped per column by air.updraft.maxGain.
    if (s.drafts.length) {
      const w = updraftAt(s, s.x, s.y, s.z);
      if (w > 0) {
        const d = s.drafts.find(d => Math.abs(s.z - d.z) <= d.r && Math.hypot(s.x - d.x, s.z - d.z) < d.r), dy = Math.min(w * dt, (d.max || s.cfg.updraft.maxGain) - d.gain);
        d.gain += dy; s.y += dy; if (!d.rode) { d.rode = true; s.counts.drafts = (s.counts.drafts || 0) + 1; s.events.push({ e: 'updraft' }); }
      }
    }
    if (s.y >= s.cfg.ceil) { s.y = s.cfg.ceil; s.gam = Math.min(0, s.gam); s.vy = Math.min(0, s.vy); }
    s.maxAlt = Math.max(s.maxAlt, s.y);
    // Lip grace (level air.lipGrace): clipping the far wall within a few metres of the lip scrapes you up onto the rim
    // (speed and nose-down penalty) instead of ending the run. Base sim: no grace.
    const LG = s.cfg.lipGrace;
    if (LG && s.y < 0 && s.y > -LG.depth && s.z > FAR_RIM() - LG.reach && (inWall(s.z, s.y) || (z0 < FAR_RIM() && s.z >= FAR_RIM()))) {
      s.y = 0.4; s.z = Math.max(s.z, FAR_RIM() + 0.5); s.gam = Math.max(s.gam, 0.04); s.m *= LG.keep; s.counts.lipSaves = (s.counts.lipSaves || 0) + 1; s.events.push({ e: 'lip' });
    }
    if (inWall(s.z, s.y) || (z0 < FAR_RIM() && s.z >= FAR_RIM() && s.y < 0)) { s.events.push({ e: 'crash', what: 'wall' }); end(s, 'short'); return; }
    if (z0 < FAR_RIM() && s.z >= FAR_RIM()) s.events.push({ e: 'rim' });
    while (C.ROAD_LEN + 140 + s.skyChunk * C.SKY_CHUNK < s.z + 520) spawnSkyChunk(s);
    for (const o of s.sky) {
      if (o.hit || o.z < z0 - 4 || o.z > s.z + 4) continue;
      if (Math.abs(o.z - s.z) < o.r + 1) {
        const p = skyObjPos(o, s.t), d = Math.hypot(p.x - s.x, p.y - s.y);
        if (d < o.r + 1.1) { o.hit = true; s.events.push({ e: 'crash', what: o.type }); end(s, 'air'); return; }
        if (!o.near && d < o.r + C.NEAR_BAND) { o.near = true; s.counts.nearMiss++; addCombo(s, C.NEAR_POT, C.NEAR_MULT); s.events.push({ e: 'near', what: o.type, pot: s.cmb.pot, mult: s.cmb.mult }); }
      }
    }
    magnet(s, s.rings, dt); magnet(s, s.skyPickups, dt);
    for (const g2 of s.rings) {
      if (g2.taken || g2.z <= z0 || g2.z > s.z) continue;
      if (Math.hypot(g2.x - s.x, g2.y - s.y) < C.RING_PICK) {
        g2.taken = true; s.counts.rings++; s.m = Math.min(C.M_MAX, s.m + C.RING_V * Math.pow(C.RING_FADE, s.counts.rings - 1)); if (!g2.high) addCombo(s, C.RING_POT, C.RING_MULT); // high-band rings: speed only, no combo, so the float can't farm tricks
        s.events.push({ e: 'ring', risky: g2.risky, pot: s.cmb.pot, mult: s.cmb.mult });
      }
    }
    for (const p of s.skyPickups) {
      if (p.taken || p.z < z0 - 3 || p.z > s.z + 3) continue;
      if (Math.hypot(p.x - s.x, p.y - s.y) < C.CAN_PICK && Math.abs(p.z - s.z) < 3) {
        p.taken = true;
        if (p.type === 'air') { s.air++; s.counts.air++; s.pts.pickups += C.AIR_PTS; s.events.push({ e: 'air', risky: !!p.risky, n: s.air }); }
        else { s.counts.orbs++; s.m = Math.min(C.M_MAX, s.m + C.COIN_V); s.pts.pickups += C.ORB_PTS; s.events.push({ e: 'orb' }); }
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
  const GOOD_LAUNCH = 100; // m/s (360 km/h): fast enough that a quick 3-boost chain can reach Mach 0.5
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
    const tgt = s.rings.concat(s.skyPickups.filter(p => p.type === 'air')).filter(r => !r.taken && r.z > s.z + 10 && (r.z - s.z) / fwd < 2.2)
      .sort((a, b) => a.z - b.z)[0];
    if (tgt && !landing && (pastRim || tgt.y > 12 || (s.cfg.gorge && tgt.gorge && s.m > 70))) { tx = tgt.x; ty = tgt.y; }
    if (s.cfg.gorge && !pastRim && s.y < 0) { const th2 = s.drafts.find(d => d.gorge && d.z > s.z && d.z - s.z < fwd * 3 && d.gain < d.max); if (th2) { tx = th2.x; ty = Math.max(ty, s.y); } }
    const th = threats(s).filter(t => t.tt < 1.1)[0];
    if (th) { tx = th.x >= s.x ? th.x - th.o.r - 6 : th.x + th.o.r + 6; ty = th.y > s.y ? th.y - th.o.r - 6 : th.y + th.o.r + 6; }
    i.steer = clamp((tx - s.x) * 0.3, -1, 1);
    // Desired path angle from the altitude error, then pitch input to reach it.
    let gDes = clamp((ty - s.y) / (fwd * 1.2), -0.55, 0.45);
    const tImpact = s.vy < 0 ? h / -s.vy : 99;
    if (pastRim && (h < 30 || tImpact < 2.6)) gDes = Math.max(gDes, -0.14); // flare: level out before touchdown
    if (!pastRim && (s.cfg.gorge ? s.y - groundY(s.z) : h) < 25 + Math.max(0, -s.vy)) gDes = Math.max(gDes, 0.15);
    i.pitch = clamp((gDes - s.gam) * 4 + (gDes > s.gam ? 0.15 : 0), -1, 1);
    if (s.m < 58 && h < 40) i.pitch = Math.max(i.pitch, 0.3);
    // Mach run: off a top-speed launch with 3+ cans, chain three boosts while the cooldown allows (commit once started).
    const machRun = !s.counts.mach && s.t - s.launchT < 3 && s.air > 0 && s.counts.boosts < 3 && s.air + s.counts.boosts >= 3 && s.launchV >= GOOD_LAUNCH;
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

  const api = { C, make, forLevel, updraftAt, bandType, zoneAt, defaultAir, stabilize, trickProgress, speedOf, rampY, rng, newRun, step, score, laneX, obstacleX, skyObjPos, threats, vEstAt, clamp, groundY, agl, liftAccel, bot, LAUNCH_GAM, wallInset, inWall };
  return api;
  }
  /* A sim for a level object: its sim block (+ optional wall profile) over the base constants, and its air block. */
  function forLevel(L) {
    if (!L) return make();
    const over = Object.assign({}, L.sim); if (L.wall) over.WALL = L.wall;
    return make(over, L.air);
  }
  const api = make();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CJSim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
