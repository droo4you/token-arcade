import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const SIM = createRequire(import.meta.url)('../releases/1.1.0/src/sim.js');

function replay(seed) {
  const run = SIM.botRun(seed);
  const again = SIM.create(seed);
  for (let i = 0; i < run.input.length; i++) SIM.step(again, SIM.ALPHA.indexOf(run.input[i]));
  return { run, again: SIM.result(again) };
}

test('Powderline 1.1.0 is powderline-v2 and replays to the same integers', () => {
  assert.equal(SIM.RULESET, 'powderline-v2');
  assert.equal(SIM.RULES_VERSION, '1.1.0');
  const scores = new Set();
  for (const seed of [1, 11, 42]) {
    const first = replay(seed);
    const second = replay(seed);
    assert.deepEqual(first.again, first.run.result);
    assert.equal(first.run.input, second.run.input);
    assert.equal(first.run.result.cause, 'avalanche');
    for (const key of ['score', 'distance', 'trickPoints', 'bestCombo', 'crashes', 'boosts', 'ticks']) {
      assert.equal(Number.isInteger(first.run.result[key]), true, key);
    }
    assert.equal(first.run.result.score, first.run.result.distance + first.run.result.trickPoints);
    assert.ok(first.run.result.distance > 200);
    scores.add(first.run.result.score);
  }
  assert.ok(scores.size > 1);
});

test('a finished trick builds the combo and a mid-spin landing is sketchy', () => {
  function drop(yaw, trickT) {
    const s = SIM.create(9);
    s.y = 0.05;
    s.vy = -40;
    s.yaw = yaw;
    s.combo = 2;
    s.trick = { kind: 1, name: 'Method', id: 'method', pts: 24, dur: 0.46, t: trickT, chain: 1 };
    SIM.step(s, 0);
    return s;
  }
  const clean = drop(0.02, 0.46);
  assert.equal(clean.landKind, 'clean');
  assert.equal(clean.combo, 3);
  assert.ok(clean.trickPoints >= 24);
  const sketchy = drop(0.4, 0.46);
  assert.equal(sketchy.landKind, 'sketchy');
  assert.equal(sketchy.combo, 1);
  assert.equal(sketchy.trickPoints, 0);
  const early = drop(0, 0.1);
  assert.equal(early.landKind, 'bail');
  assert.equal(early.combo, 1);
});

test('threading a gate pays points and a crooked landing drops the combo', () => {
  const gate = SIM.gateAt(1, 4);
  assert.ok(gate);
  const s = SIM.create(1);
  s.z = gate.z - 0.2;
  s.x = (gate.x0 + gate.x1) / 2;
  s.vz = 24;
  const before = s.trickPoints;
  SIM.step(s, 0);
  assert.ok(s.trickPoints > before);
  s.yaw = 0.45;
  s.y = 0.05;
  s.vy = -40;
  s.trick = { kind: 1, name: 'Method', id: 'method', pts: 24, dur: 0.46, t: 0.46, chain: 1 };
  s.combo = 4;
  SIM.step(s, 0);
  assert.equal(s.landKind, 'sketchy');
  assert.equal(s.combo, 1);
});

test('a one-frame tap nudges and a held steer crosses a lane in about 0.7 s', () => {
  const tap = SIM.create(3);
  SIM.step(tap, 2);
  for (let i = 0; i < 120; i++) SIM.step(tap, 0);
  assert.ok(Math.abs(tap.x) < 0.3, `tap moved ${tap.x}`);
  const hold = SIM.create(3);
  let ticks = 0;
  while (hold.x < 4.15 && ticks < 180) {
    SIM.step(hold, 2);
    ticks += 1;
  }
  const seconds = ticks / 60;
  assert.ok(seconds >= 0.6 && seconds <= 0.8, `lane took ${seconds}`);
  assert.ok(hold.steerMag > 0.95);
});

test('every ramp crossing inside the drawn footprint launches', () => {
  for (const seed of [1, 4, 11, 42]) {
    const ramps = [];
    for (let i = 1; i < 24; i++) for (const ramp of SIM.chunk(seed, i).ramps) ramps.push(ramp);
    assert.ok(ramps.length > 0);
    for (const ramp of ramps) {
      const box = SIM.kickerBox(ramp);
      for (const x of [ramp.x, box.x0 + 0.04, box.x1 - 0.04]) {
        const s = SIM.create(seed);
        s.x = x;
        s.z = box.tail - 0.4;
        s.vz = 26;
        s.iframe = 1;
        s.sinceRamp = 0;
        let launched = false;
        for (let n = 0; n < 90 && !s.over; n++) {
          SIM.step(s, 0);
          if (s.vy > 4 && s.y > 0.8) { launched = true; break; }
        }
        assert.ok(launched, `seed ${seed} lip ${box.lip} x ${x} y ${s.y}`);
      }
      const miss = SIM.create(seed);
      miss.x = box.x1 + 0.35;
      miss.z = box.tail - 0.4;
      miss.vz = 26;
      miss.iframe = 1;
      let launched = false;
      for (let n = 0; n < 90 && miss.z < box.lip + 1; n++) {
        SIM.step(miss, 0);
        if (miss.vy > 4 && miss.y > 0.8) launched = true;
      }
      assert.equal(launched, false, `seed ${seed} outside ${box.lip}`);
    }
  }
});

test('a near miss inside 4 m pays once', () => {
  const s = SIM.create(2);
  s.gap = 3.5;
  SIM.step(s, 0);
  const paid = s.trickPoints;
  assert.ok(paid >= 12);
  SIM.step(s, 0);
  assert.equal(s.trickPoints, paid);
});
