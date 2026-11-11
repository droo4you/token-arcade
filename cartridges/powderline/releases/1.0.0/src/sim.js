/* Powderline 1.0.0 — deterministic downhill sim. No DOM, no Math.random.
   Ruleset powderline-v1. Fixed 60 Hz. Same seed + same per-tick input = same integers.

   Score = distance (floor meters) + trick points. Combo multiplier is an integer 1..8.
   A clean trick landing banks base points × current combo, then combo grows by 1.
   Bailing a landing or hitting a tree/rock drops speed, shrinks the gap, and resets combo to 1.
   Boost spends the meter to add speed and to pull the gap open. The avalanche catching you ends the run.
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
    STEER_V: 13.2,
    STEER_A: 9.5,
    GAP0: 17.5,
    AVA_BASE: 20.4,
    AVA_RAMP: 0.0105,
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
  });
  const RULES_VERSION = '1.0.0';
  const RULESET = 'powderline-v1';
  const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRST';
  const LANES = [-4.15, 0, 4.15];
  const TRICKS = [
    null,
    { id: 'method', name: 'Method', dur: 0.46, pts: 24 },
    { id: 'mute', name: 'Mute', dur: 0.40, pts: 20 },
    { id: 'frontside', name: 'Frontside', dur: 0.58, pts: 36 },
    { id: 'backside', name: 'Backside', dur: 0.58, pts: 36 },
  ];

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
      ramps.push({ x: 0, z: z0 + 28, len: 9, w: 2.25 });
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
    return { ramps, obstacles };
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
      boost: 40, boosting: false, boosts: 0,
      combo: 1, bestCombo: 1, trickPoints: 0, crashes: 0, trickCount: 0,
      trick: null, banked: 0, bankName: '', bankChain: 1, arm: 0,
      stun: 0, iframe: 0, sinceRamp: 1,
      landId: 0, landKind: '', landName: '', landPoints: 0,
    };
  }
  function unpack(code) {
    const n = code | 0;
    if (n < 0 || n > 29) return { steer: 0, boost: 0, trick: 0 };
    return { steer: n % 3, boost: ((n / 3) | 0) & 1, trick: (n / 6) | 0 };
  }
  function end(s, cause) {
    s.over = true;
    s.cause = cause;
    s.boosting = false;
    s.trick = null;
  }
  function hit(s, kind) {
    if (s.iframe > 0) return;
    s.vz *= kind === 'bail' ? C.BAIL_SPEED : C.CRASH_SPEED;
    if (s.vz < 13) s.vz = 13;
    s.gap = Math.max(0.8, s.gap - (kind === 'bail' ? C.BAIL_GAP : C.CRASH_GAP));
    s.combo = 1;
    s.trick = null;
    s.banked = 0;
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
  function land(s) {
    s.y = 0;
    s.vy = 0;
    let banked = s.banked;
    let name = s.bankName;
    let chain = s.bankChain;
    if (s.trick) {
      const done = s.trick.t / s.trick.dur;
      if (done >= C.BAIL_AT) {
        banked += s.trick.pts;
        name = s.trick.name;
        chain = s.trick.chain;
      } else {
        s.trick = null;
        s.banked = 0;
        hit(s, 'bail');
        return;
      }
    }
    s.trick = null;
    s.banked = 0;
    if (banked > 0) {
      const mult = Math.min(C.MAX_COMBO, s.combo);
      const gain = banked * mult;
      s.trickPoints += gain;
      s.combo = Math.min(C.MAX_COMBO, s.combo + 1);
      if (s.combo > s.bestCombo) s.bestCombo = s.combo;
      s.boost = Math.min(100, s.boost + C.BOOST_GAIN + 4 * (chain - 1));
      s.landId += 1;
      s.landKind = 'clean';
      s.landName = name;
      s.landPoints = gain;
    } else {
      s.landId += 1;
      s.landKind = 'plain';
      s.landName = '';
      s.landPoints = 0;
    }
  }
  function step(s, code) {
    if (s.over) return s;
    const inp = unpack(code);
    const dt = C.DT;
    if (s.stun > 0) s.stun = Math.max(0, s.stun - dt);
    if (s.iframe > 0) s.iframe = Math.max(0, s.iframe - dt);
    if (inp.trick === 0) s.arm = 0;
    const prevZ = s.z;
    const steerDir = inp.steer === 1 ? -1 : inp.steer === 2 ? 1 : 0;
    const steerScale = s.stun > 0 ? 0.35 : s.y > 0.2 ? 0.55 : 1;
    const targetVx = steerDir * C.STEER_V * steerScale;
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
      if (!s.over && s.iframe <= 0 && s.sinceRamp > 0.35) {
        const ahead = scan(s.seed, prevZ - 0.2, s.z + 0.2);
        for (let i = 0; i < ahead.ramps.length; i++) {
          const ramp = ahead.ramps[i];
          if (prevZ < ramp.z && s.z >= ramp.z && Math.abs(s.x - ramp.x) <= ramp.w * 0.5 + 0.15) {
            s.y = C.LAUNCH_Y;
            s.vy = C.LAUNCH_VY + Math.max(0, s.vz - 22) * 0.05;
            s.vz += 1.35;
            s.sinceRamp = 0;
            break;
          }
        }
      }
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
        const spec = TRICKS[inp.trick];
        if (spec) {
          if (!s.trick) {
            s.trick = { kind: inp.trick, name: spec.name, id: spec.id, pts: spec.pts, dur: spec.dur, t: 0, chain: 1 };
            s.trickCount += 1;
          } else if (s.trick.chain < C.MAX_CHAIN && s.trick.kind !== inp.trick && s.trick.t >= s.trick.dur * C.CHAIN_AT) {
            s.banked += s.trick.pts;
            s.bankName = s.trick.name;
            s.trick = { kind: inp.trick, name: spec.name, id: spec.id, pts: spec.pts, dur: spec.dur, t: 0, chain: s.trick.chain + 1 };
            s.bankChain = s.trick.chain;
            s.trickCount += 1;
          }
        }
      }
      if (s.trick) s.trick.t += dt;
      if (s.y <= 0) land(s);
    }

    let ava = C.AVA_BASE + s.z * C.AVA_RAMP;
    if (s.gap > C.GAP_SAFE) ava += (s.gap - C.GAP_SAFE) * C.AVA_CATCH;
    const pull = s.boosting ? C.BOOST_PULL : 0;
    s.gap += (s.vz - ava + pull) * dt;
    if (s.gap > C.GAP_MAX) s.gap = C.GAP_MAX;
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
    if (s.y > 1.15) {
      if (!s.trick && s.vy < 5) trick = (s.trickCount % 4) + 1;
      else if (s.trick && s.trick.chain < 2 && s.trick.t > s.trick.dur * 0.8 && s.y > 1.8) trick = s.trick.kind === 1 ? 3 : 1;
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
    return steer + boost * 3 + trick * 6;
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
    issuedSeed, resolveRunSeed, chunk, scan, create, step, unpack, result, botInput, botRun,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PLSim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
