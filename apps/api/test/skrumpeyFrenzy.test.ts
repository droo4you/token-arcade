import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sim = require("../../../cartridges/skrumpey-slide/releases/1.3.0/sim.js");
const old = require("../../../cartridges/skrumpey-slide/releases/1.2.0/sim.js");

function state(engine = sim, meter = 45, vx = 13, vy = 0, airborne = false) {
  const s = engine.create(123);
  Object.assign(s, { phase: "run", x: -20, y: airborne ? 100 : 6, ground: !airborne, vx, vy, nutMeter: meter });
  return s;
}
const speed = (s: { vx: number; vy: number }) => Math.hypot(s.vx, s.vy);

test("DN Frenzy gives one recovery kick at 45, with unchanged rain and magnet", () => {
  const below = state(sim, 44), active = state();
  sim.step(below, 0); sim.step(active, 0);
  assert.equal(below.frenzies, 0);
  assert.equal(active.frenzies, 1);
  assert.ok(Math.abs(speed(active) - speed(below) - 4) < 1e-10);
  assert.equal(active.frenzyT, 300);
  assert.equal(active.nutMeter, 0);
  const running = state(), runningFull = state();
  running.frenzyT = runningFull.frenzyT = 300;
  running.nutMeter = 0;
  sim.step(running, 0); sim.step(runningFull, 0);
  assert.equal(speed(runningFull), speed(running), "no repeated boost while Frenzy is active");
  assert.equal(runningFull.frenzies, 0);
  assert.equal(sim.P.frenzyMagnet, old.P.frenzyMagnet);
  assert.equal(sim.P.frenzyEvery, old.P.frenzyEvery);
});

test("Frenzy preserves movement direction and caps the added speed without slowing fast flight", () => {
  for (const [vx, vy] of [[20, 10], [79, 10], [90, 0]]) {
    const before = state(sim, 44, vx, vy, true), after = state(sim, 45, vx, vy, true);
    sim.step(before, 0); sim.step(after, 0);
    const expected = speed(before) >= 80 ? speed(before) : Math.min(80, speed(before) + 4);
    assert.ok(Math.abs(speed(after) - expected) < 1e-10);
    assert.ok(Math.abs(after.vx * before.vy - before.vx * after.vy) < 1e-10);
  }
});

test("the previous rules retain their original Frenzy speed and train bonus stays capped at 2.5x", () => {
  const a = state(old, 44), b = state(old, 45);
  old.step(a, 0); old.step(b, 0);
  assert.equal(speed(a), speed(b));
  assert.equal(b.frenzies, 1);
  assert.equal(sim.TM({ train: [0] }), 1.2);
  assert.equal(sim.TM({ train: Array(20).fill(0) }), 2.5);
});

test("1.3.0 complete runs containing Frenzy replay identically in every mode", () => {
  let activations = 0;
  for (const seed of [1, 42, 12345]) {
    const played = sim.create(seed);
    while (!played.over && played.tick < 36000) sim.step(played, sim.botInput(played));
    assert.equal(played.over, true);
    activations += played.frenzies;
    const expected = sim.result(played, "free");
    for (const mode of ["free", "ranked", "raid"]) {
      const replay = sim.create(seed);
      for (const input of played.inputs) sim.step(replay, input);
      assert.deepEqual({ ...sim.result(replay, mode), mode: "free" }, expected);
    }
  }
  assert.ok(activations > 0, "exercise naturally earned Frenzy activations");
});
