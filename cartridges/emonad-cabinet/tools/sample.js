// Run distribution sampler. Drives headless runs at a spread of simulated skill
// levels and reports what players actually produce, so the ticket economy can be
// fitted to real numbers rather than guessed.
//
// The autoplayer is a tracker with a shaking hand, not a person. Treat the
// numbers as the shape of the distribution and its upper bound, not as player
// data. What it is good for is answering two questions the spec depends on:
// do runs terminate, and is there a spread in tickets collected.
//
//   node tools/sample.js [runsPerSkill] [maxFrames]
const { makeTrial } = require('./harness');

const W = 1280, H = 720, DT = 16;
const RUNS = Number(process.argv[2] || 6);
const MAX_FRAMES = Number(process.argv[3] || 16000);

function mul(a) {
  a = a >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Correlated hand tremor. A sinusoid is a bad model here: it either stays inside
// the button or it does not, so it produces a cliff instead of a gradient. This
// drifts, which is closer to how a real hand misses, plus rare lapses.
function player(sigma, pseed) {
  const r = mul(pseed);
  let e = 0;
  return (i, S) => {
    if (!S) return W / 2;
    e = e * 0.94 + (r() + r() + r() - 1.5) * 2 * sigma;
    if (r() < 0.004) e += (r() * 2 - 1) * sigma * 9;
    return (S.head.x - S.cam.x) + e;
  };
}

const SKILLS = [['elite', 1], ['strong', 3], ['average', 5], ['weak', 7], ['loose', 9]];

const pct = (s, p) => s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))] : 0;

console.log('runs per skill: ' + RUNS + ', frame cap: ' + MAX_FRAMES +
            ' (' + (MAX_FRAMES * DT / 1000).toFixed(0) + 's)');
console.log();
console.log('skill   | t alive p10/p50/p90 | tickets p10/p50/p90 | ath p50     | ended');
console.log('--------+---------------------+---------------------+-------------+------');

const all = [];
for (const [name, sigma] of SKILLS) {
  const rows = [];
  for (let r = 0; r < RUNS; r++) {
    const t = makeTrial(W, H);
    const S = t.run(1000003 * (r + 1) + 7, MAX_FRAMES, DT, player(sigma, 90001 + r * 31));
    rows.push({ t: S.t, tickets: S.tickets, ath: S.ath, over: S.over });
    all.push({ skill: name, ...rows[rows.length - 1] });
  }
  const ts = rows.map(r => r.t).sort((a, b) => a - b);
  const ks = rows.map(r => r.tickets).sort((a, b) => a - b);
  const as = rows.map(r => r.ath).sort((a, b) => a - b);
  console.log(
    name.padEnd(7) + ' | ' +
    (pct(ts, 10).toFixed(0) + 's/' + pct(ts, 50).toFixed(0) + 's/' + pct(ts, 90).toFixed(0) + 's').padEnd(19) + ' | ' +
    (pct(ks, 10) + '/' + pct(ks, 50) + '/' + pct(ks, 90)).padEnd(19) + ' | ' +
    ('$' + (pct(as, 50) / 1e6).toFixed(0) + 'M').padStart(11) + ' | ' +
    rows.filter(r => r.over).length + '/' + rows.length
  );
}

console.log();
const ended = all.filter(r => r.over).length;
console.log('runs that ended: ' + ended + '/' + all.length +
            (ended === all.length ? '  (every run terminates)' : '  <-- SOME RUNS NEVER END'));

const kAll = all.map(r => r.tickets).sort((a, b) => a - b);
const hist = {};
for (const k of kAll) hist[k] = (hist[k] || 0) + 1;
console.log();
console.log('ticket histogram across all runs:');
for (let k = 0; k <= 10; k++) {
  if (!hist[k]) continue;
  console.log('  ' + String(k).padStart(2) + ' | ' + '#'.repeat(hist[k]) + ' ' + hist[k]);
}
console.log();
console.log('  p10=' + pct(kAll, 10) + '  p50=' + pct(kAll, 50) + '  p90=' + pct(kAll, 90) +
            '  max=' + kAll[kAll.length - 1]);
console.log('  window total for 3 attempts at p50 = ' + (3 * pct(kAll, 50)) +
            ', at p90 = ' + (3 * pct(kAll, 90)));
