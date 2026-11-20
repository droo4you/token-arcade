import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SIM = require(join(root, 'src/sim.js'));
const INPUT = require(join(root, 'src/input.js'));

function pop(mask) {
  let n = 0;
  for (let i = 0; i < 5; i++) if (mask & (1 << i)) n += 1;
  return n;
}

function nextGate(state) {
  let best = null;
  for (let i = 0; i < state.gates.length; i++) {
    const gate = state.gates[i];
    if (gate.hit < state.tick) continue;
    if (!best || gate.hit < best.hit) best = gate;
  }
  return best;
}

function lateBot(state) {
  const gate = nextGate(state);
  if (!gate || gate.hit !== state.tick) return 0;
  if (gate.open & (1 << state.slot)) return 0;
  for (let i = 0; i < 5; i++) {
    if (gate.open & (1 << i)) return i === 0 ? 5 : i;
  }
  return 0;
}

function play(seed, ticks, commandAt) {
  const state = SIM.create(seed);
  const events = [];
  const gates = new Map();
  const absorb = () => {
    for (let i = 0; i < state.gates.length; i++) {
      const gate = state.gates[i];
      if (!gates.has(gate.hit)) gates.set(gate.hit, { hit: gate.hit, open: gate.open, motif: gate.motif });
    }
  };
  while (state.alive && state.tick < ticks) {
    absorb();
    const command = commandAt(state);
    if (command) events.push([state.tick, command]);
    SIM.step(state, command);
  }
  absorb();
  return { state, events, gates: [...gates.values()].sort((a, b) => a.hit - b.hit) };
}

test('same seed and input log replay to the same score and hash', () => {
  const events = [[12, 1], [40, 2], [70, 5], [110, 4], [160, 3], [220, 1], [300, 5]];
  const a = SIM.replay(123456, events, 480);
  const b = SIM.replay(123456, events, 480);
  assert.equal(a.score, b.score);
  assert.equal(SIM.hashState(a), SIM.hashState(b));
  assert.equal(a.slot, b.slot);
  assert.equal(a.distance, b.distance);
  assert.equal(a.clears, b.clears);
  assert.equal(a.tick, b.tick);
  assert.equal(Number.isInteger(a.score), true);
  assert.equal(Number.isInteger(a.distance), true);
  const other = SIM.replay(77, events, 480);
  assert.notEqual(SIM.hashState(other), SIM.hashState(a));
  const stepped = SIM.create(123456);
  let index = 0;
  while (stepped.alive && stepped.tick < 480) {
    let command = 0;
    while (index < events.length && events[index][0] === stepped.tick) {
      command = events[index][1];
      index += 1;
    }
    SIM.step(stepped, command);
  }
  assert.equal(stepped.score, a.score);
  assert.equal(SIM.hashState(stepped), SIM.hashState(a));
});

test('verifier accepts a real proof and rejects a forged score', () => {
  const events = [[20, 1], [80, 4], [140, 5], [350, 1]];
  const state = SIM.replay(99, events, 360);
  const proof = {
    format: SIM.PROOF_FORMAT,
    tickHz: 60,
    simVersion: SIM.SIM_VERSION,
    seed: 99,
    events,
    endTick: 360,
    score: state.score,
    hash: SIM.hashState(state),
  };
  const ok = SIM.verifyProof(proof);
  assert.equal(ok.ok, true);
  assert.equal(ok.score, state.score);
  const forged = SIM.verifyProof({ ...proof, score: proof.score + 9 });
  assert.equal(forged.ok, false);
  assert.equal(forged.reason, 'score');
  const early = SIM.replay(1, [[10, 1]], 50);
  const still = SIM.replay(1, [], 50);
  assert.equal(early.slot, 1);
  assert.equal(still.slot, 0);
  assert.notEqual(SIM.hashState(early), SIM.hashState(still));
  const swapped = SIM.verifyProof({
    format: SIM.PROOF_FORMAT,
    tickHz: 60,
    simVersion: SIM.SIM_VERSION,
    seed: 1,
    events: [[10, 1]],
    endTick: 50,
    score: still.score,
    hash: SIM.hashState(still),
  });
  assert.equal(swapped.ok, false);
});

test('all five phase slots stick until a new command, and center is a tap', () => {
  for (const edge of [1, 2, 3, 4]) {
    const state = SIM.create(9);
    SIM.step(state, edge);
    assert.equal(state.slot, edge);
    for (let n = 0; n < 15; n++) SIM.step(state, 0);
    assert.equal(state.slot, edge);
    SIM.step(state, 5);
    assert.equal(state.slot, 0);
    for (let n = 0; n < 8; n++) SIM.step(state, 0);
    assert.equal(state.slot, 0);
  }
  const tour = SIM.create(4);
  const seen = new Set([tour.slot]);
  for (const command of [1, 2, 3, 4, 5]) {
    SIM.step(tour, command);
    seen.add(tour.slot);
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), [0, 1, 2, 3, 4]);
});

test('keys, swipes, and gamepad flicks cover the five commands', () => {
  assert.equal(INPUT.commandFromKey('ArrowUp'), 1);
  assert.equal(INPUT.commandFromKey('KeyW'), 1);
  assert.equal(INPUT.commandFromKey('ArrowRight'), 2);
  assert.equal(INPUT.commandFromKey('KeyD'), 2);
  assert.equal(INPUT.commandFromKey('ArrowDown'), 3);
  assert.equal(INPUT.commandFromKey('KeyS'), 3);
  assert.equal(INPUT.commandFromKey('ArrowLeft'), 4);
  assert.equal(INPUT.commandFromKey('KeyA'), 4);
  assert.equal(INPUT.commandFromKey('Space'), 5);
  assert.equal(INPUT.commandFromKey('KeyC'), 5);
  assert.equal(INPUT.commandFromKey('ShiftLeft'), 5);
  assert.equal(INPUT.commandFromKey('ShiftRight'), 5);
  assert.equal(INPUT.commandFromKey('KeyM'), 0);

  assert.equal(INPUT.commandFromSwipe(0, -80, 80, 90), 1);
  assert.equal(INPUT.commandFromSwipe(90, 4, 90, 80), 2);
  assert.equal(INPUT.commandFromSwipe(0, 70, 70, 100), 3);
  assert.equal(INPUT.commandFromSwipe(-64, 3, 64, 70), 4);
  assert.equal(INPUT.commandFromSwipe(2, -1, 2, 40), 5);
  assert.equal(INPUT.commandFromSwipe(0, 0, 0, 500), 0);

  const up = { buttons: [], axes: [0, 0] };
  up.buttons[12] = { pressed: true };
  let pad = INPUT.pollGamepad(INPUT.freshPad(), up);
  assert.equal(pad.command, 1);
  pad = INPUT.pollGamepad(pad.state, up);
  assert.equal(pad.command, 0);
  const south = { buttons: [], axes: [0, 0] };
  south.buttons[0] = { pressed: true };
  pad = INPUT.pollGamepad(pad.state, south);
  assert.equal(pad.command, 5);

  let stick = INPUT.pollGamepad(INPUT.freshPad(), { buttons: [], axes: [0.9, 0] });
  assert.equal(stick.command, 2);
  stick = INPUT.pollGamepad(stick.state, { buttons: [], axes: [0.9, 0] });
  assert.equal(stick.command, 0);
  stick = INPUT.pollGamepad(stick.state, { buttons: [], axes: [0.05, 0] });
  assert.equal(stick.command, 0);
  stick = INPUT.pollGamepad(stick.state, { buttons: [], axes: [0, 0.8] });
  assert.equal(stick.command, 3);
  stick = INPUT.pollGamepad(INPUT.freshPad(), { buttons: [], axes: [-0.7, 0.1] });
  assert.equal(stick.command, 4);
  stick = INPUT.pollGamepad(INPUT.freshPad(), { buttons: [], axes: [0.1, -0.85] });
  assert.equal(stick.command, 1);
});

test('obstacles stay fair and the chart does not depend on input', () => {
  const seeds = [1, 2, 7, 11, 42, 99, 256, 1024, 7777, 12345];
  for (const seed of seeds) {
    const run = play(seed, 9000, lateBot);
    assert.equal(run.state.alive, true, 'seed ' + seed + ' died at ' + run.state.tick + ' score ' + run.state.score);
    assert.equal(run.gates.length > 20, true);
    let previous = null;
    let early = 0;
    for (const gate of run.gates) {
      assert.equal(gate.open > 0 && gate.open <= 31, true, 'mask ' + gate.open);
      assert.equal(pop(gate.open) >= 1, true);
      if (previous) {
        const gap = gate.hit - previous.hit;
        assert.equal(gap >= SIM.minGapAt(gate.hit), true, 'gap ' + gap + ' at ' + gate.hit);
      }
      if (gate.hit < 1800) {
        early += 1;
        assert.equal(pop(gate.open) >= 4, true, 'opening gate ' + gate.motif + ' ' + gate.open);
      }
      previous = gate;
    }
    assert.equal(early > 8, true);
    assert.equal(run.gates[0].hit >= 90 && run.gates[0].hit <= 220, true);
    const passed = run.gates.filter((gate) => gate.hit < run.state.tick);
    assert.equal(run.state.clears, passed.length);
    const idle = play(seed, 2400, () => 0);
    const limit = Math.min(idle.state.tick, run.state.tick);
    const key = (gates) => gates.filter((gate) => gate.hit < limit).map((gate) => gate.hit + ':' + gate.open).join('|');
    assert.equal(key(run.gates), key(idle.gates));
  }
});

test('expert phrases include sweeps, center-out, one-slot openings, and edge holds', () => {
  const run = play(1, 12000, lateBot);
  assert.equal(run.state.alive, true);
  const ring = [2, 4, 8, 16];
  let sweep = false;
  let center = false;
  let narrow = false;
  let hold = false;
  for (let i = 0; i < run.gates.length; i++) {
    const gate = run.gates[i];
    if (gate.motif === 'sweep') assert.equal(ring.includes(gate.open), true);
    if (gate.motif === 'narrow') {
      assert.equal(pop(gate.open), 1);
      narrow = true;
    }
    if (gate.motif === 'wide' || gate.motif === 'breath') assert.equal(pop(gate.open) >= 4, true);
    if (i + 3 < run.gates.length) {
      const seq = [0, 1, 2, 3].map((k) => run.gates[i + k].open);
      for (let s = 0; s < 4; s++) {
        const rot = [0, 1, 2, 3].map((k) => ring[(s + k) % 4]);
        if (seq.every((open, k) => open === rot[k])) sweep = true;
      }
      const a = run.gates[i];
      const b = run.gates[i + 1];
      const c = run.gates[i + 2];
      const d = run.gates[i + 3];
      if (a.open === 1 && c.open === 1 && ring.includes(b.open) && ring.includes(d.open)) center = true;
    }
    if (i + 5 < run.gates.length) {
      const open = run.gates[i].open;
      if (ring.includes(open) && [1, 2, 3, 4, 5].every((k) => run.gates[i + k].open === open)) hold = true;
    }
  }
  assert.equal(sweep, true, 'missing cardinal sweep');
  assert.equal(center, true, 'missing center-out');
  assert.equal(narrow, true, 'missing one-slot opening');
  assert.equal(hold, true, 'missing edge hold');
});

test('a center-only run crashes, and the chart stays ahead of the player', () => {
  let crashed = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const run = play(seed, 2400, () => 0);
    if (!run.state.alive && run.state.clears >= 0) crashed += 1;
    assert.equal(run.gates[0].hit > 48, true);
  }
  assert.equal(crashed >= 28, true, 'only ' + crashed + ' idle runs crashed');
});

test('scored sources stay free of clock and math random', () => {
  const sim = readFileSync(join(root, 'src/sim.js'), 'utf8');
  assert.equal(sim.includes('Math.random'), false);
  assert.equal(sim.includes('Date.now'), false);
  assert.equal(sim.includes('performance.now'), false);
  const hash = createHash('sha256').update(sim).digest('hex');
  const manifest = JSON.parse(readFileSync(join(root, 'cartridge.json'), 'utf8'));
  assert.equal(manifest.simHash, 'sha256:' + hash);
  assert.equal(manifest.id, 'phantom-phase');
  assert.equal(manifest.version, '1.0.0');
  assert.equal(manifest.supportedModes.includes('free_play'), true);
  assert.equal(manifest.determinism, 'replayable-portable');
  assert.equal(manifest.tickHz, 60);
  assert.equal(manifest.verifier.kind, 'replay');
});

test('presentation sources skip glow, bloom, and generic hero fonts', () => {
  const files = ['index.html', 'arcade.html', 'src/render.js', 'src/main.js', 'src/audio.js'];
  const banned = ['shadowBlur', 'system-ui', 'Geist', 'bloom', 'drop-shadow'];
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    for (const word of banned) assert.equal(text.includes(word), false, file + ' contains ' + word);
    assert.equal(/\bInter\b/.test(text), false, file);
  }
});
