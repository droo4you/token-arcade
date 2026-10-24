import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { GameRunConfig, GameRunResult } from "../../../packages/sdk/src/index.ts";
import { moodSwingsSeed, createEmonadVerifier, createTwoPlacesVerifier } from "../src/gameVerification.ts";

const requireSource = createRequire(import.meta.url);
const { makeTrial } = requireSource("../../../cartridges/emonad-cabinet/tools/harness.js") as {
  makeTrial(width: number, height: number): {
    run(seed: number, frames: number, frameMs: number, input: () => number): void;
    BB: { record(): Record<string, unknown>; state: { ath: number; buys: number; best: number; tickets: number; steps: number; shown: boolean } };
  };
};

function issued(gameId: string, objective: GameRunConfig["objective"], rules?: GameRunConfig["rules"]): GameRunConfig {
  return {
    gameId, gameVersion: "1.0.0", runId: "verified-test-run", mode: "ranked", objective,
    seed: "opaque-server-seed", startedAt: new Date(Date.now() - 30_000).toISOString(),
    ...(rules ? { rules } : {}),
  };
}

test("eMONAD accepts a terminal source replay and rejects forged or partial scores", async () => {
  const config = issued("emonad-cabinet", "score", { viewportWidth: 390, viewportHeight: 844 });
  const trial = makeTrial(390, 844);
  trial.run(moodSwingsSeed(config.seed!), 1_000, 16, () => 195);
  const record = trial.BB.record();
  const state = trial.BB.state;
  assert.equal(state.shown, true, "fixture reaches the original game over screen");
  const result: GameRunResult = {
    gameId: config.gameId, gameVersion: config.gameVersion, runId: config.runId,
    mode: config.mode, objective: config.objective, seed: config.seed,
    primaryMetric: Math.round(state.ath),
    secondaryMetrics: { buys: state.buys, bestStreak: state.best, collectibles: state.tickets, ticks: state.steps },
    result: "completed", startedAt: config.startedAt, finishedAt: new Date().toISOString(), proof: record,
  };
  const verifier = createEmonadVerifier();
  assert.deepEqual(await verifier.verify(config, result), { valid: true });
  assert.equal((await verifier.verify(config, { ...result, primaryMetric: result.primaryMetric + 1 })).valid, false);
  assert.equal((await verifier.verify(config, { ...result, proof: { ...record, tuned: true } })).valid, false);
  assert.equal((await verifier.verify(config, { ...result, proof: { ...record, seed: 42 } })).valid, false);

  const partial = makeTrial(390, 844);
  partial.run(moodSwingsSeed(config.seed!), 2, 16, () => 195);
  const partialState = partial.BB.state;
  const partialResult = {
    ...result,
    primaryMetric: Math.round(partialState.ath),
    secondaryMetrics: { buys: partialState.buys, bestStreak: partialState.best, collectibles: partialState.tickets, ticks: partialState.steps },
    proof: partial.BB.record(),
  };
  assert.equal((await verifier.verify(config, partialResult)).valid, false);
});

test("Two Places rejects missing completion and client-selected levels", async () => {
  const config = issued("two-places", "completion_time", { level: 0 });
  const result: GameRunResult = {
    gameId: config.gameId, gameVersion: config.gameVersion, runId: config.runId,
    mode: config.mode, objective: config.objective, seed: config.seed,
    primaryMetric: 1, secondaryMetrics: { ticks: 1, apples: 0, deaths: 0, levelsCompleted: 1 },
    result: "completed", startedAt: config.startedAt, finishedAt: new Date().toISOString(),
    proof: { v: 1, tracks: [[0]] },
  };
  const verifier = createTwoPlacesVerifier();
  assert.equal((await verifier.verify(config, result)).valid, false);
  assert.equal((await verifier.verify(config, { ...result, proof: { v: 1, tracks: [[1 << 22]] } })).valid, false);
  assert.equal((await verifier.verify({ ...config, mode: "raid", rules: { levelSet: "0,1,2" } }, result)).valid, false);
});

test("Two Places verifies the original level-one bot's inputs and millisecond score", async () => {
  const config = issued("second-two-places-cabinet", "completion_time", { level: 0 });
  const proof = JSON.parse(readFileSync(new URL("./fixtures/twoPlacesLevel1.json", import.meta.url), "utf8"));
  const ticks = proof.tracks[0].length - 1;
  const result: GameRunResult = {
    gameId: config.gameId, gameVersion: config.gameVersion, runId: config.runId,
    mode: config.mode, objective: config.objective, seed: config.seed,
    primaryMetric: Math.round(ticks * 1_000 / 60),
    secondaryMetrics: { ticks, apples: 2, deaths: 0, levelsCompleted: 1 },
    result: "completed", startedAt: config.startedAt, finishedAt: new Date().toISOString(), proof,
  };
  const verifier = createTwoPlacesVerifier();
  assert.deepEqual(await verifier.verify(config, result), { valid: true });
  assert.equal((await verifier.verify(config, { ...result, primaryMetric: result.primaryMetric - 1 })).valid, false);
  assert.equal((await verifier.verify(config, { ...result, secondaryMetrics: { ...result.secondaryMetrics!, apples: 3 } })).valid, false);
});
