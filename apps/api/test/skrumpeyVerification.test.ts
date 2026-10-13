import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameRunConfig, GameRunResult } from "../../../packages/sdk/src/index.ts";
import { createSkrumpeyVerifier, loadSkrumpeySim, skrumpeySeed } from "../src/skrumpeyVerification.ts";
import { AdapterRegistry } from "../src/verifiers.ts";

type BotSim = ReturnType<typeof loadSkrumpeySim> & { botInput(s: unknown): number };
function botRun(issued: string) {
  const sim = loadSkrumpeySim() as BotSim;
  const seed = skrumpeySeed(issued);
  const s = sim.create(seed);
  let input = "";
  while (!s.over && input.length < 60 * 60 * 10) { const b = sim.botInput(s) | 0; input += String.fromCharCode(48 + (b & 15)); sim.step(s, b); }
  const r = sim.result(s, "bot") as Record<string, number>;
  return { seed, input, r };
}
const issued = "skrumpey-test-seed-1";
const run = botRun(issued);
const startedAt = new Date(Date.now() - run.input.length * (1000 / 60) - 5_000).toISOString();
const config = { runId: "r1", gameId: "skrumpey-slide", gameVersion: "1.0.0", mode: "ranked", objective: "score", seed: issued, startedAt } as unknown as GameRunConfig;
function result(over: Partial<GameRunResult> = {}, proof: unknown = { v: 1, seed: run.seed, input: run.input }): GameRunResult {
  const r = run.r;
  return { runId: "r1", gameId: "skrumpey-slide", gameVersion: "1.0.0", mode: "ranked", objective: "score", result: "completed",
    primaryMetric: r.score, startedAt, finishedAt: new Date().toISOString(),
    secondaryMetrics: { distance: r.distance, bestCombo: r.bestCombo, perfects: r.perfects, collectibles: r.gems, kills: r.kills, hits: r.hits, falls: r.falls, rescued: r.rescued, trainBest: r.trainBest, ticks: r.endTick },
    proof, ...over } as unknown as GameRunResult;
}
const v = createSkrumpeyVerifier();

test("Skrumpey Slide: a complete bot run on the issued seed verifies", async () => {
  assert.ok(run.r.score > 0 && run.input.length > 600);
  assert.deepEqual(await v.verify(config, result()), { valid: true });
});
test("Skrumpey Slide: forged score / details are rejected", async () => {
  assert.equal((await v.verify(config, result({ primaryMetric: run.r.score + 1 }))).valid, false);
  const forged = result(); forged.secondaryMetrics = { ...forged.secondaryMetrics, rescued: 99 };
  assert.match((await v.verify(config, forged)).reason!, /details/);
});
test("Skrumpey Slide: partial, padded, wrong-seed and malformed replays are rejected", async () => {
  assert.match((await v.verify(config, result({}, { v: 1, seed: run.seed, input: run.input.slice(0, -30) }))).reason!, /before the run was over/);
  assert.match((await v.verify(config, result({}, { v: 1, seed: run.seed, input: run.input + "0000" }))).reason!, /after the run ended/);
  assert.match((await v.verify(config, result({}, { v: 1, seed: run.seed ^ 1, input: run.input }))).reason!, /issued seed/);
  assert.match((await v.verify({ ...config, seed: "another-session" } as GameRunConfig, result())).reason!, /issued seed/);
  assert.equal((await v.verify(config, result({}, { v: 1, seed: run.seed, input: run.input.replace(/./, "z") }))).valid, false);
  assert.equal((await v.verify(config, result({}, null))).valid, false);
});
test("Skrumpey Slide: a replay longer than the elapsed session time is rejected", async () => {
  const fresh = { ...config, startedAt: new Date().toISOString() } as GameRunConfig;
  assert.match((await v.verify(fresh, result({ startedAt: fresh.startedAt }))).reason!, /duration/);
});
test("Skrumpey Slide adapter is registered with a verifier", () => {
  assert.ok(new AdapterRegistry().get("skrumpey-slide")?.verifier);
});
