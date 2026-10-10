// Headless determinism check for Buy Bounce.
// Drives the real RAF loop through tools/harness.js and compares final game state.
const crypto = require('crypto');
const { makeTrial } = require('./harness');

const W = 1280, H = 720;

// Autoplayer: track the chart's screen x so the run lasts long enough to exercise
// bounces, pickup spawns and whale events. The wobble keeps hits off dead center so
// edge bonuses and the big-move path both fire.
const input = (i, S) => {
  if (!S) return W / 2;
  const screenX = S.head.x - S.cam.x;
  return screenX + Math.sin(i * 0.047) * 26;
};

function fingerprint(S) {
  const trailHash = crypto.createHash('sha256')
    .update(S.trail.map(p => p.x.toFixed(6) + ',' + p.y.toFixed(6) + ',' + p.n.toFixed(6) + ',' + (p.w ? 1 : 0)).join(';'))
    .digest('hex').slice(0, 16);
  return {
    seed: S.seed, over: S.over,
    t: S.t.toFixed(6), buys: S.buys, streak: S.streak, best: S.best,
    climb: S.climb.toFixed(9), cap: S.cap.toFixed(6), ath: S.ath.toFixed(6),
    base: S.base.toFixed(6), mult: S.mult, topMult: S.topMult,
    headX: S.head.x.toFixed(6), headY: S.head.y.toFixed(6),
    headVX: S.head.vx.toFixed(6), headVY: S.head.vy.toFixed(6),
    camX: S.cam.x.toFixed(6), camY: S.cam.y.toFixed(6),
    trailLen: S.trail.length, pickups: S.pickups.length, parts: S.parts.length,
    trailHash
  };
}

const FRAMES = Number(process.argv[2]||1400), DT = 16;
const results = [];

// Trial A and B: same seed, same input, separate vm contexts. Must match exactly.
for (const label of ['A', 'B']) {
  const t = makeTrial(W, H);
  results.push([label, fingerprint(t.run(123456789, FRAMES, DT, input))]);
}
// Trial C: different seed, same input. Must differ, or the seed is not wired in.
{
  const t = makeTrial(W, H);
  results.push(['C', fingerprint(t.run(987654321, FRAMES, DT, input))]);
}

const [, A] = results[0], [, B] = results[1], [, C] = results[2];
const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);

console.log('run A (seed 123456789):', JSON.stringify(A, null, 1));
console.log('');
console.log('A === B (same seed, must match):   ', eq(A, B) ? 'PASS' : 'FAIL');
if (!eq(A, B)) {
  for (const k of Object.keys(A)) if (A[k] !== B[k]) console.log('   differs:', k, A[k], 'vs', B[k]);
}
console.log('A !== C (diff seed, must differ):  ', !eq(A, C) ? 'PASS' : 'FAIL');
console.log('C seed reported:', C.seed, C.seed === 987654321 ? '(seed honored)' : '(SEED NOT HONORED)');
console.log('frames driven:', FRAMES, ' game over:', A.over, ' bounces:', A.buys);

// Start gate: with no input the run must not advance at all.
const idle = makeTrial(W, H).runIdle(123456789, 600, 16);
const held = idle.t === 0 && !idle.over && idle.buys === 0 &&
             idle.head.y === 240 && idle.head.vy === 0 && idle.trail.length === 0;
console.log('');
console.log('start gate holds with no input:    ', held ? 'PASS' : 'FAIL');
console.log('  after 600 idle frames -> t=' + idle.t + ' over=' + idle.over +
            ' headY=' + idle.head.y + ' vy=' + idle.head.vy + ' trail=' + idle.trail.length +
            ' idleT=' + idle.idleT.toFixed(2));

// Framerate independence: same seed, same constant input, same elapsed time, three
// very different frame cadences (240Hz, 60Hz, 30Hz). All must agree exactly.
const TOTAL = 6000;
const cadences = [4.166666666666667, 16.666666666666668, 33.333333333333336];
const byCadence = cadences.map(ms => {
  const S = makeTrial(W, H).runAtCadence(123456789, TOTAL, ms, W / 2);
  return { hz: Math.round(1000 / ms), steps: S.steps, rawT: S.t, fp: fingerprint(S) };
});
const sameAsFirst = byCadence.every(r => eq(r.fp, byCadence[0].fp));
// The run ends when the static paddle misses, well before TOTAL elapses, so the
// invariant is that simulated time is exactly the tick count times STEP. Any drift
// between the two means update() received something other than STEP.
const clockExact = byCadence.every(r => Math.abs(r.rawT - r.steps / 120) < 1e-9);

console.log('');
console.log('framerate independence (' + TOTAL + 'ms budget, constant input):');
for (const r of byCadence) {
  console.log('  ' + String(r.hz).padStart(3) + 'Hz -> steps=' + r.steps +
              ' t=' + r.fp.t + ' buys=' + r.fp.buys + ' headY=' + r.fp.headY);
}
console.log('  all cadences agree:              ', sameAsFirst ? 'PASS' : 'FAIL');
console.log('  sim clock == steps / 120:        ', clockExact ? 'PASS' : 'FAIL');

process.exit(eq(A, B) && !eq(A, C) && held && sameAsFirst && clockExact ? 0 : 1);
