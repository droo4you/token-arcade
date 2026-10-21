/* Realistic human proxy for balance work (not shipped). Wraps the reference pilot with mobile-ish sloppiness:
   late lane changes, missed pads, boosts tapped with human gaps (chains only sometimes), few rings, no hazard-hugging.
   Deterministic per seed. Usage: node tools/human-proxy.cjs [path/to/sim.js]   env N=200 */
const S = require(process.argv[2] || require('path').join(__dirname, '../src/sim.js')); const C = S.C;
const N = +process.env.N || 200;
function human(seed, skill) {
  const r = S.rng((seed * 2654435761) ^ 0xC0FFEE);
  const s = S.newRun(seed); let nextBoostT = 0, firstT = 0.6 + r() * 1.8, laneCd = 0, ringFocus = r() < 0.3 * skill, cleared = false, flight0 = 0;
  const padMissP = 0.55 - 0.25 * skill;
  for (const p of s.pickups) if (p.type === 'pad') p.ignore = r() < padMissP;
  while (!s.over && s.tick < 300 * 120) {
    let i;
    if (s.phase === 'road') {
      const view = Object.assign(Object.create(null), s, { pickups: s.pickups.filter(p => !(p.type === 'pad' && p.ignore)) });
      i = S.bot(view);
      if ((i.leftEdge || i.rightEdge)) { if (laneCd > 0) { i.leftEdge = i.rightEdge = false; laneCd--; } else laneCd = r() < 0.3 ? 2 : 0; }
    } else if (s.phase === 'sky') {
      const view = ringFocus ? s : Object.assign(Object.create(null), s, { rings: s.rings.filter(g => !g.risky && r() < 0.6) });
      i = S.bot(view); i.boostEdge = false;
      // Human boosting: taps with 0.45-1.6 s gaps while cans last, usually early; holds the last can ~40% of the time.
      if (s.air > 0 && s.t >= nextBoostT && s.t - s.launchT > firstT && !(s.air === 1 && r() < 0.004)) {
        if (r() < 0.06) { i.boostEdge = true; nextBoostT = s.t + (r() < 0.25 * skill ? 0.45 + r() * 0.35 : 1.2 + r() * 1.6); }
      }
      if (i.pitch != null) i.pitch = S.clamp(i.pitch + (r() - 0.5) * 0.3, -1, 1);
    } else i = {};
    S.step(s, i); s.events.length = 0;
    if (!cleared && s.phase === 'sky' && s.z >= C.ROAD_LEN + C.CANYON_W) cleared = true;
  }
  return { r: S.score(s), cleared, flightPast: Math.max(0, s.z - C.ROAD_LEN - C.CANYON_W) };
}
function stats(skill) {
  const res = []; for (let seed = 1; seed <= N; seed++) res.push(human(seed, skill));
  const L = res.filter(x => x.r.launchV), good = L.filter(x => x.r.launchV * 3.6 >= 380);
  const q = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(p * (b.length - 1))]; };
  const tops = L.map(x => x.r.topKmh), past = res.map(x => x.flightPast);
  return { skill, launched: L.length, avgLaunch: Math.round(L.reduce((a, x) => a + x.r.launchV * 3.6, 0) / L.length),
    clear: +(L.filter(x => x.cleared).length / L.length).toFixed(2), land: +(L.filter(x => x.r.reason === 'landed').length / L.length).toFixed(2),
    machAll: +(L.filter(x => x.r.mach05).length / L.length).toFixed(2), machGood: +(good.filter(x => x.r.mach05).length / Math.max(1, good.length)).toFixed(2), goodN: good.length,
    top: { p10: q(tops, .1), p50: q(tops, .5), p90: q(tops, .9), max: Math.max(...tops) }, pastRim: { p50: q(past, .5), p90: q(past, .9), max: Math.round(Math.max(...past)) },
    near: +(L.reduce((a, x) => a + x.r.counts.nearMiss, 0) / L.length).toFixed(2), air: +(L.reduce((a, x) => a + x.r.counts.air, 0) / L.length).toFixed(1),
    rings: +(L.reduce((a, x) => a + x.r.counts.rings, 0) / L.length).toFixed(1), total50: q(L.map(x => x.r.total), .5) };
}
console.log(JSON.stringify([stats(0.5), stats(1)], null, 0));
