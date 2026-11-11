/* Powderline 1.1.0 — deterministic downhill sim. No DOM, no Math.random.
   Ruleset powderline-v2. Fixed 60 Hz. Same seed + same per-tick input = same integers.

   Score = distance (floor meters) + trick points. Combo multiplier is an integer 1..8.
   Landing yaw is measured to the nearest half turn, so a 540 can land switch.
   Clean is within 0.08, OK within 0.20, otherwise Sketchy.
   A trick scores when its timer finishes in the air. Landing while a grab is still
   running pays half and drops the combo. Landing while a flip is unfinished bails.
   A crooked finished trick pays nothing and drops the combo.
   The boost meter does not refill by itself. Clean tricks, gates, rails, and a near-miss under 4 m put it back.
   Avalanche speed grows with distance. The avalanche catching you ends the run.
   Tie-break (server): higher score, then longer distance, then fewer crashes, then acceptance time, then run id.
   Free Play must not call this with an external seed. resolveRunSeed ignores issued seeds unless mode is ranked or raid.
*/
(function (root) {
  'use strict';
  const C = Object.freeze({
    HZ: 60,
    DT: 1 / 60,
    CHUNK: 48,
    HALF: 6.35,
    WALL: 7.55,
    GRAV: 20,
    CRUISE: 24.2,
    MAX_V: 33.2,
    BOOST_V: 37.6,
    STEER_V: 9,
    STEER_A: 4,
    STEER_HOLD: 0.35,
    STEER_MIN: 0.35,
    KICK_LEN: 6.2,
    GAP0: 17.5,
    AVA_BASE: 20.4,
    AVA_RAMP: 0.0135,
    AVA_CATCH: 0.85,
    GAP_SAFE: 33,
    GAP_MAX: 40,
    BOOST_A: 15.5,
    BOOST_PULL: 7.2,
    BOOST_DRAIN: 32,
    BOOST_MIN: 12,
    BOOST_GAIN: 20,
    LAUNCH_Y: 1.22,
    LAUNCH_VY: 11.4,
    TRICK_MIN_Y: 1.55,
    BAIL_AT: 0.85,
    CHAIN_AT: 0.72,
    MAX_CHAIN: 3,
    MAX_COMBO: 8,
    CRASH_SPEED: 0.6,
    BAIL_SPEED: 0.76,
    CRASH_GAP: 3.8,
    BAIL_GAP: 1.8,
    IFRAME: 0.42,
    MAX_TICKS: 60 * 150,
    SLOW: 0.45,
    SLOW_MAX: 0.6,
    SLOW_HANG: 1.2,
  });
  const RULES_VERSION = '1.1.0';
  const RULESET = 'powderline-v2';
  const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const LANES = [-4.15, 0, 4.15];
  const TRICKS = [
    null,
    { id: 'indy', name: 'Indy', dur: 0.35, pts: 22, kind: 'grab' },
    { id: 'backflip', name: 'Backflip', dur: 0.85, pts: 48, kind: 'flip', flip: 1 },
    { id: 'spin', name: '360', dur: 0.55, pts: 32, kind: 'spin', dir: 1, spins: 1 },
    { id: 'spin', name: '360', dur: 0.55, pts: 32, kind: 'spin', dir: -1, spins: 1 },
    { id: 'method', name: 'Method', dur: 0.3, pts: 18, kind: 'grab' },
  ];
  const SPIN_NAME = ['360', '540', '720', '1080'];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function issuedSeed(value) {
    let h = 2166136261;
    const s = String(value);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  /** Ranked and raid use the issued seed. Free Play returns local entropy and never reads `issued`. */
  function resolveRunSeed(mode, issued, entropy) {
    if (mode === 'ranked' || mode === 'raid') {
      if (typeof issued !== 'string' || issued.length < 1 || issued.length > 128) return { error: 'missing seed' };
      return { seed: issuedSeed(issued), source: 'issued' };
    }
    return { seed: entropy >>> 0, source: 'local' };
  }
  function chunk(seed, index) {
    const rng = mulberry32((seed ^ Math.imul(index + 1, 0x9E3779B9)) >>> 0);
    const z0 = index * C.CHUNK;
    const ramps = [];
    const obstacles = [];
    if (index <= 0) return { ramps, obstacles };
    if (index === 1) {
      ramps.push({ x: 0, z: z0 + 28, len: 6.2, w: 2.15 });
      stampRamps(seed, index, ramps);
      return { ramps, obstacles };
    }
    const wantRamp = rng() < (index < 4 ? 0.85 : 0.58);
    let rampX = null;
    let rampZ = 0;
    if (wantRamp) {
      rampX = LANES[(rng() * 3) | 0];
      rampZ = z0 + 8 + rng() * 18;
      ramps.push({ x: rampX, z: rampZ, len: 8.2 + rng() * 2.4, w: 2.15 });
    }
    const count = 1 + (rng() < 0.55 ? 1 : 0) + (index > 7 && rng() < 0.42 ? 1 : 0);
    for (let n = 0; n < count; n++) {
      const lane = (rng() * 3) | 0;
      const x = LANES[lane] + (rng() - 0.5) * 0.7;
      const z = z0 + 3 + rng() * (C.CHUNK - 7);
      if (rampX !== null && Math.abs(z - rampZ) < 7.5 && Math.abs(x - rampX) < 2.3) continue;
      const tree = rng() < 0.74;
      obstacles.push({ kind: tree ? 'tree' : 'rock', x, z, r: tree ? 0.58 : 0.74 });
    }
    stampRamps(seed, index, ramps);
    return { ramps, obstacles };
  }
  function stampRamps(seed, index, ramps) {
    for (let i = 0; i < ramps.length; i++) {
      const rng = mulberry32((seed ^ Math.imul(index + 5, 0x7FEB352D) ^ Math.imul(i + 1, 0x846CA68B)) >>> 0);
      const size = index === 1 ? 'M' : rng() < 0.38 ? 'S' : rng() < 0.72 ? 'M' : 'L';
      ramps[i].size = size;
      ramps[i].len = size === 'S' ? 4.4 : size === 'L' ? 8.6 : 6.2;
      if (size === 'S') ramps[i].w = 1.8;
      if (size === 'L') ramps[i].w = 2.6;
    }
  }
  function scan(seed, z0, z1) {
    const obstacles = [];
    const ramps = [];
    const a = Math.max(0, Math.floor(z0 / C.CHUNK));
    const b = Math.floor(Math.max(z0, z1) / C.CHUNK);
    for (let i = a; i <= b; i++) {
      const part = chunk(seed, i);
      for (let k = 0; k < part.obstacles.length; k++) {
        const o = part.obstacles[k];
        if (o.z >= z0 && o.z <= z1) obstacles.push(o);
      }
      for (let k = 0; k < part.ramps.length; k++) {
        const r = part.ramps[k];
        if (r.z >= z0 && r.z <= z1) ramps.push(r);
      }
    }
    return { obstacles, ramps };
  }
  function create(seed) {
    return {
      seed: seed >>> 0, tick: 0, over: false, cause: '',
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 19.5, gap: C.GAP0,
      boost: 28, boosting: false, boosts: 0,
      combo: 1, bestCombo: 1, trickPoints: 0, crashes: 0, trickCount: 0,
      trick: null, banked: 0, bankName: '', bankChain: 1, arm: 0,
      stun: 0, iframe: 0, sinceRamp: 1,
      landId: 0, landKind: '', landName: '', landPoints: 0,
      yaw: 0, steerHold: 0, steerSign: 0, steerMag: 0, nearMissed: false, lastGate: -1, gateId: 0, gatePoints: 0,
      railTime: 0, railId: 0, railAward: 0,
      queue: [], lastGesture: 0, variety: '', airAward: 0,
      slowLeft: 0, slowUsed: 0, slow: 0, predict: 0,
    };
  }
  function unpack(code) {
    const n = code | 0;
    if (n < 0 || n >= ALPHA.length) return { steer: 0, boost: 0, trick: 0 };
    return { steer: n % 3, boost: ((n / 3) | 0) & 1, trick: (n / 6) | 0 };
  }
  function pack(steer, boost, trick) {
    return (steer | 0) + 3 * (boost ? 1 : 0) + 6 * (trick | 0);
  }
  function end(s, cause) {
    s.over = true;
    s.cause = cause;
    s.boosting = false;
    s.trick = null;
    s.queue = [];
  }
  function hit(s, kind) {
    if (s.iframe > 0) return;
    s.vz *= kind === 'bail' ? C.BAIL_SPEED : C.CRASH_SPEED;
    if (s.vz < 13) s.vz = 13;
    s.gap = Math.max(0.8, s.gap - (kind === 'bail' ? C.BAIL_GAP : C.CRASH_GAP));
    s.combo = 1;
    s.variety = '';
    s.trick = null;
    s.queue = [];
    s.banked = 0;
    s.airAward = 0;
    s.y = 0;
    s.vy = 0;
    s.iframe = C.IFRAME;
    s.stun = kind === 'bail' ? 0.12 : 0.22;
    if (kind !== 'bail') s.crashes += 1;
    s.landId += 1;
    s.landKind = kind;
    s.landName = '';
    s.landPoints = 0;
  }
  function wrapTurn(yaw) {
    let f = yaw % 0.5;
    if (f < 0) f += 0.5;
    if (f > 0.25) f = 0.5 - f;
    return f;
  }
  function landingQuality(s) {
    const off = wrapTurn(s.yaw);
    const side = Math.abs(s.vx);
    if (off > 0.2 || side > 8) return 'sketchy';
    if (off > 0.08 || side > 4.5) return 'ok';
    return 'clean';
  }
  function spinTurns(trick) {
    if (!trick) return 0;
    if (trick.kind === 'spin') return [1, 1.5, 2, 3][Math.min(3, (trick.spins || 1) - 1)];
    if (trick.id === 'rodeo') return 1;
    return 0;
  }
  function applyYaw(s) {
    const trick = s.trick;
    const turns = spinTurns(trick);
    if (!turns) return;
    if (trick.yaw0 === undefined) trick.yaw0 = s.yaw;
    const u = Math.min(1, trick.t / trick.dur);
    s.yaw = trick.yaw0 + (trick.dir || 1) * turns * u;
  }
  function kickerBox(ramp) {
    const width = ramp.w;
    const length = ramp.len || C.KICK_LEN;
    return {
      width, length, height: C.LAUNCH_Y,
      x0: ramp.x - width * 0.5, x1: ramp.x + width * 0.5,
      tail: ramp.z - length, lip: ramp.z,
    };
  }
  function kickerSurface(u) {
    const t = u < 0 ? 0 : u > 1 ? 1 : u;
    const s = t * t * (3 - 2 * t);
    const start = t < 0.02 ? t / 0.02 : 1;
    const lip = t > 0.74 ? (t - 0.74) / 0.26 : 0;
    const curl = lip * (1 - lip) * 0.88;
    return C.LAUNCH_Y * s * start + curl;
  }
  function gateAt(seed, index) {
    if (index < 3 || index % 3 !== 1) return null;
    const rng = mulberry32((seed ^ Math.imul(index + 9, 0x85EBCA6B)) >>> 0);
    const mid = (rng() - 0.5) * 3.2;
    const half = 1.15;
    return { z: index * C.CHUNK + 18, x0: mid - half, x1: mid + half };
  }
  function railAt(seed, index) {
    if (index < 5 || index % 5 !== 2) return null;
    const rng = mulberry32((seed ^ Math.imul(index + 3, 0x27BB2EE6)) >>> 0);
    const z0 = index * C.CHUNK + 8;
    return { id: index, x: (rng() - 0.5) * 4.2, z0, z1: z0 + 12 };
  }
  function land(s) {
    s.y = 0;
    s.vy = 0;
    s.slowLeft = 0;
    s.slow = 0;
    const quality = landingQuality(s);
    if (s.trick && !s.trick.scored) {
      const trick = s.trick;
      if (trick.flip && trick.t < trick.dur) {
        s.trick = null;
        s.queue = [];
        hit(s, 'bail');
        return;
      }
      if (trick.t < trick.dur) {
        finishTrick(s, 0.5, false);
        s.landKind = 'sketchy';
        return;
      }
      if (quality === 'sketchy') {
        s.trick = null;
        s.queue = [];
        s.banked = 0;
        s.combo = 1;
        s.variety = '';
        s.landId += 1;
        s.landKind = 'sketchy';
        s.landName = trick.name;
        s.landPoints = 0;
        return;
      }
      if (quality === 'ok') {
        const repeat = (s.variety || '').indexOf(trick.id + ',') >= 0;
        const pts = Math.floor(trick.pts * (repeat ? 0.55 : 1));
        const gain = (pts * Math.min(C.MAX_COMBO, s.combo)) >> 1;
        s.trickPoints += gain;
        s.boost = Math.min(100, s.boost + 8);
        if (!repeat) s.variety = (s.variety || '') + trick.id + ',';
        trick.scored = true;
        s.trick = null;
        s.queue = [];
        s.banked = 0;
        s.landId += 1;
        s.landKind = 'ok';
        s.landName = trick.name;
        s.landPoints = gain;
        return;
      }
      finishTrick(s, 1, false);
      return;
    }
    s.trick = null;
    s.queue = [];
    s.banked = 0;
    if (s.airAward && quality !== 'sketchy') {
      s.airAward = 0;
      return;
    }
    s.airAward = 0;
    if (quality === 'sketchy') {
      s.combo = 1;
      s.variety = '';
      s.landId += 1;
      s.landKind = 'sketchy';
      s.landName = '';
      s.landPoints = 0;
      return;
    }
    s.landId += 1;
    s.landKind = 'plain';
    s.landName = '';
    s.landPoints = 0;
  }
  function airtime(s) {
    const g = C.GRAV;
    const disc = s.vy * s.vy + 2 * g * Math.max(0, s.y);
    return (s.vy + Math.sqrt(disc)) / g;
  }
  function copyTrick(spec) {
    return {
      id: spec.id, name: spec.name, dur: spec.dur, pts: spec.pts,
      kind: spec.kind || 'grab', flip: spec.flip || 0, dir: spec.dir || 0,
      spins: spec.spins || 1, t: 0, scored: false,
    };
  }
  function startTrick(s, spec) {
    s.trick = copyTrick(spec);
    s.trickCount += 1;
  }
  function finishTrick(s, fraction, airborne) {
    const trick = s.trick;
    if (!trick || trick.scored) return;
    if (!s.queue) s.queue = [];
    if (!s.variety) s.variety = '';
    trick.scored = true;
    const repeat = s.variety.indexOf(trick.id + ',') >= 0;
    const pts = Math.floor(trick.pts * (repeat ? 0.55 : 1) * fraction);
    const gain = pts * Math.min(C.MAX_COMBO, s.combo);
    s.trickPoints += gain;
    if (fraction >= 1) {
      s.combo = Math.min(C.MAX_COMBO, s.combo + 1);
      if (s.combo > s.bestCombo) s.bestCombo = s.combo;
      s.boost = Math.min(100, s.boost + 6);
      if (!repeat) s.variety += trick.id + ',';
    } else {
      s.combo = 1;
      s.variety = '';
    }
    s.landId += 1;
    s.landKind = fraction >= 1 ? 'clean' : 'sketchy';
    s.landName = trick.name;
    s.landPoints = gain;
    if (airborne) s.airAward = 1;
    const next = airborne && fraction >= 1 && s.queue.length ? s.queue.shift() : null;
    s.trick = next;
    if (!airborne) s.queue = [];
    if (next) s.trickCount += 1;
  }
  function offerTrick(s, code) {
    const spec = TRICKS[code];
    if (!spec) return;
    if (!s.queue) s.queue = [];
    const prev = s.lastGesture || 0;
    s.lastGesture = code;
    if (s.trick && s.trick.kind === 'spin' && spec.kind === 'spin' && s.trick.dir === spec.dir && s.trick.spins < 4 && !s.trick.scored) {
      const yawNow = s.yaw;
      s.trick.spins += 1;
      s.trick.dur += 0.25;
      s.trick.pts += 18;
      s.trick.name = SPIN_NAME[s.trick.spins - 1];
      const turns = spinTurns(s.trick);
      const u = Math.min(1, s.trick.t / s.trick.dur);
      s.trick.yaw0 = yawNow - (s.trick.dir || 1) * turns * u;
      return;
    }
    if (prev === 2 && (code === 3 || code === 4)) {
      const rodeo = { id: 'rodeo', name: 'Rodeo', dur: 1.1, pts: 64, kind: 'flip', flip: 1, dir: code === 3 ? 1 : -1, spins: 1 };
      if (s.trick && s.trick.id === 'backflip' && !s.trick.scored) { s.trick = copyTrick(rodeo); return; }
      if (!s.trick) startTrick(s, rodeo);
      else if (s.queue.length < 3) s.queue.push(copyTrick(rodeo));
      return;
    }
    if (prev === 1 && code === 2) {
      const grab = { id: 'double', name: 'Double Grab', dur: 0.7, pts: 40, kind: 'grab', flip: 0, spins: 1 };
      if (s.trick && s.trick.id === 'indy' && !s.trick.scored) { s.trick = copyTrick(grab); return; }
      if (!s.trick) startTrick(s, grab);
      else if (s.queue.length < 3) s.queue.push(copyTrick(grab));
      return;
    }
    if (!s.trick) startTrick(s, spec);
    else if (s.queue.length < 3) s.queue.push(copyTrick(spec));
  }
  function rideRamps(s, prevX, prevZ) {
    const zLo = Math.min(prevZ, s.z) - C.KICK_LEN;
    const zHi = Math.max(prevZ, s.z);
    const a = Math.max(0, Math.floor(zLo / C.CHUNK));
    const b = Math.floor(zHi / C.CHUNK);
    const span = s.z - prevZ;
    for (let i = a; i <= b; i++) {
      const part = chunk(s.seed, i);
      for (let k = 0; k < part.ramps.length; k++) {
        const ramp = part.ramps[k];
        const box = kickerBox(ramp);
        if (prevZ < box.lip && s.z >= box.lip) {
          const xLip = span === 0 ? s.x : prevX + (s.x - prevX) * ((box.lip - prevZ) / span);
          if (xLip >= box.x0 && xLip <= box.x1 && s.y < box.height + 1.2) {
            const size = ramp.size || 'M';
            const base = size === 'S' ? 6.5 : size === 'L' ? 21.4 : 13.1;
            const speedPop = Math.max(0, s.vz - 22) * 0.18;
            const boostPop = s.boosting ? 8 : 0;
            s.y = box.height;
            s.vy = base + speedPop + boostPop;
            s.vz += 1.35;
            s.sinceRamp = 0;
            s.trick = null;
            s.queue = [];
            s.lastGesture = 0;
            s.arm = 0;
            s.airAward = 0;
            s.slowUsed = 0;
            s.slowLeft = 0;
            s.slow = 0;
            s.predict = airtime(s);
            return;
          }
        }
        if (s.z >= box.tail && s.z < box.lip && s.x >= box.x0 && s.x <= box.x1) {
          const surface = kickerSurface((s.z - box.tail) / box.length);
          if (s.y <= surface + 0.25) {
            s.y = surface;
            if (s.vy < 0) s.vy = 0;
          }
        }
      }
    }
  }
  function step(s, code) {
    if (s.over) return s;
    const inp = unpack(code);
    let dt = s.slowLeft > 0 ? C.DT * C.SLOW : C.DT;
    if (s.slowLeft > 0) {
      s.slowLeft = Math.max(0, s.slowLeft - C.DT);
      if (inp.trick) s.slowLeft = Math.min(C.SLOW_MAX, s.slowLeft + 0.08);
    }
    s.slow = s.slowLeft > 0 ? 1 : 0;
    if (s.stun > 0) s.stun = Math.max(0, s.stun - dt);
    if (s.iframe > 0) s.iframe = Math.max(0, s.iframe - dt);
    if (inp.trick === 0) s.arm = 0;
    const prevZ = s.z;
    const prevX = s.x;
    const steerDir = inp.steer === 1 ? -1 : inp.steer === 2 ? 1 : 0;
    if (steerDir !== 0 && steerDir === s.steerSign) s.steerHold += dt;
    else if (steerDir !== 0) { s.steerSign = steerDir; s.steerHold = dt; }
    else { s.steerSign = 0; s.steerHold = 0; }
    const rampT = Math.min(1, s.steerHold / C.STEER_HOLD);
    const mag = steerDir === 0 ? 0 : C.STEER_MIN + (1 - C.STEER_MIN) * rampT;
    s.steerMag = mag;
    const steerScale = s.stun > 0 ? 0.35 : s.y > 0.2 ? 0.55 : 1;
    const targetVx = steerDir * C.STEER_V * mag * steerScale;
    s.vx += (targetVx - s.vx) * Math.min(1, C.STEER_A * dt);
    const wantBoost = inp.boost === 1 && s.stun <= 0 && (s.boosting || s.boost >= C.BOOST_MIN);
    if (wantBoost && s.boost > 0) {
      if (!s.boosting) s.boosts += 1;
      s.boosting = true;
      s.boost = Math.max(0, s.boost - C.BOOST_DRAIN * dt);
      if (s.boost <= 0) s.boosting = false;
    } else s.boosting = false;

    if (s.y <= 0.001) {
      s.vz += (C.CRUISE - s.vz) * 0.9 * dt;
      if (s.boosting) s.vz += C.BOOST_A * dt;
      const cap = s.boosting ? C.BOOST_V : C.MAX_V;
      if (s.vz > cap) s.vz += (cap - s.vz) * Math.min(1, 3 * dt);
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      if (Math.abs(s.x) > C.HALF) {
        const pen = Math.abs(s.x) - C.HALF;
        s.vz = Math.max(12.5, s.vz - pen * 7 * dt);
        s.vx -= Math.sign(s.x) * 22 * dt;
      }
      if (Math.abs(s.x) > C.WALL) {
        s.x = Math.sign(s.x) * (C.WALL - 0.15);
        s.vx = -Math.sign(s.x) * 4;
        hit(s, 'crash');
      }
      if (s.sinceRamp < 2) s.sinceRamp += dt;
      const aligned = Math.round(s.yaw * 2) / 2;
      s.yaw += (aligned - s.yaw) * Math.min(1, 6 * dt);
      const here = Math.floor(s.z / C.CHUNK);
      for (let gi = here - 1; gi <= here; gi++) {
        const gate = gateAt(s.seed, gi);
        if (gate && prevZ < gate.z && s.z >= gate.z && s.x > gate.x0 && s.x < gate.x1 && s.lastGate !== gate.z) {
          s.lastGate = gate.z;
          const bonus = 8 * s.combo;
          s.trickPoints += bonus;
          s.boost = Math.min(100, s.boost + 6);
          s.gateId += 1;
          s.gatePoints = bonus;
        }
        const rail = railAt(s.seed, gi);
        if (rail && s.z >= rail.z0 && s.z <= rail.z1 && Math.abs(s.x - rail.x) < 0.4) {
          if (s.railId !== rail.id) { s.railId = rail.id; s.railTime = 0; }
          s.railTime += dt;
        }
      }
      if (s.railTime >= 0.45 && s.railAward !== s.railId) {
        s.railAward = s.railId;
        s.trickPoints += 16;
        s.boost = Math.min(100, s.boost + 10);
        s.gateId += 1;
        s.gatePoints = 16;
      }
      rideRamps(s, prevX, prevZ);
      if (s.y <= 0.001 && s.iframe <= 0) {
        const near = scan(s.seed, s.z - 1.4, s.z + 1.4);
        for (let i = 0; i < near.obstacles.length; i++) {
          const o = near.obstacles[i];
          if (Math.abs(s.z - o.z) < 1.05 && Math.abs(s.x - o.x) < o.r + 0.42) {
            const side = s.x >= o.x ? 1 : -1;
            s.x = o.x + side * (o.r + 0.55);
            s.vx = side * 5;
            hit(s, 'crash');
            break;
          }
        }
      }
    } else {
      if (s.boosting) s.vz += C.BOOST_A * 0.65 * dt;
      const cap = s.boosting ? C.BOOST_V : C.MAX_V;
      if (s.vz > cap) s.vz += (cap - s.vz) * Math.min(1, 2 * dt);
      s.vy -= C.GRAV * dt;
      s.y += s.vy * dt;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      if (Math.abs(s.x) > C.WALL + 0.4) {
        s.x = Math.sign(s.x) * (C.WALL + 0.4);
        s.vx *= 0.4;
      }
      if (inp.trick && inp.trick !== s.arm && s.y > C.TRICK_MIN_Y && s.stun <= 0) {
        s.arm = inp.trick;
        offerTrick(s, inp.trick);
      }
      if (s.trick) {
        s.trick.t += dt;
        applyYaw(s);
      }
      rideRamps(s, prevX, prevZ);
      if (s.y > 0.8 && !s.slowUsed && s.predict > C.SLOW_HANG && s.vy < 2.5 && s.vy > -3) {
        s.slowLeft = C.SLOW_MAX;
        s.slowUsed = 1;
      }
      if (s.y <= 0) land(s);
      else if (s.trick && !s.trick.scored && s.trick.t >= s.trick.dur) finishTrick(s, 1, true);
    }

    let ava = C.AVA_BASE + s.z * C.AVA_RAMP;
    if (s.gap > C.GAP_SAFE) ava += (s.gap - C.GAP_SAFE) * C.AVA_CATCH;
    const pull = s.boosting ? C.BOOST_PULL : 0;
    s.gap += (s.vz - ava + pull) * dt;
    if (s.gap > C.GAP_MAX) s.gap = C.GAP_MAX;
    if (s.gap < 4 && !s.nearMissed) {
      s.nearMissed = true;
      s.trickPoints += 12;
      s.boost = Math.min(100, s.boost + 14);
      s.gateId += 1;
      s.gatePoints = 12;
    }
    if (s.gap > 8) s.nearMissed = false;
    s.tick += 1;
    if (s.gap <= 0.45) end(s, 'avalanche');
    else if (s.tick >= C.MAX_TICKS) end(s, 'time');
    return s;
  }
  function result(s) {
    const distance = Math.max(0, Math.floor(s.z));
    const trickPoints = s.trickPoints | 0;
    return {
      score: distance + trickPoints,
      distance,
      trickPoints,
      bestCombo: s.bestCombo | 0,
      crashes: s.crashes | 0,
      boosts: s.boosts | 0,
      ticks: s.tick | 0,
      finished: !!s.over,
      cause: s.cause,
    };
  }
  function botInput(s) {
    if (s.over) return 0;
    let steer = 0;
    let boost = 0;
    let trick = 0;
    if (s.y > C.TRICK_MIN_Y) {
      if (!s.trick && s.vy < 3.2 && airtime(s) > 0.5) trick = (s.trickCount % 5 === 4) ? 1 : 5;
      if (s.x > 0.9) steer = 1;
      else if (s.x < -0.9) steer = 2;
    } else {
      const look = scan(s.seed, s.z + 0.4, s.z + 26);
      let threat = null;
      let threatDz = 99;
      for (let i = 0; i < look.obstacles.length; i++) {
        const o = look.obstacles[i];
        const dz = o.z - s.z;
        if (dz > 0.4 && dz < 20 && Math.abs(o.x - s.x) < o.r + 1.15 && dz < threatDz) {
          threat = o;
          threatDz = dz;
        }
      }
      if (threat) steer = threat.x > s.x - 0.05 ? 1 : 2;
      else if (s.boost < 68) {
        let ramp = null;
        for (let i = 0; i < look.ramps.length; i++) {
          const r = look.ramps[i];
          if (r.z > s.z + 1.2 && (!ramp || r.z < ramp.z)) ramp = r;
        }
        if (ramp && Math.abs(ramp.x - s.x) > 0.4) steer = ramp.x > s.x ? 2 : 1;
        else if (s.x > 1.1) steer = 1;
        else if (s.x < -1.1) steer = 2;
      } else if (s.x > 1.1) steer = 1;
      else if (s.x < -1.1) steer = 2;
    }
    if (s.stun <= 0 && s.boost >= C.BOOST_MIN && (s.gap < 12.5 || s.vz < 21.5)) boost = 1;
    return pack(steer, boost, trick);
  }
  function botRun(seed) {
    const s = create(seed);
    let input = '';
    while (!s.over) {
      const code = botInput(s);
      input += ALPHA[code];
      step(s, code);
    }
    return { seed: seed >>> 0, input, result: result(s) };
  }
  const api = {
    C, RULES_VERSION, RULESET, ALPHA, TRICKS, LANES,
    issuedSeed, resolveRunSeed, chunk, scan, create, step, unpack, pack, result, botInput, botRun,
    gateAt, railAt, kickerBox, kickerSurface, airtime,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PLSim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
