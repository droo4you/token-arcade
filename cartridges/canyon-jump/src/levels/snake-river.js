/* Level 1: Snake River Canyon (Twin Falls, Idaho). One file per level (src/levels/<id>.js);
   src/levels.js collects them. Pure data, no DOM. Registers on globalThis.CJLevelDefs (browser)
   and module.exports (node). Gap is ~520 m ≈ 1,600 ft — the historic Skycycle jump distance. */
(function (root) {
  'use strict';
  const LEVEL = {
    id: 'snake-river',
    name: 'Snake River Canyon',
    tagline: 'Twin Falls · 1974',
    // Gameplay numbers (meters, m/s). Must equal CJSim.C until the sim takes a level.
    sim: { ROAD_LEN: 2300, CANYON_W: 520, CANYON_DEPTH: 160, CLEAR_V: 90, RAMP_LEN: 44, RAMP_H: 6, LANE_W: 3.4 },
    time: {
      // Cooler Twin Falls late afternoon: higher sun, less amber, soft blue haze in the gorge.
      sun: { elevation: 42, azimuth: 12, color: '#f4f0e8', intensity: 2.4, disk: 0.022, glow: '#d8e4f0', glowStrength: 0.32 },
      sky: { zenith: '#1e4a88', mid: '#5a8ab8', horizon: '#c8d8e4', below: '#5a6a62', haze: 0.34, stars: 0.0 },
      hemi: { sky: '#a8c4dc', ground: '#5e6e52', intensity: 1.1 },
      fill: { color: '#dce8e0', intensity: 0.95, elevation: 24, azimuth: 200 },
      fog: { color: '#a8b8c4', near: 160, far: 2100 },
      exposure: 1.02,
      envIntensity: 1.05,
      clouds: { top: '#e4eef6', bottom: '#7a8a9c' },
    },
    palette: {
      // Snake River high desert: sage flats, dark basalt, cooler asphalt.
      sand: '#8e9270', sandDark: '#5e624c', sandLight: '#b8bc98',
      asphalt: '#26282c', asphaltLight: '#363a40', laneLine: '#e4e0d0', edgeLine: '#f0ece0',
      rumble: ['#ff3b5c', '#fff4e0'], shoulder: '#6e7260',
      mesa: ['#2e3238', '#3a3e46', '#262a30', '#4a5058', '#1e2228', '#5a6068'],
      rock: '#3e424a', cactus: '#7d8f6a', scrub: '#5e7a48', pole: '#343430', wire: '#1a1a1a',
      reflector: '#ff3b3b',
    },
    terrain: {
      size: 7000,
      flatHalfWidth: 26,
      dunes: { amp: 4, scale: 0.005, detailAmp: 0.8, detailScale: 0.04 },
      mesas: { count: 28, minDist: 380, maxDist: 3000, height: [40, 140], radius: [35, 120], seed: 17 },
      // Sagebrush country: scrub dominates, almost no saguaro.
      scatter: { cactus: 18, rock: 420, scrub: 1400, spread: 300, minX: 10, seed: 9 },
      poles: { side: 1, spacing: 46, offset: 12, height: 9 },
      reflectors: { spacing: 26, offset: 7.4 },
      signs: [
        { at: 1100, text: 'SNAKE RIVER 1 KM' },
        { at: 1600, text: 'TWIN FALLS 500 M' },
        { at: 2000, text: 'GAP 1600 FT' },
        { at: 2180, text: 'JUMP AHEAD' },
      ],
    },
    canyon: {
      // Columnar basalt: cool slate → charcoal bands with pale joint ledges.
      strata: ['#7a8088', '#5a6068', '#3a3e46', '#6a7078', '#2e3238', '#4a5058', '#22262c', '#161a20'],
      wallJitter: 9,
      ledges: 6,
      columns: 90,          // tall basalt column props along the walls
      mist: { density: 1 }, // Twin Falls spray / gorge mist (render-only)
      river: { color: '#146878', width: 58 },
      plaque: { text: 'SKYCYCLE · 1974', sub: '1,600 FT', side: -1, zOff: -28 },
    },
    obstacles: { cactus: 'sagebrush', rock: 'sandstone', tumbleweed: 'tumbleweed', cone: 'cone' },
    skyObjects: { bird: 'crow', plane: 'jet', satellite: 'sat', balloon: 'balloon' },
    // Soft "find the flow" air for level 1: sparse balloons mid-band, rare high satellites. Later levels harden this.
    air: {
      ceil: 260,
      density: { base: 1, max: 2, rampChunks: 6, extraP: 0.3 },
      bands: [{ type: 'bird', top: 30 }, { type: 'balloon', top: 200 }],
      balloon: { r: 4.2, drawR: 6, driftX: 3, driftY: 1.2, rate: 0.12 },
      plane: { r: 3.4 }, bird: { r: 1.4 },
      satellite: { r: 2.8, chance: 0.1, minY: 215 },
    },
    pickups: { orb: '#ffcf3f', air: '#4ff0ff', pad: '#ff4fd8' },
    car: { paint: '#f7f8fa', fill: '#33353a' },
  };

  (root.CJLevelDefs = root.CJLevelDefs || {})[LEVEL.id] = LEVEL;
  if (typeof module === 'object' && module.exports) module.exports = LEVEL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
