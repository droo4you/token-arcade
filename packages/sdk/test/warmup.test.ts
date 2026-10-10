import assert from "node:assert/strict";
import test from "node:test";
import { getWarmupSequence, scoreWarmupProof, WARMUP_ROUNDS } from "../src/warmup.ts";
import { validateRunResultShape } from "../src/validate.ts";
import { validFeeSplit } from "../src/platform.ts";
import { CartridgeHost } from "../src/host.ts";
import type { GameRunConfig } from "../src/index.ts";

test("warmup sequence is seeded and its score is recomputed from inputs", () => {
  const sequence = getWarmupSequence("raid-seed");
  assert.equal(sequence.length, WARMUP_ROUNDS);
  assert.deepEqual(sequence, getWarmupSequence("raid-seed"));
  assert.notDeepEqual(sequence, getWarmupSequence("other-seed"));
  const proof = { choices: sequence, timesMs: sequence.map((_, index) => 250 + index * 200) };
  assert.deepEqual(scoreWarmupProof("raid-seed", proof), { valid: true, score: 1200, durationMs: 2450 });
  assert.equal(scoreWarmupProof("other-seed", proof).score < 1200, true);
});

test("warmup rejects impossible or incomplete traces", () => {
  const choices = getWarmupSequence("seed");
  assert.equal(scoreWarmupProof("seed", { choices, timesMs: [100] }).valid, false);
  assert.equal(scoreWarmupProof("seed", { choices, timesMs: choices.map((_, index) => index * 10) }).valid, false);
  assert.equal(scoreWarmupProof("seed", { choices: [...choices.slice(0, -1), 8], timesMs: choices.map((_, index) => 200 + index * 100) }).valid, false);
});

test("run shape must match the issued session", () => {
  const config: GameRunConfig = { runId: "run-1", gameId: "arcade-warmup", gameVersion: "1.0.0", mode: "ranked", objective: "score", seed: "seed", startedAt: "2026-10-08T10:00:00.000Z" };
  const result = { ...config, primaryMetric: 900, result: "completed", finishedAt: "2026-10-08T10:00:12.000Z" };
  assert.equal(validateRunResultShape(config, result).valid, true);
  assert.equal(validateRunResultShape(config, { ...result, runId: "another" }).valid, false);
  assert.equal(validateRunResultShape(config, { ...result, primaryMetric: Number.POSITIVE_INFINITY }).valid, false);
});

test("fee routing requires an explicit complete allocation", () => {
  assert.equal(validFeeSplit({ prize: 6000, community: 2000, treasury: 2000 }), true);
  assert.equal(validFeeSplit({ prize: 6000, community: 2000, treasury: 1000 }), false);
  assert.equal(validFeeSplit({ prize: -1, community: 5001, treasury: 5000 }), false);
});

test("cartridge host cleans up a mount that finishes after the screen is closed", async () => {
  let resolveMount!: () => void;
  const mounted = new Promise<void>((resolve) => { resolveMount = resolve; });
  let destroyed = 0;
  let subscribed = 0;
  const cartridge = {
    mount: () => mounted,
    start: () => {}, pause: () => {}, resume: () => {}, restart: () => {},
    destroy: () => { destroyed += 1; },
    onRunComplete: () => { subscribed += 1; return () => {}; },
  };
  const host = new CartridgeHost();
  const config: GameRunConfig = { runId: "1", gameId: "test", gameVersion: "1", mode: "free", objective: "score", startedAt: new Date().toISOString() };
  const pending = host.mount(cartridge, {} as HTMLElement, config, () => {});
  host.destroy();
  assert.equal(destroyed, 1, "navigation must destroy a pending cartridge before its handshake completes");
  resolveMount();
  await pending;
  host.start();
  assert.equal(destroyed, 1);
  assert.equal(subscribed, 0);
});
