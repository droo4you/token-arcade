/* Mood Swings 2.0.0. Shared, fixed-step simulation; no DOM, clock, cosmetics or audio. */
(function(root) {
  'use strict';
  const VERSION = '2.0.0', WIDTH = 390, HEIGHT = 844, STEP = 1 / 120, MAX_STEPS = 36000;
  const TIERS = [ ['Numb', 0], ['Meh', 1000], ['Okay', 3000], ['Hyped', 7000], ['Euphoric', 12000] ];
  const KINDS = {
    pep: { label: 'Pep Talk', glyph: '↑', color: '#a5e8cb' },
    main: { label: 'Main Character Moment', glyph: '⇈', color: '#ffe0a6' },
    hype: { label: 'Hype', glyph: '2×', color: '#ffc8df' },
    hoodie: { label: 'Hoodie Up', glyph: '◇', color: '#b6e2ff' },
    sad: { label: 'Sad Song', glyph: '♪', color: '#a9b7ed' },
    vibe: { label: 'Good Vibes', glyph: '✦', color: '#fff1b5' }
  };
  function seed(value) {
    let h = 0x811c9dc5;
    for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
    return h >>> 0;
  }
  function random(a) { return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // Specified arithmetic only in the simulation, matching the original camera motion.
  function sin(x) {
    const tau = 6.283185307179586, half = 1.5707963267948966;
    let t = x / tau; t -= Math.floor(t); let a = t * tau;
    if (a > Math.PI) a -= tau;
    if (a > half) a = Math.PI - a; else if (a < -half) a = -Math.PI - a;
    const s = a * a;
    return a * (1 + s * (-1/6 + s * (1/120 + s * (-1/5040 + s * (1/362880 + s * (-1/39916800))))));
  }
  function tier(mood) { let i = 0; while (i < TIERS.length - 1 && mood >= TIERS[i + 1][1]) i++; return i; }
  function create(value) {
    const rng = random(seed(value));
    const s = { seed: String(value), steps: 0, t: 0, over: false, shown: false, dying: 0,
      head: { x: 0, y: 240, vx: 210, vy: 0, r: 7 },
      cam: { x: -WIDTH * .45, y: HEIGHT * .81, sx: 210 },
      pad: { x: WIDTH / 2, w: 96 }, base: 0, baseT: 0, armed: true,
      climb: 0, mood: 100, peakMood: 100, vibes: 0, meter: 0, euphoria: 0, euphorias: 0,
      hype: 0, shield: false, bounces: 0, streak: 0, bestStreak: 0,
      chain: 0, lastPep: -9, nextVibe: 2, rain: 0, pickups: [], trail: [], events: [] };
    const screenX = x => x - s.cam.x;
    const clamp = x => Math.round(Math.max(s.pad.w / 2, Math.min(WIDTH - s.pad.w / 2, x)));
    const emit = text => { s.events.push({ text, tick: s.steps }); if (s.events.length > 5) s.events.shift(); };
    function spawn() {
      const r = rng(), diff = Math.min(1, s.t / 95);
      let kind = r < .44 ? 'pep' : r < .62 ? 'hype' : r < .74 ? 'main' : r < .74 + .18 * diff ? 'sad' : !s.shield && r > .93 ? 'hoodie' : 'pep';
      if (kind === 'sad' && s.t < 14) kind = 'pep';
      const ahead = 300 + rng() * 420, y = s.base + 150 + rng() * 230;
      const n = kind === 'pep' ? 1 + Math.floor(rng() * 3) : 1;
      const dx = 54 + rng() * 40, dy = (rng() * 2 - 1) * 38;
      for (let i = 0; i < n; i++) s.pickups.push({ kind, x: s.head.x + ahead + i * dx, y: y + i * dy });
    }
    function bounce(off) {
      const a = Math.abs(off), diff = Math.min(1, s.t / 95), speed = 1 + Math.min(1.15, s.t / 240);
      s.bounces++; s.streak++; s.bestStreak = Math.max(s.streak, s.bestStreak);
      const big = rng() < .16, variation = 1 + (rng() * 2 - 1) * (big ? .52 : .26);
      s.head.vy = 980 * (1 + .30 * a) * (1 + .06 * diff) * (1 + (rng() * 2 - 1) * .12) * (s.euphoria > 0 ? 1.2 : 1);
      s.head.vx = Math.max(70, 210 * speed * Math.max(.62, Math.min(1.46, 1 + .40 * off)) * variation);
      s.baseT += 26 + 34 * a + 16 * diff;
      s.climb += 1 + .8 * a;
      if (s.bounces % 2 === 0 || s.pickups.length < 4) spawn();
    }
    function die() {
      if (s.shield) {
        s.shield = false; s.streak = 0; s.head.y = s.base + 2; s.head.vy = 980 * .95; s.baseT += 10; s.armed = false; emit('Hoodie Up'); return;
      }
      s.over = true; s.dying = 0;
    }
    function collect(p) {
      const h = s.head;
      emit(KINDS[p.kind].label);
      if (p.kind === 'pep') { s.chain = s.t - s.lastPep < 1.1 ? s.chain + 1 : 1; s.lastPep = s.t; h.vy = Math.max(h.vy, 0) + 980 * .52; s.climb += .5 * Math.min(5, s.chain); }
      if (p.kind === 'main') { h.vy = Math.max(h.vy, 0) + 980 * 1.78; s.climb += 8; }
      if (p.kind === 'hype') s.hype = 8;
      if (p.kind === 'hoodie') s.shield = true;
      if (p.kind === 'sad') { h.vy = -980 * (h.y - s.base > 230 ? 1.15 : .7); s.climb = Math.max(0, s.climb - 4); s.rain = 1; }
      if (p.kind === 'vibe') {
        const amount = s.hype > 0 ? 2 : 1;
        s.vibes += amount; s.meter += amount;
        h.vy = Math.max(h.vy, 0) + 980 * .45;
        if (s.meter >= 5) { s.meter -= 5; s.euphoria = 6; s.euphorias++; emit('Euphoria'); }
      }
    }
    function tick(input) {
      if (s.shown) return s;
      s.pad.x = clamp(Number.isFinite(input) ? input : s.pad.x);
      s.steps++; s.t = s.steps * STEP;
      if (s.over) { s.dying += STEP; if (s.dying >= .9 || s.steps >= MAX_STEPS) s.shown = true; return s; }
      if (s.steps >= MAX_STEPS - 110) { s.over = true; emit('What a run'); return s; }
      s.base += (s.baseT - s.base) * Math.min(1, STEP * 7);
      s.hype = Math.max(0, s.hype - STEP); s.euphoria = Math.max(0, s.euphoria - STEP); s.rain = Math.max(0, s.rain - STEP);
      if (s.euphoria > 0) s.climb += STEP * 2;
      const h = s.head;
      h.vy -= 2650 * STEP; h.y += h.vy * STEP; h.x += h.vx * STEP;
      s.mood = Math.max(0, Math.round(100 + s.climb * 100 + (h.y - s.base) * .2));
      s.peakMood = Math.max(s.peakMood, s.mood);
      const wander = 1 + .11 * sin(s.t * .62) + .06 * sin(s.t * 1.47 + 1.3);
      s.cam.sx += (210 * (1 + Math.min(1.15, s.t / 240)) * wander - s.cam.sx) * STEP * 1.6;
      const x = screenX(h.x), correction = x > WIDTH * .80 ? (x - WIDTH * .80) * 3.2 : x < WIDTH * .18 ? (x - WIDTH * .18) * 3.2 : 0;
      s.cam.x += (s.cam.sx + correction) * STEP;
      s.cam.y += (s.base + HEIGHT * .81 - s.cam.y) * STEP * 9;
      if (s.steps % 4 === 0) { s.trail.push({ x: h.x, y: h.y }); if (s.trail.length > 90) s.trail.shift(); }
      if (h.y > s.base + 12) s.armed = true;
      if (h.y < s.base - 70) { s.shield = false; die(); }
      if (!s.over && s.armed && h.y <= s.base && h.vy < 0) {
        s.armed = false;
        const d = screenX(h.x) - s.pad.x;
        if (Math.abs(d) <= s.pad.w / 2 + h.r) { h.y = s.base + 2; bounce(Math.max(-1, Math.min(1, d / (s.pad.w / 2)))); }
        else { s.streak = 0; die(); }
      }
      if (s.over) return s;
      s.pickups = s.pickups.filter(p => {
        const wide = p.kind === 'vibe';
        if (Math.abs(h.x - p.x) < (wide ? 58 : 26) && Math.abs(h.y - p.y) < (wide ? 36 : 26)) { collect(p); return false; }
        return p.x > s.cam.x - 80;
      });
      if (s.pickups.length < 4 && rng() < STEP * 1.6) spawn();
      if (s.t >= s.nextVibe && h.y - s.base < 300) {
        s.pickups.push({ kind: 'vibe', x: h.x + 280 + rng() * 190, y: s.base + 95 + rng() * 55 }); s.nextVibe = s.t + 3;
      }
      s.pad.w = Math.max(24, 96 * (1 - .34 * Math.min(1, s.t / 80)) - Math.max(0, s.t - 80) * .65);
      s.pad.x = clamp(s.pad.x);
      return s;
    }
    return { state: s, tick };
  }
  const metrics = s => ({ primaryMetric: s.peakMood, secondaryMetrics: { goodVibes: s.vibes, bounces: s.bounces, bestStreak: s.bestStreak, euphorias: s.euphorias, ticks: s.steps } });
  // Nine bits per paddle sample: even a five-minute run fits the API's 64 KiB body limit.
  function encode(inputs) {
    const bytes = new Uint8Array(Math.ceil(inputs.length * 9 / 8));
    for (let i = 0; i < inputs.length; i++) {
      const at = i * 9, byte = at >> 3, shift = at & 7, value = inputs[i] << shift;
      bytes[byte] |= value & 255; bytes[byte + 1] |= value >> 8;
    }
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  function decode(track, steps) {
    if (!Number.isSafeInteger(steps) || steps < 1 || steps > MAX_STEPS || typeof track !== 'string' || track.length > 54000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(track)) throw new Error('Invalid input track');
    const bytes = typeof Buffer !== 'undefined' ? Buffer.from(track, 'base64') : Uint8Array.from(atob(track), c => c.charCodeAt(0));
    if (bytes.length !== Math.ceil(steps * 9 / 8)) throw new Error('Invalid input length');
    const inputs = [];
    for (let i = 0; i < steps; i++) {
      const at = i * 9, byte = at >> 3, x = ((bytes[byte] | (bytes[byte + 1] || 0) << 8) >> (at & 7)) & 511;
      if (x > WIDTH) throw new Error('Paddle outside playfield'); inputs.push(x);
    }
    if (encode(inputs) !== track) throw new Error('Noncanonical input track');
    return inputs;
  }
  const api = { VERSION, WIDTH, HEIGHT, STEP, MAX_STEPS, TIERS, KINDS, create, tier, metrics, encode, decode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoodSwings = api;
})(typeof globalThis === 'object' ? globalThis : this);
