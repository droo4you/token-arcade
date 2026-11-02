/* Level 3: Starbase (Boca Chica, Texas). A coastal sunset runway through the dunes, past the launch tower, then the
   biggest jump yet: 3.4 km over the Gulf shallows toward the far beach. A Starship stack launches beside the flight line
   when you leave the ramp (sim: air.rocket, a fixed tick clock): its body and the tower are solid, the exhaust plume shoves
   you outward and down and kills thermal lift, and skimming the plume's edge gives a little lift. Fly high enough and
   the sky turns to stars (render only). The road is drawn winding through the dunes (render-only bend, see bend below):
   the sim road is straight, so steering and scoring are untouched. */
(function (root) {
  'use strict';
  const LEVEL = {
    id: 'starbase',
    name: 'Starbase',
    tagline: 'Boca Chica · launch window at sunset',
    sim: { ROAD_LEN: 2600, CANYON_W: 3400, CANYON_DEPTH: 40, CLEAR_V: 95, RAMP_LEN: 60, RAMP_H: 12, LANE_W: 3.4 },
    // Low sea wall and beach shelf down to the Gulf shallows.
    wall: [[0, 0], [3, 0.6], [10, 5], [24, 12], [40, 18]],
    time: {
      sun: { elevation: 4, azimuth: -60, color: '#ff9a5a', intensity: 2.6, disk: 0.035, glow: '#ff7a3a', glowStrength: 0.7 },
      sky: { zenith: '#1a2a5e', mid: '#b0607a', horizon: '#ffb070', below: '#3a3048', haze: 0.55, stars: 0.05 },
      hemi: { sky: '#ffb8a0', ground: '#5a4a48', intensity: 1.0 },
      fill: { color: '#9ab0e8', intensity: 0.75, elevation: 18, azimuth: 150 },
      fog: { color: '#e09a88', near: 300, far: 3800 },
      exposure: 1.05,
      envIntensity: 1.0,
      clouds: { top: '#ffc0a0', bottom: '#80608a' },
      space: { y0: 160, y1: 520 }, // render: the sky fades to a starfield between these altitudes
    },
    palette: {
      sand: '#d4b48a', sandDark: '#a8865e', sandLight: '#f0dcb8',
      asphalt: '#2a2a2e', asphaltLight: '#3a3a40', laneLine: '#f4f0e0', edgeLine: '#ffffff',
      rumble: ['#ffffff', '#3a6ad8'], shoulder: '#bfa078',
      mesa: ['#c8a880', '#b09070', '#e0c8a0', '#a08060'],
      rock: '#8a7a6a', cactus: '#7a9a6a', scrub: '#8a9a60', pole: '#4a4a50', wire: '#1a1a1a',
      reflector: '#ff3b3b',
    },
    terrain: {
      size: 9000,
      flatHalfWidth: 30,
      dunes: { amp: 4, scale: 0.006, detailAmp: 0.9, detailScale: 0.05 },
      // low dunes and tank farms on the horizon (no tall mesas on the coast)
      mesas: { count: 14, minDist: 600, maxDist: 4200, height: [12, 40], radius: [60, 180], seed: 31 },
      scatter: { cactus: 40, rock: 260, scrub: 1500, spread: 300, minX: 10, seed: 17 },
      poles: { side: -1, spacing: 50, offset: 12, height: 9 },
      reflectors: { spacing: 26, offset: 7.4 },
      signs: [
        { at: 900, text: 'STARBASE 1.7 KM' },
        { at: 1600, text: 'LAUNCH SITE 1 KM' },
        { at: 2250, text: 'GAP 3.4 KM' },
        { at: 2480, text: 'GO FOR LAUNCH' },
      ],
    },
    // Render-only road bend: lateral offset (m) = sum of sines, faded in from the start and out before the ramp.
    bend: { amp: [26, 12], wave: [460, 980], phase: [0, 1.1], fadeIn: [0, 220], fadeOut: [1650, 2150] },
    canyon: {
      strata: ['#e8d4b0', '#d0b890', '#b89c78', '#9a8466', '#6a6a60', '#4a5058'],
      wallJitter: 4,
      ledges: 2,
      columns: 0,
      buttes: 0,
      mist: { density: 0.3 },
      river: { color: '#2a6a8a', width: 3200 }, // the Gulf shallows fill the gap
      plaque: { text: 'STARBASE', sub: '3.4 KM · GULF OF MEXICO', side: 1, zOff: -30 },
    },
    obstacles: { cactus: 'sagebrush', rock: 'sandstone', tumbleweed: 'tumbleweed', cone: 'cone' },
    skyObjects: { bird: 'crow', plane: 'jet', satellite: 'sat', balloon: 'balloon', heli: 'heli', condor: 'condor' },
    air: {
      ceil: 700,
      density: { base: 1, max: 2, rampChunks: 7, extraP: 0.25 },
      // gulls low, chase helicopters mid, jets high; satellites up where the stars come out
      bands: [{ type: 'bird', top: 60 }, { type: 'heli', top: 260 }, { type: 'plane', top: 540 }],
      bird: { r: 1.4 }, heli: { r: 4, dx: 12, dy: 1.2, rate: 0.22 }, plane: { r: 3.4 }, balloon: { r: 4.2 },
      satellite: { r: 2.8, chance: 0.35, minY: 560 },
      high: { minY: 520, ringLine: 0.5, can: 0.3, orb: 0.4 },
      updraft: { chance: 0.15, r: 30, w: 18, top: 200, maxGain: 20, pastRim: 160, condorP: 0 },
      thin: { y: 120, span: 400, k: 7, vFloor: 50 },
      recover: { v: 38, engage: -0.24, until: -0.14, blend: true, rate: 1.6, maxDrop: 0.35, stallFree: 28 }, // below 28 m/s the nose-drop cap is off: a stall noses over and falls
      lipGrace: { depth: 4, reach: 6, keep: 0.8 },
      back: { from: 0.45, ringLine: 0.35, rings: 3, can: 0.2 }, // v4: sparse ring clusters + the odd AIR can over the back half (v3 was 0.75/4/0.6: far too many)
      gust: { vx: 5, rate: 0.5, from: 0.2, to: 0.8 },
      // Starship stack 650 m past the ramp lip on the flight line (x 0), tower 21 m to the right. Ignition by proximity (see ignite);
      // body climbs at a constant rate fixed at ignition (yB = base + acc tau^2 / 2). Plume: r = r0 + spread * depth below the nozzle.
      rocket: { x: 0, z: 650, r: 4.5, h: 121, base: -28, delay: 0.2, acc: 10, vy0: 0,
        // v3 guided launch: lights 500 m before the ramp (liftoff seen from the runway), slow for 3 s, then steers its climb
        // so the nozzle is ~15 m under you as you arrive (accel <= 22 m/s^2, speed <= 130 m/s); roadY = assumed launch height
        guide: { igniteBefore: 500, slowT: 3, a0: 4, aMax: 22, vMax: 130, below: 15, roadY: 60 },
        // Booster Chunks: 3 glowing pieces dropped beside the stack (open side) when you are 320 m out; 3 s of +16 m/s^2
        chunks: { spawnAt: 320, n: 3, dz: [-40, 0, 45], dy: [2, 0, -2], gap: [6.5, 6, 6.5], dur: 3, acc: 16, pts: 150 },
        tower: { x: 21, dz: 0, r: 4, h: 146 },
        plume: { len: 300, r0: 6, spread: 0.2, push: 14, sink: 18, drag: 8, edge: 8, lift: 9 } },
    },
    pickups: { orb: '#ffcf3f', air: '#4ff0ff', pad: '#ff4fd8' },
    car: { paint: '#f7f8fa', fill: '#33353a' },
  };
  (root.CJLevelDefs = root.CJLevelDefs || {})[LEVEL.id] = LEVEL;
  if (typeof module === 'object' && module.exports) module.exports = LEVEL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
