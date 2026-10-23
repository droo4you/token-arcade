import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const SIM = require('../src/sim.js');
const max = Object.fromEntries(SIM.UPGRADES.map(u => [u.id, 5]));
function airborne(v2) {
  const r = SIM.newRun(max, 7, v2);
  SIM.throwRock(r, 14, 1);
  r.chunks = 100000; r.alt = 3000; r.broke5k = r.broke10k = true;
  return r;
}
// Spend gas on control, never on coasting, with no refill from bounces.
const gas = airborne(true);
for (let i = 0; i < 120; i++) SIM.step(gas, {});
assert.equal(gas.gas, gas.s.gas);
for (let i = 0; i < 4000; i++) { gas.alt = 3000; SIM.step(gas, { tilt: 1 }); }
assert.equal(gas.gas, 0);
const coast = structuredClone(gas), empty = structuredClone(gas);
SIM.step(coast, {}); SIM.step(empty, { tilt: 1 });
assert.equal(empty.vx, coast.vx); assert.equal(empty.vy, coast.vy);
assert.ok(SIM.stats({ aero: 5 }).gas > SIM.stats({}).gas);

// Support remains usable beyond three contacts when taps are deliberate.
for (const [line, key] of [[SIM.ALT_5K, 'broke5k'], [SIM.ALT_10K, 'broke10k']]) {
  for (const v2 of [false, true]) {
    const r = airborne(v2);
    for (let i = 0; i < 25; i++) {
      r.alt = line + 0.01; r.vy = -20; r.vx = 500; r.t += 0.3;
      SIM.step(r, { skip: true });
    }
    assert.equal(r.skips, 25);
    assert.equal(r.perfects, 25);
    assert.ok(r.alt >= line, 'support must remain solid after repeated skilled contacts');
  }
}
const mash = airborne(true);
for (let i = 0; i < 60; i++) SIM.step(mash, { skip: true });
assert.equal(mash.pressT, -9);
const timed = airborne(true); SIM.step(timed, { skip: true });
assert.ok(timed.pressT >= 0);
for (const line of [SIM.ALT_5K, SIM.ALT_10K]) {
  const contact = (v2, lead) => {
    const r = airborne(v2);
    r.t = 1; r.pressT = 1 - lead; r.alt = line + 0.01; r.vy = -20; r.vx = 500;
    SIM.step(r, {}); return r;
  };
  assert.equal(contact(false, 0.12).perfects, 1);
  assert.equal(contact(true, 0.12).perfects, 0, 'wide-window early tap must miss on support');
  assert.equal(contact(true, 0.04).perfects, 1, 'precise early tap must succeed');
  const late = contact(true, 1);
  for (let i = 0; i < 12; i++) SIM.step(late, {});
  SIM.step(late, { skip: true });
  assert.equal(late.perfects, 0, 'late support correction must expire quickly');
  const spam = airborne(true);
  for (let i = 0; i < 1200; i++) SIM.step(spam, { skip: true });
  spam.alt = line + 0.01; spam.vy = -20; spam.vx = 500;
  const before = spam.perfects;
  SIM.step(spam, { skip: true });
  assert.equal(spam.perfects, before, 'mashing at contact must not award a perfect');
}

// Prove that existing competitive physics did not change, using the preserved submission.
const oldSource = execFileSync('git', ['show', 'a20c704:cartridges/skip-to-10k/src/sim.js'], { encoding: 'utf8' });
const context = { module: { exports: {} } }; vm.runInNewContext(oldSource, context);
const old = context.module.exports;
for (const seed of [1, 7, 42]) {
  const before = old.newRun(max, seed), after = SIM.newRun(max, seed);
  old.throwRock(before, 22, 1); SIM.throwRock(after, 22, 1);
  for (let i = 0; i < 12000; i++) {
    const input = { tilt: i % 240 < 120 ? 1 : -1, skip: i % 12 === 0, bounce: i === 120, rc: i === 480 };
    old.step(before, input); SIM.step(after, input);
  }
  assert.equal(JSON.stringify(SIM.results(after)), JSON.stringify(old.results(before)));
}
console.log('PASS: gas exhaustion, coast control, upgrade migration, sustained supports, anti-mash timing, and legacy replay parity');
