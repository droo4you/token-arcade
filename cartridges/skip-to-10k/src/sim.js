// Pure simulation: no DOM. Loaded as a classic script in the browser and through vm in tests.
// World units: x grows to the right, alt grows up from the water surface (alt 0).
const SIM = (() => {
  const DT = 1 / 120;
  const G = 430;
  const PX_PER_DAY = 6;
  const SINK = 75;           // slower than this at a water contact and the rock goes down
  const DOCK_ALT = 34, DOCK_X = 52;
  const ALT_5K = 613, ALT_10K = 1395; // $4,953 (the Aug 2025 ATH) and $10,000
  const GENESIS = Date.UTC(2015, 6, 30);
  const TODAY_DAY = 4088;    // 2026-10-08
  const CHUNK = 360;

  const priceAt = alt => 1000 + Math.max(0, alt) * 6.45;
  const dayAt = x => Math.max(0, x / PX_PER_DAY);
  function dateAt(x) {
    const d = new Date(GENESIS + Math.floor(dayAt(x)) * 864e5);
    return ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  // Eras are the journey: x is time, alt is price.
  const ERAS = [
    { id: 'frontier', day: 0, name: 'FRONTIER', sub: '2015. GENESIS BLOCK',
      pool: { gem: 5, ball: 2, frog: 2, fart: 1, crab: 1, pump: 0.6, whaleG: 0.6 } },
    { id: 'dao', day: 300, name: 'THE DAO', sub: '2016. CODE IS LAW. MOSTLY',
      pool: { gem: 4, fork: 3, frog: 1, crab: 2, whaleR: 1, ball: 2, pump: 0.6 } },
    { id: 'ico', day: 640, name: 'ICO MANIA', sub: '2017. EVERYONE IS A FOUNDER',
      pool: { gem: 8, pump: 1.6, kitty: 2.5, whaleG: 1, ball: 2, fart: 1 } },
    { id: 'winter', day: 900, name: 'CRYPTO WINTER', sub: '2018. THE LAKE FROZE',
      pool: { gem: 3, bear: 3, crab: 2, whaleR: 1, ball: 2, pump: 0.5 } },
    { id: 'defi', day: 1780, name: 'DEFI SUMMER', sub: '2020. FARM EVERYTHING',
      pool: { gem: 4, farm: 3, bull: 2, frog: 1, ball: 2, pump: 1 } },
    { id: 'nft', day: 2000, name: 'NFT SEASON', sub: '2021. APE IN',
      pool: { gem: 4, yacht: 3, kevin: 1.4, bull: 1, ball: 2, whaleG: 1 } },
    { id: 'merge', day: 2550, name: 'THE MERGE', sub: '2022. 99.95% LESS ENERGY',
      pool: { gem: 4, bat: 3, whaleG: 1, whaleR: 1, ball: 2, crab: 1, frog: 1 } },
    { id: 'suits', day: 3080, name: 'THE SUITS', sub: '2024. THE ETFS ARRIVE',
      pool: { gem: 4, suit: 3, whaleG: 1.5, whaleR: 1.5, crab: 2, ball: 2 } },
    { id: 'meme', day: 3440, name: 'MEME SEASON', sub: '2025. FARTS AND FROGS',
      pool: { gem: 4, fart: 4, frog: 2, skrump: 3, pump: 1.5, kevin: 0.6, ball: 2 } },
    { id: 'today', day: TODAY_DAY, name: 'YOU ARE HERE', sub: 'STILL NOT 10K', pool: null },
    { id: 'forever', day: TODAY_DAY + 150, name: 'FOREVER', sub: 'THE WORLD COMPUTER NEVER STOPS', pool: null },
  ];
  const ALL_POOL = { gem: 5, ball: 2, frog: 1, fart: 1.5, crab: 2, pump: 1, whaleG: 1, whaleR: 1.2, fork: 0.6,
    kitty: 0.8, bear: 1, farm: 1, bull: 1, yacht: 1, kevin: 0.5, bat: 1, suit: 1, skrump: 1 };
  for (const e of ERAS) if (e.pool) e.pool.airdrop = 0.45;
  ALL_POOL.airdrop = 0.6;
  // forever gets meaner: hazards weigh more every 2000 days
  function foreverPool(day) {
    const k = 1 + Math.max(0, day - TODAY_DAY) / 2000, p = { ...ALL_POOL };
    for (const h of ['whaleR', 'bear', 'kitty', 'crab', 'fork']) p[h] *= k;
    return p;
  }
  function eraIndexAt(x) {
    const d = dayAt(x);
    let i = 0;
    while (i + 1 < ERAS.length && d >= ERAS[i + 1].day) i++;
    return i;
  }
  // Crypto winter froze the lake in patches (in days).
  const ICE = [[960, 1090], [1170, 1310], [1400, 1570]].map(([a, b]) => [a * PX_PER_DAY, b * PX_PER_DAY]);
  const onIce = x => ICE.some(([a, b]) => x >= a && x < b);

  // ---------- upgrades ----------
  const UPGRADES = [
    { id: 'arm', name: 'ARM', desc: 'DROOBER THROWS HARDER', base: 25 },
    { id: 'rock', name: 'SMOOTH ROCK', desc: 'LOSE LESS SPEED PER SKIP', base: 30 },
    { id: 'hands', name: 'DIAMOND HANDS', desc: 'WIDER PERFECT SKIP WINDOW', base: 25 },
    { id: 'aero', name: 'AERO', desc: 'TILT HARDER, GLIDE LONGER', base: 30 },
    { id: 'bounce', name: 'BOUNCES', desc: '+1 BOUNCE PER RUN', base: 20 },
    { id: 'rc', name: 'RC LIFT', desc: 'MORE RC LIFTS + GEM MAGNET', base: 35 },
    { id: 'volume', name: 'VOLUME', desc: 'NEEDED TO BREAK RESISTANCE', base: 50 },
  ];
  const MAX_LVL = 5;
  const upgradeCost = (u, lvl) => Math.round(u.base * 2 * Math.pow(lvl + 1, 1.7));

  function stats(up) {
    const L = id => Math.min(MAX_LVL, (up && up[id]) || 0);
    // Level 0 is already a fun rock (the user asked for a small gap between a fresh save and the demo).
    return {
      throwMax: 470 + 45 * L('arm'),
      goodKeep: 0.89 + 0.015 * L('rock'),
      perfectKeep: 0.968 + 0.005 * L('rock'),
      window: 0.11 + 0.018 * L('hands'),
      turn: 1.8 + 0.3 * L('aero'),
      liftK: 0.0003 + 0.00022 * L('aero'),
      bounces: 3 + L('bounce'),
      rc: 2 + Math.floor((L('rc') + 1) / 2),
      magnet: 20 + 9 * L('rc'),
      break5k: 380 - 55 * L('volume'),
      break10k: 520 - 60 * L('volume'),
    };
  }

  // ---------- rng ----------
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(r, pool) {
    let total = 0;
    for (const k in pool) total += pool[k];
    let v = r() * total;
    for (const k in pool) { v -= pool[k]; if (v <= 0) return k; }
    return 'gem';
  }

  // ---------- entities ----------
  // Every entity: { t, x, alt, w, h } with x the left edge and alt the bottom.
  const SIZES = {
    gem: [6, 8], ball: [9, 8], fart: [22, 16], pump: [14, 46], whaleG: [58, 14], whaleR: [62, 14],
    crab: [150, 6], suit: [16, 30], kevin: [24, 20], yacht: [72, 22], skrump: [12, 12], frog: [28, 4],
    kitty: [16, 14], airdrop: [12, 12], bear: [44, 22], bull: [26, 18], fork: [22, 92], bat: [16, 10], farm: [64, 6],
  };
  function spawn(t, x, alt, r) {
    const [w, h] = SIZES[t];
    return { t, x, alt, w, h, used: false, phase: r ? r() * 6.28 : 0, cd: 0 };
  }
  function genChunk(run, i) {
    const r = rng(run.seed * 31 + i * 7919);
    const x0 = 420 + i * CHUNK;
    const era = ERAS[eraIndexAt(x0)];
    const forever = !era.pool;
    const pool = era.pool || foreverPool(dayAt(x0));
    const n = forever ? 2 : 1 + (r() < 0.35 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const t = pick(r, pool);
      const x = x0 + r() * (CHUNK - 80);
      if (t === 'gem') {
        // an arc of gems along a skip-shaped parabola
        const base = 16 + r() * 150, span = 90 + r() * 80, rise = 20 + r() * 60, count = 5 + Math.floor(r() * 4);
        for (let j = 0; j < count; j++) {
          const f = j / (count - 1);
          run.ents.push(spawn('gem', x + f * span, base + rise * 4 * f * (1 - f)));
        }
        continue;
      }
      if (onIce(x) && !['gem', 'ball', 'bat', 'bear'].includes(t)) continue;
      let alt = 0;
      if (t === 'ball') alt = 30 + r() * 220;
      else if (t === 'fart') alt = 6 + r() * 50;
      else if (t === 'bat') alt = 260 + r() * 460;
      else if (t === 'whaleG' || t === 'whaleR') alt = -6;
      else if (t === 'airdrop') alt = 280 + r() * 220;
      const ent = spawn(t, x, alt, r);
      if (t === 'airdrop') ent.t0 = run.t;
      run.ents.push(ent);
    }
    if (era.id === 'ico' && r() < 0.5) {
      // ICO mania: free money falling from the sky
      for (let j = 0; j < 8; j++) run.ents.push(spawn('gem', x0 + r() * CHUNK, 60 + r() * 300));
    }
  }

  // ---------- run ----------
  function newRun(up, seed) {
    const s = stats(up);
    const run = {
      seed: seed >>> 0, s, t: 0,
      x: DOCK_X, alt: DOCK_ALT, vx: 0, vy: 0, spin: 0,
      phase: 'aim', // aim -> fly -> sink -> done
      bounces: s.bounces, rc: s.rc, rcT: 0,
      skips: 0, perfects: 0, streak: 0, bestStreak: 0, gems: 0,
      peakAlt: DOCK_ALT, broke5k: false, broke10k: false, sumPrice: 0, nPrice: 0,
      pressT: -9, pendingPerfect: 0, sinkT: 0, iceSlide: false, lastSkipKind: '',
      ents: [], chunks: 0, events: [], candles: [], seenEra: 0, passedToday: false,
      endReason: '', counts: {},
    };
    return run;
  }
  function emit(run, type, text, color) {
    run.counts[type] = (run.counts[type] || 0) + 1;
    if (text) run.counts['t:' + text] = (run.counts['t:' + text] || 0) + 1;
    run.events.push({ type, text, color, x: run.x, alt: run.alt });
  }

  // power is 0..1 from the run-up; a release on the line can push it past 1
  function throwRock(run, angleDeg, power, x = DOCK_X) {
    const a = angleDeg * Math.PI / 180, sp = run.s.throwMax * Math.max(0.45, Math.min(1.2, power)); // below ~0.35 the rock sank on first contact
    run.x = x;
    run.vx = Math.cos(a) * sp; run.vy = Math.sin(a) * sp;
    run.phase = 'fly';
    emit(run, 'throw');
  }

  function speed(run) { return Math.hypot(run.vx, run.vy); }

  // A water (or water-like surface) contact. kind: 'water' | 'frog' | 'farm' | 'crab' | 'support' | 'yacht'
  function skipOff(run, kind) {
    const s = run.s;
    const impact = Math.atan2(-run.vy, Math.max(1, run.vx)) * 180 / Math.PI;
    const early = run.t - run.pressT <= s.window;
    let perfect = early || kind === 'frog' || kind === 'farm';
    if (run.vx < SINK && kind !== 'yacht') {
      if (kind === 'support') { run.alt -= 1; emit(run, 'text', 'SUPPORT LOST', '#ff6b6b'); return false; }
      run.phase = 'sink'; run.vy = 0; run.endReason = 'SANK';
      emit(run, 'sink');
      return false;
    }
    run.skips++;
    if (impact > 48 && kind !== 'yacht') {
      run.vx *= 0.6; run.vy = Math.max(70, -run.vy * 0.3);
      run.streak = 0;
      emit(run, 'splash', 'TOO STEEP', '#9fd8ff');
      return true;
    }
    if (perfect) {
      if (early) run.pressT = -9;
      run.vx *= s.perfectKeep * entropy(run);
      run.vy = Math.max(85, -run.vy * 0.72);
      run.perfects++; run.streak++; run.bestStreak = Math.max(run.bestStreak, run.streak);
      if (run.streak % 5 === 0) { run.vx += 25; emit(run, 'text', run.streak + 'X STREAK', '#ffe066'); }
      emit(run, 'skip', perfect && kind === 'water' ? 'PERFECT' : null, '#ffe066');
    } else {
      run.vx *= s.goodKeep * entropy(run);
      run.vy = Math.max(60, -run.vy * 0.55);
      run.streak = 0;
      run.pendingPerfect = s.window; // a late tap still counts
      emit(run, 'skip', null);
    }
    if (kind === 'crab') { run.vy = Math.min(run.vy, 95); emit(run, 'text', 'CHOP', '#ff9f6b'); }
    if (kind === 'frog') emit(run, 'text', 'GM', '#7be08a');
    if (kind === 'farm') { run.gems += 4; emit(run, 'gem', 'YIELD +4', '#9ff07a'); }
    if (kind === 'support') emit(run, 'text', 'RESISTANCE IS SUPPORT', '#7be08a');
    run.lastSkipKind = kind;
    return true;
  }

  // Past today the lake gets rougher the further into the future you go, so forever runs still end.
  function entropy(run) { return 1 - Math.max(0, dayAt(run.x) - TODAY_DAY) / 1000 * 0.004; }
  function surfaceAt(run, x) {
    for (const e of run.ents) {
      if ((e.t === 'frog' || e.t === 'farm' || e.t === 'crab') && x >= e.x && x <= e.x + e.w) return e.t;
    }
    return 'water';
  }

  function hit(run, e) {
    const vx = run.vx, vy = run.vy;
    switch (e.t) {
      case 'gem': e.used = true; run.gems++; emit(run, 'gem'); break;
      case 'ball': e.used = true; run.bounces++; emit(run, 'ball', '+1 BOUNCE', '#7fe3ff'); break;
      case 'fart': e.used = true; run.vy = Math.max(vy + 240, 250); emit(run, 'fart', 'MINI PUMP', '#9ff07a'); break;
      case 'pump':
        if (run.alt < e.alt + 28) return; // only the nozzle on top launches
        e.used = true; run.vy = 820; run.vx = vx + 40; emit(run, 'pump', 'AIR PUMP', '#7be08a'); break;
      case 'whaleG':
        e.used = true; run.vy = Math.max(vy, 680); emit(run, 'whale', 'WHALE BUY', '#7be08a'); break;
      case 'whaleR':
        if (!whaleTailUp(run, e)) return;
        e.used = true; run.vy = -320; run.vx = vx * 0.8; run.streak = 0; emit(run, 'dump', 'WHALE DUMP', '#ff6b6b'); break;
      case 'suit': e.used = true; run.vx = vx + 170; run.vy = Math.max(vy, 120); emit(run, 'suit', 'INFLOWS', '#7be08a'); break;
      case 'kevin': e.used = true; run.vy = 800; run.vx = vx + 30; emit(run, 'kevin', 'KEVIN!', '#ffb3e6'); break;
      case 'yacht':
        if (vy > 0) return;
        e.cd = 0.3; run.vy = Math.max(-vy * 0.9, 380); run.gems += 3; run.skips++;
        emit(run, 'yacht', 'APE IN +3', '#ffe066'); return;
      case 'skrump': e.used = true; run.vx = vx + 90; run.gems += 2; emit(run, 'skrump', 'SKRUMP +2', '#c89bff'); break;
      case 'kitty': e.used = true; run.vx = vx * 0.7; run.vy = Math.max(vy, 140); run.streak = 0; emit(run, 'bonk', 'CONGESTED', '#ff9f6b'); break;
      case 'bear':
        e.used = true; run.vy = -260; run.vx = vx * 0.85; run.streak = 0; emit(run, 'dump', 'BEARISH', '#ff6b6b'); break;
      case 'bull': e.used = true; run.vy = 700; emit(run, 'pump', 'BULLISH', '#7be08a'); break;
      case 'fork':
        if (run.alt < e.alt + 62) { e.used = true; run.vx = vx * 0.75; run.streak = 0; emit(run, 'bonk', 'FORKED', '#ff9f6b'); break; }
        e.used = true; run.vy = 500; emit(run, 'fork', 'HARD FORK', '#c89bff'); break;
      case 'airdrop': {
        e.used = true;
        const roll = Math.floor(e.phase / 6.28 * 4);
        if (roll === 0) { run.gems += 10; emit(run, 'airdrop', 'AIRDROP +10', '#ffe066'); }
        else if (roll === 1) { run.bounces++; emit(run, 'airdrop', 'AIRDROP +1 BOUNCE', '#7fe3ff'); }
        else if (roll === 2) { run.rc++; emit(run, 'airdrop', 'AIRDROP +1 RC', '#7fe3ff'); }
        else emit(run, 'scam', 'IT WAS A SCAM', '#ff6b6b');
        break;
      }
      case 'bat': e.used = true; run.vx = vx + 230; emit(run, 'bat', 'ULTRASOUND', '#c89bff'); break;
    }
  }
  // airdrops drift down on a parachute and bob on the water once they land
  function airAlt(run, e) { return Math.max(2, e.alt - (run.t - e.t0) * 22); }
  function whaleTailUp(run, e) { return ((run.t + e.phase) % 2.2) < 0.9; }
  // Hit boxes, tuned per type so the art and the collision agree.
  function hitBox(run, e) {
    switch (e.t) {
      case 'whaleG': return [e.x + 8, e.alt, 18, 180];           // the spout column
      case 'whaleR': return [e.x + 34, e.alt, 36, 86];           // the tail slap
      case 'bear': return [e.x + 6, 0, 30, 54];                  // the swipe
      case 'skrump': return [e.x, Math.abs(Math.sin(run.t * 3 + e.phase)) * 54, e.w, e.h];
      case 'airdrop': return [e.x - 3, airAlt(run, e) - 3, e.w + 6, e.h + 6];
      case 'bat': return [e.x - 4, e.alt + Math.sin(run.t * 4 + e.phase) * 10 - 4, e.w + 8, e.h + 8];
      case 'gem': { const m = run.s.magnet; return [e.x - m, e.alt - m, e.w + 2 * m, e.h + 2 * m]; }
      case 'yacht': return [e.x, 0, e.w, e.h];
      default: return [e.x, e.alt, e.w, e.h];
    }
  }

  // input: { tilt: -1..1, skip: bool (edge), bounce: bool (edge), rc: bool (edge) }
  function step(run, input) {
    run.t += DT;
    if (run.phase === 'sink') {
      run.sinkT += DT; run.vx *= 0.96; run.x += run.vx * DT; run.alt -= 30 * DT;
      if (run.sinkT > 1.4) run.phase = 'done';
      return;
    }
    if (run.phase !== 'fly') return;
    const s = run.s;

    if (input.skip) {
      run.pressT = run.t;
      if (run.pendingPerfect > 0) {
        // late tap: upgrade the last good skip to perfect
        run.pendingPerfect = 0;
        run.vx *= s.perfectKeep / s.goodKeep;
        run.vy *= 0.72 / 0.55;
        run.perfects++; run.streak = 1; run.bestStreak = Math.max(run.bestStreak, 1);
        run.pressT = -9;
        emit(run, 'perfect', 'PERFECT', '#ffe066');
      } else if (run.iceSlide) {
        run.vy = 230; run.iceSlide = false; emit(run, 'skip', 'HOP', '#bfe8ff');
      }
    }
    run.pendingPerfect = Math.max(0, run.pendingPerfect - DT);
    if (input.bounce && run.bounces > 0) {
      // a skip off thin air: stops the fall and kicks the rock back up
      run.bounces--;
      run.vy = Math.max(run.vy * 0.3, 0) + 300; run.vx += 140;
      emit(run, 'bounce', 'BOING', '#7fe3ff');
    }
    if (input.rc && run.rc > 0 && run.rcT <= 0) {
      run.rc--; run.rcT = 0.55;
      run.vy = Math.max(run.vy, 400); run.vx += 40;
      emit(run, 'rc', 'RC LIFT', '#7fe3ff');
    }
    run.rcT = Math.max(0, run.rcT - DT);

    // flight: gravity, drag, tilt (turns the velocity), a little lift from AERO
    const sp = Math.max(1, speed(run));
    const tilt = Math.max(-1, Math.min(1, input.tilt || 0));
    let ax = 0, ay = -G;
    const k = 0.00012 * sp + 0.1 * Math.abs(tilt);
    ax -= run.vx * k; ay -= run.vy * k;
    const turn = tilt * s.turn * sp;
    ax += -run.vy / sp * turn; ay += run.vx / sp * turn;
    ay += Math.min(G * 0.7, s.liftK * run.vx * run.vx);
    if (run.iceSlide && (run.alt > 0.5 || run.vy > 0)) run.iceSlide = false;
    if (run.iceSlide) { ay = Math.max(0, ay); ax -= 26; }
    run.vx = Math.max(0, run.vx + ax * DT);
    run.vy += ay * DT;
    const prevAlt = run.alt;
    run.x += run.vx * DT;
    run.alt += run.vy * DT;
    run.spin += run.vx * DT * 0.08;

    // resistance lines: rejected unless you bring the volume
    for (const [line, key, need, label] of [[ALT_5K, 'broke5k', s.break5k, '5K'], [ALT_10K, 'broke10k', s.break10k, '10K']]) {
      if (prevAlt < line && run.alt >= line) {
        if (!run[key] && run.vy >= need) { run[key] = true; emit(run, 'breakout', 'BROKE ' + label + '!', '#7be08a'); }
        else if (!run[key]) {
          run.alt = line - 1; run.vy = -Math.abs(run.vy) * 0.4 - 40;
          emit(run, 'rejected', 'REJECTED', '#ff6b6b');
        }
      } else if (prevAlt >= line && run.alt < line && run[key] && run.vy < 0) {
        run.alt = line; skipOff(run, 'support');
      }
    }

    // water
    if (run.alt <= 0) {
      if (onIce(run.x)) {
        if (!run.iceSlide) { run.skips++; emit(run, 'ice', 'ICE', '#bfe8ff'); }
        run.alt = 0; run.vy = Math.max(0, run.vy); run.iceSlide = true;
        if (run.vx < 40) { run.phase = 'sink'; run.endReason = 'FROZE'; emit(run, 'froze', 'HODLING ON ICE', '#bfe8ff'); }
      } else if (run.vy <= 0) {
        run.iceSlide = false;
        run.alt = 0;
        skipOff(run, surfaceAt(run, run.x));
      }
    } else if (run.iceSlide && !onIce(run.x)) run.iceSlide = false;

    // entities
    while (420 + run.chunks * CHUNK < run.x + 900) genChunk(run, run.chunks++);
    for (const e of run.ents) {
      if (e.used || e.t === 'frog' || e.t === 'farm' || e.t === 'crab') continue;
      if (e.cd > 0) { e.cd -= DT; continue; }
      const [bx, ba, bw, bh] = hitBox(run, e);
      if (run.x + 4 > bx && run.x - 4 < bx + bw && run.alt + 4 > ba && run.alt - 3 < ba + bh) hit(run, e);
    }
    if (run.ents.length > 400) run.ents = run.ents.filter(e => e.x > run.x - 500);

    // bookkeeping: peak, eras, candles (one per 30 days of travel)
    run.peakAlt = Math.max(run.peakAlt, run.alt);
    const p = priceAt(run.alt);
    run.sumPrice += p; run.nPrice++;
    const ci = Math.floor(dayAt(run.x) / 30);
    let c = run.candles[run.candles.length - 1];
    if (!c || c.i !== ci) { c = { i: ci, o: p, h: p, l: p, c: p }; run.candles.push(c); }
    c.h = Math.max(c.h, p); c.l = Math.min(c.l, p); c.c = p;
    const ei = eraIndexAt(run.x);
    if (ei > run.seenEra) { run.seenEra = ei; emit(run, 'era', ERAS[ei].name, '#ffffff'); }
    if (!run.passedToday && dayAt(run.x) >= TODAY_DAY) { run.passedToday = true; emit(run, 'today', 'YOU ARE HERE', '#ffe066'); }
    if (run.t > 900) { run.phase = 'done'; run.endReason = 'TIME'; }
  }

  function results(run) {
    const days = Math.floor(dayAt(run.x));
    const earned = run.gems * 2 + Math.floor(days / 6) + run.perfects;
    return {
      days, date: dateAt(run.x), peak: Math.round(priceAt(run.peakAlt)),
      vwap: Math.round(run.nPrice ? run.sumPrice / run.nPrice : 1000),
      skips: run.skips, perfects: run.perfects, bestStreak: run.bestStreak, gems: run.gems, earned,
      broke5k: run.broke5k, broke10k: run.broke10k, era: ERAS[eraIndexAt(run.x)].name, reason: run.endReason,
    };
  }

  // Simple bot for tests: throws flat-ish, taps at every contact, uses boosts when slow.
  function botInput(run) {
    const nearWater = run.alt < 6 && run.vy < 0;
    const sp = speed(run);
    return {
      tilt: run.alt > 220 && run.vy < -150 ? 0.4 : 0,
      skip: nearWater,
      bounce: run.vx < 160 && run.bounces > 0 && run.alt < 40,
      rc: run.vx < 120 && run.rc > 0 && sp > 0,
    };
  }

  return {
    DT, G, PX_PER_DAY, DOCK_ALT, DOCK_X, ALT_5K, ALT_10K, TODAY_DAY, ERAS, ICE, UPGRADES, MAX_LVL,
    priceAt, dayAt, dateAt, eraIndexAt, onIce, stats, upgradeCost, newRun, throwRock, step, results,
    hitBox, whaleTailUp, airAlt, botInput, speed,
  };
})();
if (typeof module !== 'undefined') module.exports = SIM;
