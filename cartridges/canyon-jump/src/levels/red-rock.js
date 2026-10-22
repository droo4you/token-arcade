/* Level 1: Red Rock Canyon. One file per level (src/levels/<id>.js); src/levels.js collects them.
   Pure data, no DOM. Registers itself on globalThis.CJLevelDefs (browser) and module.exports (node). */
(function (root) {
  'use strict';
  const LEVEL = {
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
    skyObjects: { bird: 'crow', plane: 'jet', satellite: 'sat', balloon: 'balloon' },
    // Sky traffic and ceiling for this level (read by CJSim.newRun). Level 1 is about finding the flow: sparse traffic,
    // hot air balloons as the main mid-altitude hazard, and a few satellites only up near the ceiling as an opt-in risk.
    // Later levels (Grand Canyon, Snake River) raise density, add planes to the bands, or bring satellites lower.
    air: {
      ceil: 260,                     // hard altitude cap (m above the rim); was a global 200
      density: { base: 1, max: 2, rampChunks: 6, extraP: 0.3 }, // hazards per 80 m chunk: base + 1 every rampChunks, +1 at extraP, capped
      // Main traffic by altitude (spawned around the player's height): birds low, balloons through the middle.
      bands: [{ type: 'bird', top: 30 }, { type: 'balloon', top: 200 }],
      // Balloon: hitbox r (forgiving: drawn envelope is drawR), slow drift amplitudes (m) and rate.
      balloon: { r: 4.2, drawR: 6, driftX: 3, driftY: 1.2, rate: 0.12 },
      plane: { r: 3.4 }, bird: { r: 1.4 },
      // Satellites: rare and only in [minY, ceil - 8], independent of the player's altitude.
      satellite: { r: 2.8, chance: 0.1, minY: 215 },
    },
    pickups: { orb: '#ffcf3f', air: '#4ff0ff', pad: '#ff4fd8' },
    car: { paint: '#f7f8fa', fill: '#33353a' },
  };

  (root.CJLevelDefs = root.CJLevelDefs || {})[LEVEL.id] = LEVEL;
  if (typeof module === 'object' && module.exports) module.exports = LEVEL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
