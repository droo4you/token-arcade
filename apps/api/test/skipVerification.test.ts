import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameRunConfig, GameRunResult } from "../../../packages/sdk/src/index.ts";
import { createSkipVerifier, decodeSkipInput, loadSkipSim, skipSeed, SKIP_HAND_ALT, SKIP_HAND_X } from "../src/skipVerification.ts";
import { AdapterRegistry } from "../src/verifiers.ts";

type BotSim = ReturnType<typeof loadSkipSim> & { botInput(run: unknown): { tilt: number; skip: boolean; bounce: boolean; rc: boolean } };
/** Plays like the cartridge: standard loadout, issued seed, integer tilt, one char per 120 Hz tick. */
export function skipBotRun(issued: string, trailing = 3) {
  const sim = loadSkipSim() as BotSim;
  const seed = skipSeed(issued);
  const run = sim.newRun(sim.STANDARD_LOADOUT, seed);
  const angle = 15.5, power = 1;
  sim.throwRock(run, angle, power, SKIP_HAND_X); run.alt = SKIP_HAND_ALT;
  let input = "", after = 0;
  while (after < trailing && input.length < 120 * 905) {
    if (run.phase === "done") after++;
    const b = sim.botInput(run);
    const code = (Math.round(b.tilt) + 1) | (b.skip ? 4 : 0) | (b.bounce ? 8 : 0) | (b.rc ? 16 : 0);
    input += String.fromCharCode(48 + code);
    sim.step(run, decodeSkipInput(code));
  }
  const r = sim.results(run);
  return { seed, angle, power, input, r, elapsedMs: Math.round(run.t * 1000) };
}
const issued = "skip-issued-seed-7";
const run = skipBotRun(issued);
const startedAt = new Date(Date.now() - run.input.length * (1000 / 120) - 5_000).toISOString();
const config = { runId: "s1", gameId: "skip-to-10k", gameVersion: "1.0.0", mode: "ranked", objective: "distance", seed: issued, startedAt, rules: { loadout: "standard-v1" } } as unknown as GameRunConfig;
const proof = (over: Record<string, unknown> = {}) => ({ v: 1, seed: run.seed, loadout: "standard-v1", angle: run.angle, power: run.power, input: run.input, ...over });
function result(p: unknown = proof(), over: Partial<GameRunResult> = {}): GameRunResult {
  return { runId: "s1", gameId: "skip-to-10k", gameVersion: "1.0.0", mode: "ranked", objective: "distance", result: "completed",
    primaryMetric: run.r.days, startedAt, finishedAt: new Date().toISOString(),
    secondaryMetrics: { peak: run.r.peak, skips: run.r.skips, perfects: run.r.perfects, bestStreak: run.r.bestStreak, gems: run.r.gems, elapsedMs: run.elapsedMs },
    proof: p, ...over } as unknown as GameRunResult;
}
const v = createSkipVerifier();

test("Skip to 10K: a standard-loadout run on the issued seed verifies", async () => {
  assert.ok(run.r.days > 0 && run.r.skips > 0, JSON.stringify(run.r));
  assert.deepEqual(await v.verify(config, result()), { valid: true });
});
test("Skip to 10K: forged score, upgraded stats and wrong loadout are rejected", async () => {
  assert.equal((await v.verify(config, result(proof(), { primaryMetric: run.r.days + 50 }))).valid, false);
  const forged = result(); forged.secondaryMetrics = { ...forged.secondaryMetrics, gems: 999 };
  assert.match((await v.verify(config, forged)).reason!, /details/);
  assert.equal((await v.verify(config, result(proof({ loadout: "maxed" })))).valid, false);
  assert.match((await v.verify({ ...config, rules: {} } as GameRunConfig, result())).reason!, /standard loadout/);
  assert.equal((await v.verify(config, result(proof({ power: 1.2 })))).valid, false);
});
test("Skip to 10K: partial, padded, wrong-seed and malformed replays are rejected", async () => {
  assert.match((await v.verify(config, result(proof({ input: run.input.slice(0, Math.floor(run.input.length / 2)) })))).reason!, /before the run was over/);
  assert.match((await v.verify(config, result(proof({ input: run.input + "1".repeat(40) })))).reason!, /after the run ended/);
  assert.match((await v.verify(config, result(proof({ seed: run.seed ^ 5 })))).reason!, /issued seed/);
  assert.equal((await v.verify(config, result(proof({ input: "3" + run.input.slice(1) })))).valid, false);
  assert.equal((await v.verify(config, result(null))).valid, false);
});
test("Skip to 10K adapter is registered with the standard loadout rule", () => {
  const a = new AdapterRegistry().get("skip-to-10k");
  assert.ok(a?.verifier);
  assert.deepEqual(a?.rankedRules, { loadout: "standard-v1" });
});
