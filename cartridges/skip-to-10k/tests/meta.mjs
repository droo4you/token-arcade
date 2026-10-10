// Copy + data checks: every string renders in the bitmap font, news is in date order, missions are sane.
// node tests/meta.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const META = require('../src/meta.js'), SIM = require('../src/sim.js');
const sb = {}; vm.createContext(sb);
vm.runInContext(fs.readFileSync('src/font.js', 'utf8') + ';this.GLYPHS = GLYPHS;', sb);
const ok = s => [...String(s).toUpperCase()].every(ch => ch in sb.GLYPHS);
const strings = [
  ...META.NEWS.map(n => n.text), ...META.MISSIONS.map(m => m.text), ...META.RANKS,
  ...Object.values(META.BANTER).flat(), ...SIM.ERAS.flatMap(e => [e.name, e.sub]), ...SIM.UPGRADES.flatMap(u => [u.name, u.desc]),
];
// string literals passed to the draw helpers in the browser files
for (const f of ['src/main.js', 'src/art.js']) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:drawText\w*|lab|addText|showBanner)\(ctx?,?\s*'([^']*)'/g)) strings.push(m[1]);
  for (const m of src.matchAll(/\['([A-Z0-9 .,!?'%-]{6,})'/g)) strings.push(m[1]);
}
let bad = strings.filter(s => !ok(s));
let fail = 0;
if (bad.length) { console.log('unrenderable:', bad); fail++; }
for (let i = 1; i < META.NEWS.length; i++) if (META.NEWS[i].day < META.NEWS[i - 1].day) { console.log('news out of order', META.NEWS[i]); fail++; }
if (META.NEWS[META.NEWS.length - 1].day !== SIM.TODAY_DAY) { console.log('today mismatch', META.NEWS.at(-1).day, SIM.TODAY_DAY); fail++; }
const long = META.NEWS.filter(n => n.text.length * 6 > 480 - 124);
if (long.length) { console.log('news too wide', long.map(n => n.text)); fail++; }
// missions complete in order and pay out
const save = { missions: [], rocks: [1], gwei: 0 };
const r = { skips: 99, days: 99999, bestStreak: 99, gems: 999, broke5k: true, broke10k: true };
const c = { line: 1, rejected: 9, 't:MINI PUMP': 1, 't:WHALE BUY': 1, fork: 1, airdrop: 1, yacht: 1, kevin: 1, bat: 1, suit: 3, skrump: 3, dump: 3 };
for (let k = 0; k < 20; k++) META.complete(save, r, c);
if (save.missions.length !== META.MISSIONS.length) { console.log('missions stuck at', save.missions.length); fail++; }
// rock prices climb
const p = [1, 10, 50].map(META.rockPrice);
console.log('rock prices at 1/10/50 owned:', p.join(', '), '| news items', META.NEWS.length, '| missions', META.MISSIONS.length);
console.log(fail ? 'FAIL' : 'meta ok');
process.exit(fail ? 1 : 0);
