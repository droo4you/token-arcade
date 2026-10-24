// Headless balance + sanity check: a bot plays runs at several upgrade levels.
// node tests/sim.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SIM = require('../src/sim.js');

function play(up, seed, angle = 14, power = 1, bot = SIM.botInput) {
  const run = SIM.newRun(up, seed, process.argv.includes('--v2'));
  SIM.throwRock(run, angle, power);
  let steps = 0;
  let skipHeld = false;
  while (run.phase !== 'done' && steps < 200000) {
    const input = bot(run);
    if (run.balanceV2) {
      const held = input.skip;
      input.skip = held && !skipHeld;
      skipHeld = held;
    }
    SIM.step(run, input);
    steps++;
    for (const k of ['x', 'alt', 'vx', 'vy']) if (!Number.isFinite(run[k])) throw new Error('NaN ' + k + ' seed ' + seed);
    run.events.length = 0;
  }
  if (run.phase !== 'done') throw new Error('run never ended, seed ' + seed);
  return SIM.results(run);
}
const lazy = () => ({ tilt: 0, skip: false, bounce: false, rc: false });
let fail = 0;
for (const lvl of [0, 1, 2, 3, 4, 5]) {
  const up = Object.fromEntries(SIM.UPGRADES.map(u => [u.id, lvl]));
  const rs = []; for (let s = 1; s <= 30; s++) rs.push(play(up, s));
  const days = rs.map(r => r.days).sort((a, b) => a - b);
  const med = days[15], earn = Math.round(rs.reduce((a, r) => a + r.earned, 0) / rs.length);
  const b5 = rs.filter(r => r.broke5k).length, b10 = rs.filter(r => r.broke10k).length;
  const peak = Math.max(...rs.map(r => r.peak));
  const cost = SIM.UPGRADES.reduce((a, u) => a + SIM.upgradeCost(u, lvl), 0);
  console.log(`lvl ${lvl}: days min ${days[0]} med ${med} max ${days[29]} | earn/run ${earn} | next lvl all costs ${cost} | 5k ${b5}/30 10k ${b10}/30 peak $${peak}`);
}
const l = play({}, 7, 14, 1, lazy);
console.log('no-tap run:', l.days, 'days,', l.skips, 'skips');
if (fail) process.exit(1);
