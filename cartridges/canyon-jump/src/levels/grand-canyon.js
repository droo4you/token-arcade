/* Level 2: Grand Canyon (South Rim, Arizona). Wider, deeper, and the first level with real air traffic:
   tour helicopters sweeping the gap, condors riding thermals, updraft columns and a crosswind over the deep middle.
   Gap 2.6 km (~8,500 ft): clearing is a real threat. The gorge is a route, not wallpaper: rings + AIR below the rim and gorge thermals to climb back out; thin air up high makes the safe high float the slow line. */
(function (root) {
  'use strict';
  const LEVEL = {
    id: 'grand-canyon',
    name: 'Grand Canyon',
    tagline: 'South Rim · golden hour',
    sim: { ROAD_LEN: 2300, CANYON_W: 2600, CANYON_DEPTH: 320, CLEAR_V: 90, RAMP_LEN: 44, RAMP_H: 6, LANE_W: 3.4 },
    // Stepped Grand Canyon profile: Kaibab cliff, Toroweap slope, Coconino cliff, Supai benches, Redwall, Tonto platform, inner gorge.
    wall: [[0, 0], [5, 0.5], [30, 3], [38, 14], [70, 18], [80, 30], [130, 36], [150, 58], [200, 64], [215, 84], [270, 92], [300, 110], [320, 124]],
    time: {
      sun: { elevation: 11, azimuth: -28, color: '#ffb46a', intensity: 2.9, disk: 0.03, glow: '#ff9a4a', glowStrength: 0.55 },
      sky: { zenith: '#2a3f78', mid: '#c87a62', horizon: '#ffc48a', below: '#6a3a2a', haze: 0.5, stars: 0.0 },
      hemi: { sky: '#ffc8a0', ground: '#7a3e28', intensity: 1.05 },
      fill: { color: '#a8b8e0', intensity: 0.7, elevation: 20, azimuth: 160 },
      fog: { color: '#e8a882', near: 260, far: 3400 },
      exposure: 1.05,
      envIntensity: 1.0,
      clouds: { top: '#ffd2b0', bottom: '#a0607a' },
    },
    palette: {
      sand: '#b98a5e', sandDark: '#8a5e3c', sandLight: '#dcb68a',
      asphalt: '#2c2826', asphaltLight: '#3c3633', laneLine: '#f0e4c8', edgeLine: '#fff2dc',
      rumble: ['#ff3b5c', '#fff4e0'], shoulder: '#9a7250',
      mesa: ['#b4502c', '#c86a3a', '#e0a070', '#9a3e24', '#d88a58', '#f0c898'],
      rock: '#9a5a38', cactus: '#6f8a5a', scrub: '#7a8a50', pole: '#3a302a', wire: '#1a1a1a',
      reflector: '#ff3b3b',
    },
    terrain: {
      size: 9000,
      flatHalfWidth: 26,
      dunes: { amp: 3, scale: 0.004, detailAmp: 0.7, detailScale: 0.04 },
      // Big stepped buttes and temples (Vishnu, Zoroaster vibe) out beyond the road.
      mesas: { count: 46, minDist: 360, maxDist: 4200, height: [70, 260], radius: [45, 160], seed: 23 },
      scatter: { cactus: 30, rock: 520, scrub: 1100, spread: 300, minX: 10, seed: 13 },
      poles: { side: 1, spacing: 46, offset: 12, height: 9 },
      reflectors: { spacing: 26, offset: 7.4 },
      signs: [
        { at: 1000, text: 'GRAND CANYON 1.3 KM' },
        { at: 1600, text: 'SOUTH RIM 700 M' },
        { at: 2000, text: 'GAP 8500 FT' },
        { at: 2180, text: 'SEND IT' },
      ],
    },
    canyon: {
      // Kaibab cream → Toroweap tan → Coconino buff → Supai red → Redwall → Muav/Tonto green-grey → Vishnu dark.
      strata: ['#f0d8b0', '#d8a878', '#f4e2c0', '#c0603a', '#a84a2e', '#d27a4c', '#8e3a26', '#b06a48', '#6a6650', '#3a2e2c'],
      wallJitter: 14,
      ledges: 9,
      columns: 0,
      buttes: 34,           // stepped buttes rising out of the gap floor (render-only, kept off the flight line)
      mist: { density: 0.5 },
      river: { color: '#2f7a5a', width: 70 },
      skywalk: { side: -1, zOff: -60 }, // glass horseshoe overlook on the launch rim
      plaque: { text: 'GRAND CANYON', sub: '8,500 FT · 2.6 KM', side: 1, zOff: -30 },
    },
    obstacles: { cactus: 'saguaro', rock: 'sandstone', tumbleweed: 'tumbleweed', cone: 'cone' },
    skyObjects: { bird: 'crow', plane: 'jet', satellite: 'sat', balloon: 'balloon', heli: 'heli', condor: 'condor' },
    // Level 2 air: condors low (and riding thermals), tour helicopters through the mid band, a few balloons above them,
    // satellites near the ceiling. Updrafts give free height; a crosswind drifts you over the deep middle.
    air: {
      ceil: 300,
      density: { base: 1, max: 2, rampChunks: 6, extraP: 0.3 },
      bands: [{ type: 'condor', top: 40 }, { type: 'heli', top: 170 }, { type: 'balloon', top: 235 }],
      condor: { r: 1.7, dx: 5, dy: 1.5, rate: 0.5 },
      heli: { r: 5, dx: 12, dy: 1.2, rate: 0.22 },
      balloon: { r: 4.2, drawR: 6, driftX: 3, driftY: 1.2, rate: 0.12 },
      plane: { r: 3.4 }, bird: { r: 1.4 },
      satellite: { r: 2.8, chance: 0.3, minY: 242 },
      high: { minY: 215, ringLine: 0.55, can: 0.3, orb: 0.4 },
      updraft: { chance: 0.2, r: 34, w: 22, top: 190, maxGain: 20, pastRim: 160, condorP: 0.45 },
      // Inside-the-gorge route: rings + AIR cans below the rim, and strong gorge thermals (up to 45 m of lift) to climb back out.
      gorge: { depth: 0.55, ringLine: 0.5, can: 0.15, thermal: 0.3, r: 38, w: 30, top: 30, maxGain: 45 },
      // Thin air: above 50 m the car bleeds up to 12 m/s² extra, so floating high and safe is the slow line.
      thin: { y: 50, span: 100, k: 12 },
      gust: { vx: 4, rate: 0.6, from: 0.3, to: 0.75 },
    },
    pickups: { orb: '#ffcf3f', air: '#4ff0ff', pad: '#ff4fd8' },
    car: { paint: '#f7f8fa', fill: '#33353a' },
  };
  (root.CJLevelDefs = root.CJLevelDefs || {})[LEVEL.id] = LEVEL;
  if (typeof module === 'object' && module.exports) module.exports = LEVEL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
