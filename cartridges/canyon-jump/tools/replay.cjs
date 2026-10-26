#!/usr/bin/env node
/* Re-simulate a Canyon Jump replay headlessly and print what happened.
   Usage: node tools/replay.cjs <CJR1.code | file.txt | -> [--every 0.25] [--png outDir [--frames t1,t2,...]] [--json]
   Prints: header (level, seed, build, physics hash check), a timeline (t, phase, z, alt, AGL, speed, pitch angle, stick,
   AIR, thermal lift) every --every s plus every event (launch, boost, updraft, lip save, near miss, crash...), and the
   death cause with the 2 s before it. --png renders key frames through the browser (needs the preview server or
   BASE=http://127.0.0.1:8812/canyon-jump/ and playwright at /tmp/pw). */
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '../src');
const S0 = require(SRC + '/sim.js'), LV = require(SRC + '/levels.js'), RP = require(SRC + '/replay.js');
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
let src = args[0]; if (!src) { console.error('usage: node tools/replay.cjs <code|file|-> [--every 0.25] [--png dir]'); process.exit(2); }
const code = src === '-' ? fs.readFileSync(0, 'utf8') : fs.existsSync(src) ? fs.readFileSync(src, 'utf8') : src;

function simulate(data) {
  const level = LV.get(data.level || LV.DEFAULT), S = level.id === LV.DEFAULT ? S0 : S0.forLevel(level);
  const s = S.newRun(data.seed >>> 0), inputs = RP.inputs(data), rows = [], events = [];
  const every = Math.max(1, Math.round((+opt('--every') || 0.25) * 120));
  const row = (i, note) => ({ t: +s.t.toFixed(2), tick: s.tick, phase: s.phase, z: Math.round(s.z), alt: +(s.y || 0).toFixed(1), agl: +S.agl(s).toFixed(1),
    kmh: Math.round(S.speedOf(s) * 3.6), pitchDeg: +((s.gam || 0) * 57.3).toFixed(1), stick: i ? [i.pitch ?? ((i.up ? 1 : 0) - (i.down ? 1 : 0)), i.steer ?? ((i.right ? 1 : 0) - (i.left ? 1 : 0))] : null,
    air: s.air, lift: s.phase === 'sky' && S.updraftAt ? +S.updraftAt(s, s.x, s.y, s.z).toFixed(1) : 0, note });
  for (let k = 0; k < inputs.length && !s.over; k++) {
    const i = inputs[k]; S.step(s, i);
    for (const e of s.events) { const ev = Object.assign({ t: +s.t.toFixed(2) }, e); events.push(ev); if (!['lane', 'orb'].includes(e.e)) rows.push(row(i, e.e + (e.what ? ':' + e.what : '') + (e.reason ? ':' + e.reason : ''))); }
    s.events.length = 0;
    if (s.tick % every === 0) rows.push(row(i));
  }
  return { S, s, level, rows, events, score: S.score(s), inputsN: inputs.length };
}
function physicsHash(levelId) { const L = LV.get(levelId || LV.DEFAULT); return RP.hash(fs.readFileSync(SRC + '/sim.js', 'utf8') + JSON.stringify(L)); }

const data = RP.decode(code), out = simulate(data), sc = out.score;
const localHash = physicsHash(data.level), hashOk = !data.simHash || data.simHash === localHash;
if (args.includes('--json')) { console.log(JSON.stringify({ data: Object.assign({}, data, { rle: undefined }), score: sc, rows: out.rows, events: out.events, hashOk })); process.exit(0); }
console.log(`Canyon Jump replay · level ${out.level.id} · seed ${data.seed} · build ${data.build} · ${data.ticks} ticks (${(data.ticks / 120).toFixed(1)} s) · ${data.touch ? 'touch' : 'keys'} · ${data.at || ''}`);
console.log(`physics: recorded ${data.simHash || '?'} · local ${localHash} ${hashOk ? '✓ same sim' : '✗ DIFFERENT sim.js/level — outcome may differ (check out the recording build)'}`);
if (data.result) console.log(`recorded result: ${data.result.reason} total ${data.result.total} distance ${data.result.distance}  →  re-sim: ${sc.reason} total ${sc.total} distance ${sc.distance} ${data.result.total === sc.total && data.result.reason === sc.reason ? '✓ MATCH' : '✗ MISMATCH'}`);
console.log('\n   t  phase   z(m)   alt  AGL   km/h  pitch°  stick(p,s)  AIR  lift  event');
for (const r of out.rows) console.log(`${String(r.t).padStart(6)} ${r.phase.padEnd(5)} ${String(r.z).padStart(6)} ${String(r.alt).padStart(6)} ${String(r.agl).padStart(5)} ${String(r.kmh).padStart(5)} ${String(r.pitchDeg).padStart(7)}  ${r.stick ? r.stick.map(v => (+v).toFixed(2)).join(',').padEnd(10) : ''.padEnd(10)} ${String(r.air).padStart(4)} ${String(r.lift).padStart(5)}  ${r.note || ''}`);
const s = out.s, C = out.S.C, farRim = C.ROAD_LEN + C.CANYON_W;
console.log(`\nend: ${sc.reason} at t=${s.t.toFixed(2)} z=${Math.round(s.z)} (far rim ${farRim}, ${Math.round(s.z - farRim)} m) alt ${s.y.toFixed(1)} · total ${sc.total} = distance ${sc.distance} + pickups ${sc.pickups} + tricks ${sc.tricks} + landing ${sc.landing} + mach ${sc.mach}`);
const last = out.events.filter(e => e.e === 'crash' || e.e === 'splash').pop();
if (last) {
  const why = { wall: s.y > -10 ? `hit the far wall ${(-s.y).toFixed(1)} m below the lip` : 'hit a canyon wall', heli: 'collided with a tour helicopter', condor: 'collided with a condor', balloon: 'hit a hot air balloon', satellite: 'hit a satellite', bird: 'hit a bird', nosedive: 'landed nose-down past 32°', botched: 'landed mid-trick' }[last.what] || (last.e === 'splash' ? 'fell into the river' : last.what);
  console.log(`cause: ${why}`);
  const w = out.rows.filter(r => r.t >= s.t - 2);
  console.log('last 2 s: ' + w.map(r => `${r.t}s alt ${r.alt} ${r.kmh}km/h ${r.pitchDeg}° stick ${r.stick ? r.stick[0] : '-'}`).join(' | '));
}
const png = opt('--png');
if (png) {
  const frames = (opt('--frames') || '').split(',').filter(Boolean).map(Number);
  const launch = out.events.find(e => e.e === 'launch'), endT = s.t;
  const ts = frames.length ? frames : [launch ? launch.t + 1 : 5, (launch ? launch.t : 0) + (endT - (launch ? launch.t : 0)) / 2, Math.max(0, endT - 1.5), Math.max(0, endT - 0.3)];
  const { execFileSync } = require('child_process');
  execFileSync(process.execPath, [path.join(__dirname, 'replay-frames.mjs'), png, code.trim(), ts.join(',')], { stdio: 'inherit' });
}
