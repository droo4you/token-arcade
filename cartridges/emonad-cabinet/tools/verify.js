// Server-side replay verification.
//
//   node tools/verify.js run.json          verify a recorded run
//   node tools/verify.js --self-test       record a run and verify it end to end
//
// A record is { v, seed, w, h, step, steps, track, claim }. Everything in `claim` is
// recomputed from seed plus track and compared. A run that does not re-simulate to
// its claimed score is rejected, so a forged score requires forging a paddle track
// that actually plays that well, which is just playing well.
const fs = require('fs');
const { makeTrial, decodeTrack } = require('./harness');

function verify(rec) {
  const problems = [];
  // v1 scored S.cap through Math.pow and the camera through Math.sin, both of
  // which are engine-dependent. Those runs cannot replay against this build.
  if (rec.v !== 2) problems.push('unsupported record version: ' + rec.v);

  const track = decodeTrack(rec.track);
  if (track.length !== rec.steps) {
    problems.push('track length ' + track.length + ' does not match claimed steps ' + rec.steps);
  }

  // Re-simulate at the recorded window size: the play area bounds the paddle and the
  // camera correction reads screen width, so replaying at another size is another run.
  const t = makeTrial(rec.w, rec.h);
  if (Math.abs(t.BB.record().step - rec.step) > 1e-12) {
    problems.push('step mismatch: record ' + rec.step + ', build ' + t.BB.record().step);
  }

  t.BB.begin(rec.seed);
  for (let i = 0; i < track.length; i++) t.BB.tick(track[i]);
  const S = t.BB.state;

  const checks = [
    ['ath', S.ath, rec.claim.ath],
    ['cap', S.cap, rec.claim.cap],
    ['climb', S.climb, rec.claim.climb],
    ['buys', S.buys, rec.claim.buys],
    ['best', S.best, rec.claim.best],
    ['t', S.t, rec.claim.t],
    ['tickets', S.tickets, rec.claim.tickets]
  ];
  for (const [name, got, claimed] of checks) {
    const ok = typeof got === 'number' && typeof claimed === 'number'
      ? Math.abs(got - claimed) <= Math.max(1e-9, Math.abs(claimed) * 1e-12)
      : got === claimed;
    if (!ok) problems.push(name + ': recomputed ' + got + ', claimed ' + claimed);
  }

  return { ok: problems.length === 0, problems, recomputed: S, ticks: track.length };
}

if (require.main === module) {
  const arg = process.argv[2];

  if (arg === '--self-test') {
    // Play a run through the real loop, take its record, then verify it as a server
    // would: from seed and track alone, in a fresh context.
    const play = makeTrial(1280, 720);
    const autoplay = (i, S) => S ? (S.head.x - S.cam.x) + Math.sin(i * 0.047) * 26 : 640;
    play.run(20260826, Number(process.argv[3] || 4000), 16, autoplay);
    const rec = play.BB.record();

    const raw = rec.steps * 2;
    const packed = Buffer.from(rec.track, 'base64').length;
    console.log('recorded run');
    console.log('  seed        ' + rec.seed);
    console.log('  ticks       ' + rec.steps + '  (' + (rec.steps / 120).toFixed(2) + 's)');
    console.log('  claim       ath=$' + (rec.claim.ath / 1e6).toFixed(1) + 'M  buys=' +
                rec.claim.buys + '  climb=' + Math.round(rec.claim.climb));
    console.log('  track       ' + packed + ' bytes packed, ' + raw + ' bytes as raw int16 (' +
                (packed / raw * 100).toFixed(0) + '%), ' +
                (packed / rec.steps).toFixed(2) + ' bytes/tick');
    console.log('  base64      ' + rec.track.length + ' chars');

    const r = verify(rec);
    console.log('');
    console.log('verify from seed + track only: ' + (r.ok ? 'PASS' : 'FAIL'));
    for (const p of r.problems) console.log('  ' + p);

    // A tampered claim must be rejected.
    const forged = JSON.parse(JSON.stringify(rec));
    forged.claim.ath = rec.claim.ath * 10;
    const f = verify(forged);
    console.log('forged 10x score rejected:     ' + (!f.ok ? 'PASS' : 'FAIL'));

    // Pairing a real claim with a different track must be rejected. Note that editing
    // a single tick usually changes nothing, and that is correct: at 120Hz the paddle
    // position on one tick out of thousands only matters if the chart is meeting it
    // right then. The property being enforced is that the claim matches the track, so
    // the test shifts the whole track.
    const shifted = decodeTrack(rec.track).map(x => x + 40);
    const swapped = verify(Object.assign({}, rec, { track: reencode(shifted) }));
    console.log('claim + different track:       ' + (!swapped.ok ? 'PASS (rejected)' : 'FAIL'));

    // Truncating the track must not pass as the full run.
    const cut = decodeTrack(rec.track).slice(0, rec.steps - 500);
    const short = verify(Object.assign({}, rec, { track: reencode(cut) }));
    console.log('truncated track:               ' + (!short.ok ? 'PASS (rejected)' : 'FAIL'));

    process.exit(r.ok && !f.ok && !swapped.ok && !short.ok ? 0 : 1);
  }

  if (!arg) {
    console.error('usage: node tools/verify.js <run.json> | --self-test');
    process.exit(2);
  }

  const rec = JSON.parse(fs.readFileSync(arg, 'utf8'));
  const r = verify(rec);
  console.log(r.ok ? 'VALID' : 'REJECTED');
  for (const p of r.problems) console.log('  ' + p);
  if (r.ok) {
    console.log('  ath   $' + r.recomputed.ath.toLocaleString('en-US', { maximumFractionDigits: 0 }));
    console.log('  buys  ' + r.recomputed.buys);
    console.log('  time  ' + r.recomputed.t.toFixed(1) + 's over ' + r.ticks + ' ticks');
  }
  process.exit(r.ok ? 0 : 1);
}

// Encoder mirror, for building tampered records in the self test.
function reencode(a) {
  const bytes = [];
  let prev = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - prev; prev = a[i];
    let z = d < 0 ? (-d * 2 - 1) : (d * 2);
    while (z > 127) { bytes.push((z & 127) | 128); z >>>= 7; }
    bytes.push(z);
  }
  return Buffer.from(bytes).toString('base64');
}

module.exports = { verify };
