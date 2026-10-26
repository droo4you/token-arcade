import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import type { GameRunConfig, GameRunResult } from "../../../packages/sdk/src/index.ts";
import { createSkipBoardsVerifier, skipRules, skipBoardRules } from "../src/skipBoards.ts";
import { loadSkipSim, skipSeed, decodeSkipInput, SKIP_HAND_X, SKIP_HAND_ALT } from "../src/skipVerification.ts";
import { ArcadeStore } from "../src/store.ts";
import { createArcadeServer } from "../src/server.ts";

const open = { up: { arm: 2, rock: 2 }, rock: 17, rocks: 3, rank: 2 };
function played(config: GameRunConfig): GameRunResult {
  const board = String(config.rules?.board), gear = skipRules.loadout(board, open);
  const sim = loadSkipSim("1.1.0") as ReturnType<typeof loadSkipSim> & { botInput(run: unknown): { tilt: number; skip: boolean; bounce: boolean; rc: boolean } };
  const seed = skipSeed(config.seed!);
  const run = sim.newRun(gear.up, seed, true);
  sim.throwRock(run, 16, 1, SKIP_HAND_X); run.alt = SKIP_HAND_ALT;
  let input = "", held = false;
  while (run.phase !== "done" && input.length < 108600) {
    const b = sim.botInput(run), tapped = b.skip && !held; held = b.skip;
    const code = (Math.round(b.tilt) + 1) | (tapped ? 4 : 0) | (b.bounce ? 8 : 0) | (b.rc ? 16 : 0);
    input += String.fromCharCode(48 + code); sim.step(run, decodeSkipInput(code));
  }
  assert.equal(run.phase, "done");
  const r = sim.results(run), m = skipRules.metrics(r, gear);
  config.startedAt = new Date(Date.now() - input.length * 1000 / 120 - 5000).toISOString();
  return { ...config, result: "completed", primaryMetric: m.score, finishedAt: new Date().toISOString(),
    secondaryMetrics: { distance: m.distance, gwei: m.gwei, priceMultiplier: m.priceMultiplier, peak: r.peak,
      skips: r.skips, perfects: r.perfects, bestStreak: r.bestStreak, gems: r.gems, elapsedMs: Math.round(run.t * 1000) },
    proof: { v: 2, seed, board, gear, angle: 16, power: 1, input } };
}

test("Skip board loadouts lock rocks and upgrades; price milestones multiply distance", () => {
  for (const [board, level] of [["zero", 0], ["mid", 3], ["max", 5]] as const) {
    const gear = skipRules.loadout(board, open);
    assert.deepEqual(Object.values(gear.up), Array(7).fill(level));
    assert.equal(gear.rock, 0); assert.equal(gear.rocks, 1); assert.equal(gear.rank, 0);
  }
  assert.equal(skipRules.loadout("open", open).rock, 17);
  for (const bad of [{ ...open, up: { arm: 6 } }, { ...open, rocks: 101 }, { ...open, rank: 12 }]) assert.throws(() => skipRules.loadout("open", bad));
  const gear = skipRules.loadout("zero");
  assert.deepEqual([4999, 5000, 9999, 10000, 29999, 30000].map(peak => skipRules.metrics({ days: 100, peak, earned: 10 }, gear).score), [100, 200, 200, 300, 300, 400]);
});

test("each Skip board verifies real runs and rejects loadout or score forgeries", async () => {
  const verifier = createSkipBoardsVerifier();
  for (const board of skipRules.BOARDS) {
    const config: GameRunConfig = { runId: board, gameId: "skip-to-10k", gameVersion: "1.1.0", mode: "ranked", objective: "score", seed: "four-boards", rules: skipBoardRules(board), startedAt: "" };
    const result = played(config);
    assert.deepEqual(await verifier.verify(config, result), { valid: true }, board);
    assert.equal((await verifier.verify(config, { ...result, primaryMetric: result.primaryMetric + 1 })).valid, false);
    const proof = structuredClone(result.proof) as any;
    proof.gear.up.arm = 99;
    assert.equal((await verifier.verify(config, { ...result, proof })).valid, false);
    assert.equal((await verifier.verify({ ...config, rules: skipBoardRules(board === "max" ? "zero" : "max") }, result)).valid, false);
  }
});

test("Skip HTTP boards stay separate and a shared-seed raid atomically assigns Zero/Mid/Max and sums all three", async () => {
  const store = new ArcadeStore(":memory:", false);
  const server = createArcadeServer({ store, authSettings: { localDemoMode: true }, staticRoot: "no-build" });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = async (path: string, body?: unknown, who = "player") => {
    const r = await fetch(origin + path, { method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer local-demo:${who}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: r.status, body: await r.json() as any };
  };
  const complete = async (config: GameRunConfig) => {
    const result = played(config);
    store.db.prepare("UPDATE run_sessions SET json = ? WHERE id = ?").run(JSON.stringify(config), config.runId);
    const oversized = { ...result, proof: { ...(result.proof as object), input: "1".repeat(70000) } };
    assert.equal((await api(`/api/runs/${config.runId}/complete`, oversized)).body.error.code, "UNVERIFIED_RESULT", "long input tracks reach the verifier within the bounded request limit");
    const response = await api(`/api/runs/${config.runId}/complete`, result);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return result;
  };
  try {
    assert.equal((await api("/api/runs", { gameId: "skip-to-10k", mode: "ranked", board: "anything" })).status, 400);
    assert.equal((await api("/api/leaderboards/skip-to-10k?board=anything")).status, 400);
    for (const board of skipRules.BOARDS) {
      assert.equal((await api(`/api/leaderboards/skip-to-10k?board=${board}`)).body.entries.length, 0);
      const issued = await api("/api/runs", { gameId: "skip-to-10k", mode: "ranked", board });
      assert.equal(issued.status, 201);
      await complete(issued.body.run);
      assert.equal((await api(`/api/leaderboards/skip-to-10k?board=${board}`)).body.entries.length, 1);
      assert.ok((await api("/api/me")).body.passport.bestScores[`skip-to-10k@1.1.0:score_${board}`] >= 0);
    }
    const now = Date.now();
    const created = await api("/api/admin/raids", { gameId: "skip-to-10k", communityId: "eth-weth", name: "Three skips", objective: "score", maxAttempts: 3,
      startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 3600000).toISOString(), reward: { type: "none" } }, "admin");
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const raidId = created.body.raid.id;
    const attempts = await Promise.all([0, 1, 2].map(() => api("/api/runs", { gameId: "skip-to-10k", mode: "raid", raidId, board: "open" })));
    assert.ok(attempts.every(r => r.status === 201), JSON.stringify(attempts));
    assert.deepEqual(attempts.map(r => r.body.run.rules.board).sort(), ["max", "mid", "zero"]);
    assert.equal(new Set(attempts.map(r => r.body.run.seed)).size, 1);
    assert.equal((await api("/api/runs", { gameId: "skip-to-10k", mode: "raid", raidId })).body.error.code, "ATTEMPT_LIMIT");
    const results: GameRunResult[] = [];
    for (const attempt of attempts) {
      results.push(await complete(attempt.body.run));
      const lobby = (await api(`/api/raids/${raidId}`)).body;
      assert.equal(lobby.leaderboard.length, results.length === 3 ? 1 : 0);
      assert.equal(lobby.skipGoal.distance, results.reduce((n, r) => n + r.secondaryMetrics!.distance, 0));
    }
    const lobby = (await api(`/api/raids/${raidId}`)).body;
    assert.equal(lobby.leaderboard[0].primaryMetric, results.reduce((n, r) => n + r.primaryMetric, 0));
    assert.equal(lobby.leaderboard[0].secondaryMetrics.gwei, results.reduce((n, r) => n + r.secondaryMetrics!.gwei, 0));
    assert.equal(lobby.skipGoal.broke10k, results.some(r => r.secondaryMetrics!.peak >= 10000) ? 1 : 0);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
