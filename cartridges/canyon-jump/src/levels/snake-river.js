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
    sim: { ROAD_LEN: 2300, CANYON_W: 520, CANYON_DEPTH: 110, CLEAR_V: 90, RAMP_LEN: 44, RAMP_H: 6, LANE_W: 3.4 },
    time: {
      // Late-afternoon Idaho light: cooler, higher sun than the old Mojave sunset, soft amber fill.
      sun: { elevation: 38, azimuth: 14, color: '#fff4e0', intensity: 2.6, disk: 0.024, glow: '#ffe0a8', glowStrength: 0.4 },
      sky: { zenith: '#2a5a9a', mid: '#6a9ac8', horizon: '#d0e0f0', below: '#6a7a6a', haze: 0.28, stars: 0.0 },
      hemi: { sky: '#b8d0e8', ground: '#6a7a58', intensity: 1.05 },
      fill: { color: '#e8f0e0', intensity: 0.85, elevation: 22, azimuth: 200 },
      fog: { color: '#b0c0c8', near: 200, far: 2400 },
      exposure: 1.05,
      envIntensity: 1.0,
      clouds: { top: '#e8f0f8', bottom: '#8a9ab0' },
    },
    palette: {
      // High desert sage: gray-green scrub, basalt rock, cooler asphalt.
      sand: '#9a9a78', sandDark: '#6e6e56', sandLight: '#c4c4a0',
      asphalt: '#2a2c30', asphaltLight: '#3a3e44', laneLine: '#e8e4d4', edgeLine: '#f4f0e4',
      rumble: ['#ff3b5c', '#fff4e0'], shoulder: '#7a7a62',
      mesa: ['#3a3e48', '#4a5058', '#2e3238', '#5a6068', '#262a30', '#6a7078'],
      rock: '#4a4e56', cactus: '#5a7a4a', scrub: '#6e8a52', pole: '#3a3a36', wire: '#1a1a1a',
      reflector: '#ff3b3b',
    },
    terrain: {
      size: 7000,
      flatHalfWidth: 26,
      dunes: { amp: 4, scale: 0.005, detailAmp: 0.8, detailScale: 0.04 },
      mesas: { count: 38, minDist: 320, maxDist: 2800, height: [35, 160], radius: [40, 150], seed: 17 },
      // Fewer tall cacti, more scrub — Twin Falls high desert, not Sonoran.
      scatter: { cactus: 90, rock: 340, scrub: 900, spread: 280, minX: 10, seed: 9 },
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
      // Columnar basalt: dark gray → charcoal → cool slate bands.
      strata: ['#6a7078', '#4a5058', '#3a3e46', '#5a6068', '#2e3238', '#4a4e56', '#262a30', '#1e2228'],
      wallJitter: 5,
      ledges: 4,
      river: { color: '#1a6a78', width: 52 },
      // Small roadside plaque near the ramp lip (tasteful, not cluttered).
      plaque: { text: 'SKYCYCLE · 1974', sub: '1,600 FT', side: -1, zOff: -28 },
    },
    obstacles: { cactus: 'saguaro', rock: 'sandstone', tumbleweed: 'tumbleweed', cone: 'cone' },
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
