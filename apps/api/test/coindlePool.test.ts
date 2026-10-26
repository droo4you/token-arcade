import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import type { GameRunConfig, GameRunResult } from "../../../packages/sdk/src/index.ts";
import { createCoindleRapid, RAPID_RAID_RULES, RAPID_V2_RULES, RAID_POOL_SIZE } from "../src/coindleRapid.ts";

test("Coindle raid pool is private, stable on restart, unique per raid and independently drawn per attempt", () => {
  const db = new DatabaseSync(":memory:");
  try {
    let n = 0;
    const sessions = new Map<string, GameRunConfig>();
    for (const [runId, raidId] of [["a", "raid-a"], ["b", "raid-a"], ["c", "raid-b"]]) sessions.set(runId, {
      runId, raidId, gameId: "coindle", gameVersion: "1.1.0", mode: "raid", objective: "coins_solved",
      seed: "same-public-seed-is-not-an-answer-seed", maxAttempts: 3, rules: RAPID_RAID_RULES, startedAt: new Date(0).toISOString(), expiresAt: new Date(600000).toISOString(),
    });
    const options = { db, now: () => 0, prices: async () => ({}), pick: (count: number) => (n++ * 17 + 3) % count,
      getSession: (id: string) => sessions.has(id) ? { playerId: id, config: sessions.get(id)! } : undefined };
    let rapid = createCoindleRapid(options);
    const pool = (id: string): string[] => JSON.parse((db.prepare("SELECT json FROM coindle_raid_pools WHERE raid_id = ?").get(id) as { json: string }).json);
    const ledger = (id: string) => JSON.parse((db.prepare("SELECT json FROM coindle_rapid WHERE run_id = ?").get(id) as { json: string }).json);
    const start = rapid.start("a");
    const firstPool = pool("raid-a");
    assert.equal(firstPool.length, RAID_POOL_SIZE);
    assert.equal(new Set(firstPool).size, RAID_POOL_SIZE);
    assert.equal("answer" in start || "pool" in start || "raidPoolId" in start || "used" in start, false);
    const firstAnswer = ledger("a").current.answer;
    assert.equal(JSON.stringify(start).includes(`"${firstAnswer}"`), false);
    rapid = createCoindleRapid(options);
    assert.deepEqual(rapid.start("a"), start, "restart does not reset the clock or first puzzle");
    assert.deepEqual(pool("raid-a"), firstPool);
    rapid.start("b"); rapid.start("c");
    assert.notDeepEqual([...pool("raid-b")].sort(), [...firstPool].sort());
    const orders: string[][] = [];
    for (const runId of ["a", "b"]) {
      const order: string[] = [];
      for (let i = 0; i < RAID_POOL_SIZE; i++) order.push(rapid.skip(runId).revealed);
      assert.equal(new Set(order).size, RAID_POOL_SIZE);
      assert.deepEqual([...order].sort(), [...firstPool].sort());
      assert.equal(rapid.state(runId)?.ended, true);
      assert.equal(rapid.state(runId)?.skips, RAID_POOL_SIZE);
      assert.throws(() => rapid.skip(runId), /window has ended/);
      orders.push(order);
    }
    assert.notDeepEqual(orders[0], orders[1], "same raid and public seed do not dictate a shared answer order");
  } finally { db.close(); }
});

test("v2 verifier rejects understated or missing skip totals", async () => {
  const db = new DatabaseSync(":memory:");
  const cfg: GameRunConfig = { runId: "run", gameId: "coindle", gameVersion: "1.1.0", mode: "ranked", objective: "coins_solved", rules: RAPID_V2_RULES, startedAt: new Date(0).toISOString(), expiresAt: new Date(600000).toISOString() };
  try {
    const rapid = createCoindleRapid({ db, now: () => 0, prices: async () => ({}), pick: () => 0, getSession: () => ({ playerId: "p", config: cfg }) });
    rapid.start("run"); rapid.skip("run");
    const final = rapid.finish("run");
    const result: GameRunResult = { ...cfg, result: "completed", primaryMetric: 0, secondaryMetrics: { guesses: 0, skips: 1 }, finishedAt: new Date(0).toISOString() };
    assert.equal(final.skips, 1);
    assert.deepEqual(await rapid.verifier.verify(cfg, result), { valid: true });
    assert.equal((await rapid.verifier.verify(cfg, { ...result, secondaryMetrics: { guesses: 0, skips: 0 } })).valid, false);
    assert.equal((await rapid.verifier.verify(cfg, { ...result, secondaryMetrics: { guesses: 0 } })).valid, false);
  } finally { db.close(); }
});
