// Progression check: a human-ish player (sloppy timing, uses boosts) from a fresh save, buying the
// cheapest upgrade after each run. Reports how many runs until the big moments. node tests/progress.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SIM = require('../src/sim.js'), META = require('../src/meta.js');
function humanRun(up, seed, err) {
  const run = SIM.newRun(up, seed);
  SIM.throwRock(run, 12 + (seed % 3) * 4, 0.85 + (seed % 4) * 0.05);
  let pressAt = null, rnd = seed * 9301 % 233280;
  const rand = () => (rnd = (rnd * 9301 + 49297) % 233280) / 233280;
  while (run.phase !== 'done') {
    const b = SIM.botInput(run), inp = { tilt: b.tilt, skip: false, bounce: b.bounce, rc: b.rc };
    if (run.vy < 0 && pressAt === null) { const tt = run.alt / Math.max(1, -run.vy); if (tt < 0.3) pressAt = run.t + tt + (rand() * 2 - 1) * err; }
    if (pressAt !== null && run.t >= pressAt) { inp.skip = true; pressAt = null; }
    SIM.step(run, inp); run.events.length = 0;
  }
  return run;
}
for (const err of [0.12, 0.08]) {
  const save = { gwei: 0, up: {}, missions: [], rocks: [1] };
  const hit = {};
  let line = [];
  for (let n = 1; n <= 40; n++) {
    const run = humanRun(save.up, n * 7, err);
    const r = SIM.results(run);
    const done = META.complete(save, r, run.counts);
    save.gwei += Math.round(r.earned * META.multiplier(save)) + done.reduce((a, m) => a + m.reward, 0);
    const mark = (k, c) => { if (c && !hit[k]) hit[k] = n; };
    mark('merge', r.days >= 2550); mark('ath', r.broke5k); mark('today', r.days >= 4088); mark('10k', r.broke10k); mark('forever', r.days >= 4238);
    // buy cheapest upgrades while affordable
    for (;;) {
      const opts = SIM.UPGRADES.filter(u => (save.up[u.id] || 0) < SIM.MAX_LVL).map(u => [u, SIM.upgradeCost(u, save.up[u.id] || 0)]).sort((a, b) => a[1] - b[1]);
      if (!opts.length || opts[0][1] > save.gwei) break;
      save.gwei -= opts[0][1]; save.up[opts[0][0].id] = (save.up[opts[0][0].id] || 0) + 1;
    }
    if (n <= 6 || n % 5 === 0) line.push(`#${n}:${r.days}d`);
    const total = Object.values(save.up).reduce((a, b) => a + b, 0);
    mark('maxed', total === SIM.UPGRADES.length * SIM.MAX_LVL);
  }
  console.log(`timing err ${err}s:`, line.join(' '));
  console.log('  first run that hit:', JSON.stringify(hit));
}
