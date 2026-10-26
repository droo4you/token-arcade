/* Canyon Jump level definitions. Pure data + a validator; no DOM, no three.js.
   A level is everything that makes one canyon look and play different: the gameplay numbers the sim
   needs (road length, gap width, depth, clear speed), time of day (sun, sky gradient, fog, exposure),
   palette, terrain and canyon geometry params, and which model skins the sim's obstacle types use.
   The 3D renderer (src/3d/) builds the whole world from one of these objects.

   Level 1: snake-river (Twin Falls), level 2: grand-canyon. Each level's sim runs via CJSim.forLevel(level). The sim still runs on its frozen constants (CJSim.C), so a level's
   `sim` block must match them; tests/levels.mjs enforces that. Phase 2 threads `sim` into
   CJSim.newRun(seed, level) so each canyon can have its own gap width and clear speed. */
(function (root) {
  'use strict';

  // Each level lives in its own settings file under src/levels/ (loaded by a <script> before this one in the browser).
  const DEFS = typeof module === 'object' && module.exports ? { 'snake-river': require('./levels/snake-river.js'), 'grand-canyon': require('./levels/grand-canyon.js') } : (root.CJLevelDefs || {});
  const SNAKE = DEFS['snake-river'];
  const LEVELS = [SNAKE, DEFS['grand-canyon']].filter(Boolean);
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
    need(num(s.CANYON_W, 50, 4000), 'sim.CANYON_W 50..4000');
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
    const SIM_OBST = ['cactus', 'rock', 'tumbleweed', 'cone'], SIM_SKY = ['bird', 'plane', 'satellite', 'balloon'], AIR_TYPES = SIM_SKY.concat(['heli', 'condor']);
    for (const k of SIM_OBST) need(typeof L.obstacles?.[k] === 'string', `obstacles.${k} skin required`);
    for (const k of SIM_SKY) need(typeof L.skyObjects?.[k] === 'string', `skyObjects.${k} skin required`);
    for (const k of ['orb', 'air', 'pad']) col(L.pickups?.[k], `pickups.${k}`);
    col(L.car?.paint, 'car.paint');
    const a = L.air || {};
    need(num(a.ceil, 80, 2000), 'air.ceil 80..2000');
    need(Array.isArray(a.bands) && a.bands.length >= 1 && a.bands.every((b, i) => AIR_TYPES.includes(b.type) && num(b.top, 1, a.ceil) && (i === 0 || b.top > a.bands[i - 1].top)), 'air.bands: known types, rising tops under ceil');
    need(a.density && num(a.density.base, 0, 6) && num(a.density.max, a.density.base, 8), 'air.density');
    for (const b of a.bands || []) need(num(a[b.type]?.r, 0.5, 20), `air.${b.type}.r`);
    need(a.satellite && num(a.satellite.chance, 0, 1) && num(a.satellite.minY, 0, a.ceil - 8) && num(a.satellite.r, 0.5, 20), 'air.satellite chance/minY/r');
    if (a.updraft) need(num(a.updraft.w, 0, 40) && num(a.updraft.maxGain, 0, 60) && num(a.updraft.r, 5, 80), 'air.updraft w<=40, maxGain<=60, r 5..80');
    if (a.gust) need(num(Math.abs(a.gust.vx), 0, 8), 'air.gust.vx |<=8|');
    for (const b of a.bands || []) if (!SIM_SKY.includes(b.type)) need(typeof L.skyObjects?.[b.type] === 'string', `skyObjects.${b.type} skin required`);
    if (L.wall) need(Array.isArray(L.wall) && L.wall[0][0] === 0 && L.wall.at(-1)[0] === s.CANYON_DEPTH && L.wall.at(-1)[1] * 2 < s.CANYON_W, 'wall: from 0 to CANYON_DEPTH, narrower than the gap');
    return errs;
  }
  /* Keys where the level disagrees with the running sim (must be empty until the sim takes a level). */
  function simMismatches(L, C) { return Object.keys(L.sim).filter(k => C[k] !== L.sim[k]); }
  function get(id) { return LEVELS.find(l => l.id === id) || LEVELS[0]; }

  const api = { LEVELS, DEFAULT: SNAKE.id, get, validate, simMismatches };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CJLevels = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
