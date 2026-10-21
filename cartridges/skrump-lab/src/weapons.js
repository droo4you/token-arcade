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
  };
  const LINEUPS = { 1: ['catapult', 'tank'], 2: ['catapult', 'tank', 'rapid'], 3: ['catapult', 'tank', 'trail', 'consensus'] };
  function fill(tpl, v) { return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (k in v ? String(v[k]) : '')); }
  const api = { WEAPONS, LINEUPS, fill };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SkrumpWeapons = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
