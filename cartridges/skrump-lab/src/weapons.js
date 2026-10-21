/* Skrump Lab weapon registry: the swappable content slot of the Launcher skeleton.
 * Each Skrumpey brings its own weapon. Everything that is scored (displacement, shot economy, overkill/wasted) lives in sim.js and is
 * locked; a weapon only supplies data: identity, owner, shell count, fire params, projectile physics, pile layout and narrator lines.
 * Determinism: numbers only, no transcendental math (spread is a perpendicular nudge, not a rotation).
 * fire.arc: 'ballistic' (full gravity) | 'direct' (gScale < 1, flatter line). fire.vk: speed per pull unit (power).
 * fire.burst: rounds per shell, fire.gap: ticks between rounds (rate), fire.spread: perpendicular offsets per round.
 * Narrator lines use {displaced} {N} {gained} {range} tokens. */
(function (root) {
  'use strict';
  const WEAPONS = {
    catapult: {
      id: 'catapult', fig: 1, name: 'CATAPULT', sub: 'test 01 · range', owner: { token: '3', name: 'Skrumpey #3' },
      shells: 1, N: 36, layout: 'range', launcher: { x: 3, y: 3.2 },
      fire: { arc: 'ballistic', gScale: 1, vk: 0.27, burst: 1, gap: 0, spread: [0] },
      proj: { r: 1.4, m: 30, label: '1 SKRUMPEY (LARGE)', sprites: ['3'], payloadIsOwner: true },
      rules: { ceasefire: false }, hud: 'range', frame: 'catapult', sfx: 'launch', shake: 0.2, aimDefault: 0.8,
      auto: [[85, 40], [100, 20], [100, 40], [100, 60], [70, 60], [90, 50]],
      lines: {
        intro: 'Welcome to Lab zero seven. Figure one. Catapult. Payload: one Skrumpey. Large.',
        shot: 'Range: {range} meters. Subjects displaced: {displaced} of {N}. Accuracy: irrelevant.',
      },
    },
    tank: {
      id: 'tank', fig: 2, name: 'TANK', sub: 'test 02 · armour', owner: { token: '690', name: 'Skrumpey #690' },
      shells: 3, N: 44, layout: 'armour', launcher: { x: 3.5, y: 2.2 },
      fire: { arc: 'ballistic', gScale: 1, vk: 0.34, burst: 1, gap: 0, spread: [0] },
      proj: { r: 0.6, m: 7, label: '1 SKRUMPEY / SHELL', sprites: ['690', '2912', '2067'] },
      rules: { ceasefire: true }, hud: 'ammo', frame: 'tank', sfx: 'cannon', shake: 0.35, aimDefault: 0.35,
      auto: [[100, 10], [100, 25], [90, 40], [70, 55], [100, 45], [60, 70], [80, 30], [100, 60]],
      lines: {
        intro: 'Figure two. Tank. Three shells. Accuracy remains irrelevant.',
        first: '{gained} subjects displaced. A request for ceasefire has been received.',
        more: '{gained} additional subjects displaced. {displaced} of {N}.',
        secondFire: 'Ceasefire: denied.',
      },
    },
    // sim v2's FIG.3. Frozen so v2 records replay; the v3 lineup uses 'consensus' (same idea, toned down) instead.
    rapid: {
      id: 'rapid', fig: 3, name: 'RAPID FIRE', sub: 'test 03 · rate of fire', owner: { token: '2067', name: 'Skrumpey #2067' },
      shells: 3, N: 39, layout: 'gallery', launcher: { x: 3.2, y: 2.6 },
      fire: { arc: 'direct', gScale: 0.5, vk: 0.36, burst: 6, gap: 9, spread: [0, 0.05, -0.05, 0.1, -0.1, 0] },
      proj: { r: 0.32, m: 1.6, label: '6 MINI-SKRUMPEYS / BURST', sprites: ['2067', '2912', '690'] },
      rules: { ceasefire: false }, hud: 'ammo', frame: 'gun', sfx: 'cannon', shake: 0.12, aimDefault: 0.25,
      auto: [[100, 8], [100, 15], [100, 22], [95, 30], [90, 40], [100, 0], [80, 50]],
      lines: {
        intro: 'Figure three. Rapid fire. Three bursts of six. Subjects were not consulted.',
        first: 'Burst one. {gained} subjects displaced. Rate of fire: adequate.',
        more: '{gained} more. {displaced} of {N}. Rate of fire: excessive.',
      },
    },
    // FIG.3 (v3): the clip's "test three" stream. One shell = a lead Skrumpey with a chain trailing it on the same arc;
    // they hit the pile one after another. Light chain links, so it chips rather than flattens.
    trail: {
      id: 'trail', fig: 3, name: 'RAPID FIRE', sub: 'test 03 · skrumpey trail', owner: { token: '2912', name: 'Skrumpey #2912' },
      shells: 2, N: 30, layout: 'conga', launcher: { x: 3.2, y: 2.4 },
      fire: { arc: 'ballistic', gScale: 1, vk: 0.31, burst: 8, gap: 6, spread: [0], lead: { r: 0.6, m: 3 } },
      proj: { r: 0.34, m: 0.55, label: '1 LEAD + 7 TRAILING', sprites: ['2912', '690', '2067', '3'] },
      rules: { ceasefire: false }, hud: 'stream', frame: 'gun', sfx: 'cannon', shake: 0.15, aimDefault: 0.6,
      auto: [[80, 45], [90, 35], [100, 25], [70, 55], [95, 40], [85, 50], [100, 15]],
      lines: {
        intro: 'Test three. Rapid fire. One Skrumpey leads. The others follow. As instructed.',
        first: 'Six hundred Skrumpeys per second. {gained} subjects displaced.',
        more: '{gained} more. {displaced} of {N}. Overkill: pending.',
      },
    },
    // FIG.4 (v3): the clip's "test four", DN CONSENSUS MECHANISM ("everything at once"). droober calls it "unanimous".
    consensus: {
      id: 'consensus', fig: 4, name: 'DN CONSENSUS MECHANISM', sub: 'test 04 · everything at once', owner: { token: '2067', name: 'Skrumpey #2067' },
      shells: 3, N: 39, layout: 'gallery', launcher: { x: 3.4, y: 2.8 },
      fire: { arc: 'direct', gScale: 0.5, vk: 0.34, burst: 5, gap: 9, spread: [0, 0.05, -0.05, 0.1, -0.1] },
      proj: { r: 0.3, m: 0.95, label: '3,333 SKRUMPEYS', sprites: ['2067', '2912', '690', '3'] },
      rules: { ceasefire: false }, hud: 'consensus', frame: 'barrel', sfx: 'cannon', shake: 0.3, aimDefault: 0.25,
      auto: [[100, 8], [99, 15], [98, 22], [95, 30], [90, 40], [100, 0], [80, 50]],
      lines: {
        intro: 'Test four. The DN consensus mechanism voted on firing everything at once. Unanimous.',
        first: 'Consensus reached. {gained} subjects displaced.',
        more: '{gained} more. {displaced} of {N}. The vote stands.',
      },
    },
    // FIG.3 (v4): trail with drop-off. Each link launches later than the last (gaps grow) and a bit weaker, so the tail lags, spreads out and the last links fall short.
    trailDrop: {
      id: 'trailDrop', fig: 3, name: 'RAPID FIRE', sub: 'test 03 · skrumpey trail', owner: { token: '2912', name: 'Skrumpey #2912' },
      shells: 2, N: 30, layout: 'conga', launcher: { x: 3.2, y: 2.4 },
      fire: { arc: 'ballistic', gScale: 1, vk: 0.31, burst: 10, gap: 0, spread: [0], lead: { r: 0.6, m: 3 }, pattern: trailPattern() },
      proj: { r: 0.34, m: 0.6, label: '1 LEAD + 9 TRAILING', sprites: ['2912', '690', '2067', '3'] },
      rules: { ceasefire: false }, hud: 'stream', frame: 'gun', sfx: 'cannon', shake: 0.15, aimDefault: 0.6,
      auto: [[80, 45], [90, 35], [100, 25], [70, 55], [95, 40], [85, 50], [100, 15]],
      lines: {
        intro: 'Test three. Rapid fire. One Skrumpey leads. The others follow. Eventually.',
        first: 'Six hundred Skrumpeys per second. Approximately. {gained} subjects displaced.',
        more: '{gained} more. {displaced} of {N}. Stragglers: noted.',
      },
    },
    // FIG.4 (v4): DN Consensus, "everything at once": one blast of 96 small Skrumpeys from a packed cluster. Settled rounds despawn.
    blast: {
      id: 'blast', fig: 4, name: 'DN CONSENSUS MECHANISM', sub: 'test 04 · everything at once', owner: { token: '2067', name: 'Skrumpey #2067' },
      shells: 2, N: 39, layout: 'gallery', launcher: { x: 3.4, y: 3.0 },
      fire: { arc: 'direct', gScale: 0.6, vk: 0.33, burst: 96, gap: 0, spread: [0], pattern: blastPattern(96), despawn: true },
      proj: { r: 0.17, m: 0.45, label: '3,333 SKRUMPEYS', sprites: ['2067', '2912', '690', '3'] },
      rules: { ceasefire: false }, hud: 'consensus', frame: 'barrel', sfx: 'cannon', shake: 0.6, aimDefault: 0.25,
      auto: [[100, 8], [99, 15], [98, 22], [95, 30], [90, 40], [100, 0], [80, 50]],
      lines: {
        intro: 'Test four. The DN consensus mechanism voted on firing everything at once. Unanimous.',
        first: 'Everything was fired at once. {gained} subjects displaced.',
        more: 'It was fired again. {gained} more. {displaced} of {N}. The vote stands.',
      },
    },
    // FIG.4 (v5): one shell only, fewer rounds, wider fan: a great aim takes most of the pile, not all of it.
    blastOne: {
      id: 'blastOne', fig: 4, name: 'DN CONSENSUS MECHANISM', sub: 'test 04 · everything at once', owner: { token: '2067', name: 'Skrumpey #2067' },
      shells: 1, N: 39, layout: 'gallery', launcher: { x: 3.4, y: 3.0 },
      fire: { arc: 'direct', gScale: 0.6, vk: 0.33, burst: 44, gap: 0, spread: [0], pattern: wideBlast(44), despawn: true },
      proj: { r: 0.18, m: 0.3, label: '3,333 SKRUMPEYS', sprites: ['2067', '2912', '690', '3'] },
      rules: { ceasefire: false }, hud: 'consensus', frame: 'barrel', sfx: 'cannon', shake: 0.6, aimDefault: 0.25,
      auto: [[100, 8], [99, 15], [98, 22], [95, 30], [90, 40], [100, 0], [80, 50]],
      lines: {
        intro: 'Test four. The DN consensus mechanism voted on firing everything at once. Unanimous.',
        first: 'Everything was fired at once. {gained} subjects displaced. {displaced} of {N}.',
      },
    },
    // FIG.5 (v5): the clip's "A BIGGER TANK" (test 05 · approach speed). Huge, slow, heavy shells; the tank rolls forward every shot (no brakes).
    biggerTank: {
      id: 'biggerTank', fig: 5, name: 'A BIGGER TANK', sub: 'test 05 · approach speed', owner: { token: '690', name: 'Skrumpey #690' },
      shells: 4, N: 55, layout: 'dais', launcher: { x: 4.5, y: 3.4 },
      fire: { arc: 'ballistic', gScale: 1, vk: 0.27, burst: 1, gap: 0, spread: [0], advance: 3 },
      proj: { r: 0.95, m: 14, label: '1 LARGE SKRUMPEY / SHELL', sprites: ['690', '2912', '2067', '3'] },
      rules: { ceasefire: false, brakes: false }, hud: 'bigtank', frame: 'bigtank', sfx: 'cannon', shake: 0.9, aimDefault: 0.5,
      auto: [[90, 45], [100, 35], [85, 55], [100, 25], [95, 50], [75, 60], [100, 45], [70, 70]],
      lines: {
        intro: 'Test five. A bigger tank.',
        first: '{gained} subjects displaced. Approach speed: increasing.',
        more: '{gained} more. {displaced} of {N}. Approach speed: increasing.',
        last: 'Brakes: not installed.',
      },
    },
  };
  function wideBlast(n) { const out = [], s = 0.4; let i = 0;
    for (let ring = 0; i < n; ring++) for (let row = -ring; row <= ring && i < n; row++) for (let col = -ring; col <= ring && i < n; col++) {
      if (Math.max(Math.abs(row), Math.abs(col)) !== ring) continue;
      out.push({ t: 0, dx: col * s + (row % 2 ? s / 2 : 0), dy: row * s, k: row * 0.075 + ((i * 7) % 5 - 2) * 0.02, p: 1 + col * 0.04 + ((i * 3) % 7 - 3) * 0.02 }); i++; }
    return out; }
  // pattern rounds: { t: spawn tick, dx, dy: offset from the muzzle, k: perpendicular spread, p: power scale }. Plain arithmetic only.
  function trailPattern() { const out = [{ t: 0, dx: 0, dy: 0, k: 0, p: 1 }]; let t = 0, gap = 4;
    for (let i = 1; i < 10; i++) { gap += 1 + Math.floor(i / 2); t += gap; out.push({ t, dx: 0, dy: 0, k: 0, p: 1 - 0.035 * i }); } return out; }
  function blastPattern(n) { const out = [], s = 0.36; let i = 0; // packed hex-ish cluster, front rounds a touch faster, outer ones fanned
    for (let ring = 0; i < n; ring++) for (let row = -ring; row <= ring && i < n; row++) for (let col = -ring; col <= ring && i < n; col++) {
      if (Math.max(Math.abs(row), Math.abs(col)) !== ring) continue;
      out.push({ t: 0, dx: col * s + (row % 2 ? s / 2 : 0), dy: row * s, k: row * 0.045 + ((i * 7) % 5 - 2) * 0.012, p: 1 + col * 0.03 + ((i * 3) % 7 - 3) * 0.012 }); i++; }
    return out; }
  const LINEUPS = { 1: ['catapult', 'tank'], 2: ['catapult', 'tank', 'rapid'], 3: ['catapult', 'tank', 'trail', 'consensus'], 4: ['catapult', 'tank', 'trailDrop', 'blast'], 5: ['catapult', 'tank', 'trailDrop', 'blastOne', 'biggerTank'] };
  function fill(tpl, v) { return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (k in v ? String(v[k]) : '')); }
  const api = { WEAPONS, LINEUPS, fill };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SkrumpWeapons = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
