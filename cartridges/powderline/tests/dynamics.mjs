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
  const sketchy = drop(0.25, 0.46);
  assert.equal(sketchy.landKind, 'sketchy');
  assert.equal(sketchy.combo, 1);
  assert.equal(sketchy.trickPoints, 0);
  const early = drop(0, 0.1);
  assert.equal(early.landKind, 'sketchy');
  assert.equal(early.combo, 1);
  assert.ok(early.trickPoints > 0);
  assert.ok(early.trickPoints < 24 * 2);
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
  s.yaw = 0.25;
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

function hangTime(seed, size, vz, boost) {
  let ramp = null;
  for (let i = 1; i < 48 && !ramp; i++) {
    for (const item of SIM.chunk(seed, i).ramps) {
      if ((item.size || 'M') === size) ramp = item;
    }
  }
  assert.ok(ramp, size);
  const box = SIM.kickerBox(ramp);
  const s = SIM.create(seed);
  s.x = ramp.x;
  s.z = box.lip - 0.05;
  s.vz = vz;
  s.iframe = 2;
  s.boost = 100;
  const code = SIM.pack(0, boost ? 1 : 0, 0);
  let predicted = 0;
  for (let n = 0; n < 500 && !s.over; n++) {
    SIM.step(s, code);
    if (!predicted && s.vy > 4 && s.y > 0.8) predicted = SIM.airtime(s);
    if (predicted && s.y <= 0) break;
  }
  return predicted;
}

test('kicker hang time follows size, lip speed, and boost', () => {
  const cruise = 24;
  const small = hangTime(4, 'S', cruise, false);
  const medium = hangTime(4, 'M', cruise, false);
  const large = hangTime(4, 'L', cruise, false);
  const popped = hangTime(4, 'M', cruise, true);
  assert.ok(small > 0.65 && small < 1.05, `S ${small}`);
  assert.ok(medium > 1.15 && medium < 1.75, `M ${medium}`);
  assert.ok(large > 2.0 && large < 2.9, `L ${large}`);
  assert.ok(popped >= 2.1, `boosted M ${popped}`);
  assert.ok(medium > small && large > medium);
});

test('tricks take their time, spins stack, and a repeat pays less', () => {
  const method = SIM.pack(0, 0, 5);
  const spin = SIM.pack(0, 0, 3);
  const flip = SIM.pack(0, 0, 2);
  const s = SIM.create(2);
  s.y = 8;
  s.vy = 1;
  s.vz = 22;
  SIM.step(s, method);
  assert.equal(s.trick && s.trick.name, 'Method');
  assert.equal(s.trick.dur, 0.3);
  const ticks = Math.ceil(0.3 / SIM.C.DT);
  for (let i = 0; i < ticks + 2; i++) SIM.step(s, 0);
  assert.equal(s.landKind, 'clean');
  const first = s.trickPoints;
  assert.equal(first, 18);
  assert.equal(s.combo, 2);
  SIM.step(s, method);
  for (let i = 0; i < ticks + 2; i++) SIM.step(s, 0);
  const second = s.trickPoints - first;
  assert.equal(second, Math.floor(18 * 0.55) * 2);
  assert.ok(second < 18 * 2);

  const spinning = SIM.create(2);
  spinning.y = 8;
  spinning.vy = 4;
  SIM.step(spinning, spin);
  assert.equal(spinning.trick.name, '360');
  SIM.step(spinning, 0);
  SIM.step(spinning, spin);
  assert.equal(spinning.trick.name, '540');
  assert.equal(spinning.trick.dur, 0.8);
  assert.equal(spinning.trick.spins, 2);

  const rodeo = SIM.create(2);
  rodeo.y = 8;
  rodeo.vy = 6;
  SIM.step(rodeo, flip);
  SIM.step(rodeo, 0);
  SIM.step(rodeo, spin);
  assert.equal(rodeo.trick.id, 'rodeo');
  assert.equal(rodeo.trick.dur, 1.1);

  const bail = SIM.create(2);
  bail.y = 0.05;
  bail.vy = -30;
  bail.trick = { id: 'backflip', name: 'Backflip', dur: 0.85, pts: 48, kind: 'flip', flip: 1, t: 0.2, scored: false, dir: 0, spins: 1 };
  SIM.step(bail, 0);
  assert.equal(bail.landKind, 'bail');
  assert.equal(bail.trickPoints, 0);
});

function jump(size, vz) {
  let ramp = null;
  for (let i = 1; i < 48 && !ramp; i++) {
    for (const item of SIM.chunk(6, i).ramps) if ((item.size || 'M') === size) ramp = item;
  }
  const box = SIM.kickerBox(ramp);
  const s = SIM.create(6);
  s.x = ramp.x;
  s.z = box.lip - 0.05;
  s.vz = vz;
  s.iframe = 2;
  s.boost = 80;
  return s;
}

test('a long hang slows the apex and a short kicker does not', () => {
  function slowFrames(size) {
    const s = jump(size, 24);
    let frames = 0;
    let airborne = false;
    for (let n = 0; n < 500 && !s.over; n++) {
      SIM.step(s, 0);
      if (s.y > 0.3) airborne = true;
      if (s.slow) frames += 1;
      if (airborne && s.y <= 0) break;
    }
    return frames;
  }
  assert.equal(slowFrames('S'), 0);
  const medium = slowFrames('M');
  assert.ok(medium >= 30 && medium <= 36, `medium window ${medium}`);
  const plain = jump('M', 24);
  const extended = jump('M', 24);
  let nudged = false;
  let plainSlow = 0;
  let extraSlow = 0;
  for (let n = 0; n < 700; n++) {
    const late = extended.slow && extended.slowLeft < 0.25 && extended.slowLeft > 0.05;
    const code = late && !nudged ? SIM.pack(0, 0, 5) : 0;
    if (code) nudged = true;
    SIM.step(plain, 0);
    SIM.step(extended, code);
    if (plain.slow) plainSlow += 1;
    if (extended.slow) extraSlow += 1;
    if (plain.y <= 0 && extended.y <= 0 && n > 20) break;
  }
  assert.equal(nudged, true);
  assert.ok(extraSlow > plainSlow, `plain ${plainSlow} extended ${extraSlow}`);
});

test('slow motion replays to the same trace', () => {
  function trace() {
    const s = jump('L', 26);
    const marks = [];
    const codes = [];
    for (let n = 0; n < 700 && !s.over; n++) {
      const code = s.slow && !s.trick && s.y > 2 ? SIM.pack(0, 0, 5) : 0;
      codes.push(code);
      SIM.step(s, code);
      marks.push((Math.round(s.y * 1000) << 1) ^ s.slow ^ (s.trickPoints << 8));
      if (n > 30 && s.y <= 0 && !s.slow) break;
    }
    return { codes, marks };
  }
  const first = trace();
  const again = jump('L', 26);
  const marks = [];
  for (const code of first.codes) {
    SIM.step(again, code);
    marks.push((Math.round(again.y * 1000) << 1) ^ again.slow ^ (again.trickPoints << 8));
  }
  assert.deepEqual(marks, first.marks);
  assert.ok(first.marks.some((mark) => mark & 1));
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
