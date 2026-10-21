/* Canyon Jump level definitions. Pure data + a validator; no DOM, no three.js.
   A level is everything that makes one canyon look and play different: the gameplay numbers the sim
   needs (road length, gap width, depth, clear speed), time of day (sun, sky gradient, fog, exposure),
   palette, terrain and canyon geometry params, and which model skins the sim's obstacle types use.
   The 3D renderer (src/3d/) builds the whole world from one of these objects.

   Phase 1: one level (red-rock). The sim still runs on its frozen constants (CJSim.C), so a level's
   `sim` block must match them; tests/levels.mjs enforces that. Phase 2 threads `sim` into
   CJSim.newRun(seed, level) so each canyon can have its own gap width and clear speed. */
(function (root) {
  'use strict';

  const RED_ROCK = {
    id: 'red-rock',
    name: 'Red Rock Canyon',
    tagline: 'Mojave sunset',
    // Gameplay numbers (meters, m/s). Must equal CJSim.C until the sim takes a level.
    sim: { ROAD_LEN: 2300, CANYON_W: 520, CANYON_DEPTH: 110, CLEAR_V: 90, RAMP_LEN: 44, RAMP_H: 6, LANE_W: 3.4 },
    time: {
      // Sun direction in degrees: elevation above the horizon, azimuth from straight down the road (+ = right).
      sun: { elevation: 9, azimuth: 24, color: '#ffc08a', intensity: 3.4, disk: 0.032, glow: '#ff8c5a', glowStrength: 0.9 },
      sky: { zenith: '#1d0f45', mid: '#6b2c7a', horizon: '#ff9468', below: '#c46a50', haze: 0.55, stars: 0.0 },
      hemi: { sky: '#ffb9a8', ground: '#8a4632', intensity: 1.0 },
      // Fill: a soft, shadowless bounce from behind the chase cam, so faces turned away from the low sun (the car's tail,
      // the far gorge wall) still show their shape instead of going flat.
      fill: { color: '#ffe2d4', intensity: 1.1, elevation: 28, azimuth: 195 },
      fog: { color: '#e48a6e', near: 140, far: 1900 },
      exposure: 1.0,
      envIntensity: 1.0,
    },
    palette: {
      sand: '#d98a5a', sandDark: '#b5643e', sandLight: '#f0b483',
      asphalt: '#2a2430', asphaltLight: '#3b3341', laneLine: '#f4e6cc', edgeLine: '#fff1db',
      rumble: ['#ff3b5c', '#fff4e0'], shoulder: '#9c5a3c',
      mesa: ['#a6483a', '#c4613f', '#8c3a34', '#d98a5c', '#743030', '#b8573f'],
      rock: '#a9533e', cactus: '#3e7a4c', scrub: '#8b7b46', pole: '#4f3427', wire: '#2a1a1a',
      reflector: '#ff3b3b',
    },
    terrain: {
      size: 7000,               // ground plane extent (m), centered on the road
      flatHalfWidth: 26,        // flat shoulder band each side of the road
      dunes: { amp: 7, scale: 0.006, detailAmp: 1.2, detailScale: 0.05 },
      mesas: { count: 54, minDist: 280, maxDist: 2600, height: [45, 210], radius: [45, 180], seed: 11 },
      scatter: { cactus: 320, rock: 260, scrub: 700, spread: 260, minX: 10, seed: 5 },
      poles: { side: 1, spacing: 46, offset: 12, height: 9 },
      reflectors: { spacing: 26, offset: 7.4 },
      signs: [{ at: 1300, text: 'CANYON 1 KM' }, { at: 1800, text: 'CANYON 500 M' }, { at: 2120, text: 'JUMP AHEAD' }],
    },
    canyon: {
      strata: ['#e9ad7e', '#cf6a45', '#b2463a', '#e08a58', '#93352f', '#c2603f', '#7a2a2c', '#5d2028'],
      wallJitter: 7,            // m of horizontal roughness on the walls
      ledges: 5,
      river: { color: '#2fc4c9', width: 46 },
    },
    // Sim obstacle type -> model skin (src/3d/props.js). A Snake River level can swap these.
    obstacles: { cactus: 'saguaro', rock: 'sandstone', tumbleweed: 'tumbleweed', cone: 'cone' },
    skyObjects: { bird: 'crow', plane: 'jet', satellite: 'sat' },
    pickups: { orb: '#ffcf3f', air: '#4ff0ff', pad: '#ff4fd8' },
    car: { paint: '#f7f8fa', fill: '#33353a' },
  };

  const LEVELS = [RED_ROCK];
  const HEX = /^#[0-9a-f]{6}$/i;

  /* Returns a list of problems (empty when the level is usable). */
  function validate(L) {
    const errs = [];
    const need = (cond, msg) => { if (!cond) errs.push(msg); };
    const num = (v, a, b) => typeof v === 'number' && isFinite(v) && v >= a && v <= b;
    const col = (v, path) => need(typeof v === 'string' && HEX.test(v), `${path} must be #rrggbb`);
    need(L && typeof L.id === 'string' && /^[a-z0-9-]+$/.test(L.id), 'id must be kebab-case');
    if (!L) return errs;
    need(typeof L.name === 'string' && L.name.length > 0, 'name required');
    const s = L.sim || {};
    need(num(s.ROAD_LEN, 500, 6000), 'sim.ROAD_LEN 500..6000');
    need(num(s.CANYON_W, 50, 2000), 'sim.CANYON_W 50..2000');
    need(num(s.CANYON_DEPTH, 20, 1500), 'sim.CANYON_DEPTH 20..1500');
    need(num(s.CLEAR_V, 30, 200), 'sim.CLEAR_V 30..200');
    need(num(s.RAMP_LEN, 10, 200) && num(s.RAMP_H, 1, 40), 'sim.RAMP_LEN / RAMP_H');
    need(num(s.LANE_W, 2, 6), 'sim.LANE_W 2..6');
    const t = L.time || {}, sun = t.sun || {}, sky = t.sky || {}, fog = t.fog || {};
    need(num(sun.elevation, -10, 90) && num(sun.azimuth, -180, 180), 'time.sun elevation/azimuth');
    need(num(sun.intensity, 0, 20), 'time.sun.intensity');
    col(sun.color, 'time.sun.color'); col(sun.glow, 'time.sun.glow');
    for (const k of ['zenith', 'mid', 'horizon', 'below']) col(sky[k], `time.sky.${k}`);
    col(fog.color, 'time.fog.color'); need(num(fog.near, 0, 1e5) && num(fog.far, fog.near + 1, 1e5), 'time.fog near < far');
    col(t.hemi?.sky, 'time.hemi.sky'); col(t.hemi?.ground, 'time.hemi.ground');
    need(num(t.exposure, 0.1, 4), 'time.exposure');
    const p = L.palette || {};
    for (const k of ['sand', 'sandDark', 'sandLight', 'asphalt', 'asphaltLight', 'laneLine', 'edgeLine', 'shoulder', 'rock', 'cactus', 'scrub', 'pole', 'wire', 'reflector']) col(p[k], `palette.${k}`);
    need(Array.isArray(p.mesa) && p.mesa.length >= 2, 'palette.mesa needs 2+ colors'); (p.mesa || []).forEach((c, i) => col(c, `palette.mesa[${i}]`));
    need(Array.isArray(p.rumble) && p.rumble.length === 2, 'palette.rumble needs 2 colors');
    const tr = L.terrain || {};
    need(num(tr.size, 1000, 40000) && num(tr.flatHalfWidth, 8, 200), 'terrain.size / flatHalfWidth');
    need(tr.mesas && num(tr.mesas.count, 0, 400) && tr.mesas.minDist < tr.mesas.maxDist, 'terrain.mesas');
    need(tr.scatter && num(tr.scatter.minX, 8, 100), 'terrain.scatter.minX >= 8 (keeps props off the lanes)');
    const c = L.canyon || {};
    need(Array.isArray(c.strata) && c.strata.length >= 2, 'canyon.strata needs 2+ colors'); (c.strata || []).forEach((x, i) => col(x, `canyon.strata[${i}]`));
    col(c.river?.color, 'canyon.river.color'); need(num(c.river?.width, 1, (s.CANYON_W || 0)), 'canyon.river.width <= gap');
    const SIM_OBST = ['cactus', 'rock', 'tumbleweed', 'cone'], SIM_SKY = ['bird', 'plane', 'satellite'];
    for (const k of SIM_OBST) need(typeof L.obstacles?.[k] === 'string', `obstacles.${k} skin required`);
    for (const k of SIM_SKY) need(typeof L.skyObjects?.[k] === 'string', `skyObjects.${k} skin required`);
    for (const k of ['orb', 'air', 'pad']) col(L.pickups?.[k], `pickups.${k}`);
    col(L.car?.paint, 'car.paint');
    return errs;
  }
  /* Keys where the level disagrees with the running sim (must be empty until the sim takes a level). */
  function simMismatches(L, C) { return Object.keys(L.sim).filter(k => C[k] !== L.sim[k]); }
  function get(id) { return LEVELS.find(l => l.id === id) || LEVELS[0]; }

  const api = { LEVELS, DEFAULT: RED_ROCK.id, get, validate, simMismatches };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CJLevels = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
