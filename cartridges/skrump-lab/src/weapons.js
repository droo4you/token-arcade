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
  };
  const LINEUPS = { 1: ['catapult', 'tank'], 2: ['catapult', 'tank', 'rapid'] };
  function fill(tpl, v) { return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (k in v ? String(v[k]) : '')); }
  const api = { WEAPONS, LINEUPS, fill };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SkrumpWeapons = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
