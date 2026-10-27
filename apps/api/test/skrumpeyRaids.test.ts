import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameRecord, GameRunConfig, GameRunResult, Raid } from "../../../packages/sdk/src/index.ts";
import { ArcadeStore } from "../src/store.ts";
import { createArcadeServer } from "../src/server.ts";
import { FundedRaids } from "../src/fundedRaids.ts";
import { loadSkrumpeySim, skrumpeySeed } from "../src/skrumpeyVerification.ts";

const gameId = "skrumpey-slide";
async function setup(version = "1.4.0") {
  const store = new ArcadeStore(":memory:", true);
  const game: GameRecord = { manifest: { id: gameId, name: "Skrumpey Slide", description: "Test cartridge", version,
    developer: "test", adapterId: gameId, supportedModes: ["free", "ranked", "raid"], supportedObjectives: ["score"],
    communityOptional: true, minicoinOptional: true }, status: "published", createdAt: new Date().toISOString(),
    communityConcept: { name: "Skrumpeys", type: "erc721", verification: "unverified" } };
  store.saveGame(game);
  const server = createArcadeServer({ store, authSettings: { localDemoMode: true }, staticRoot: "nonexistent" });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const api = async (path: string, body?: unknown, player = "alice") => {
    const response = await fetch(origin + path, { method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer local-demo:${player}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() as any };
  };
  const draft = { gameId, name: "Rescue raid", communityId: "skrumpeys", objective: "score", maxAttempts: 3,
    seed: "shared-skrumpey-course", startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 900000).toISOString(), reward: { type: "none" } };
  const create = async (extra = {}) => (await api("/api/admin/raids", { ...draft, ...extra }, "admin")).body.raid as Raid & { readiness: { ready: boolean } };
  const close = async () => { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); };
  return { store, game, api, create, close };
}

test("Skrumpey 1.4 pins raid rules, shares the seed and atomically limits issued attempts to three", async () => {
  const { store, api, create, close } = await setup();
  try {
    const raid = await create({ gameVersion: "1.3.0" });
    assert.equal(raid.gameVersion, "1.4.0", "the server pins the reviewed manifest, not client input");
    assert.equal(raid.status, "open");
    for (const extra of [{ maxAttempts: 4 }, { objective: "total_score" }, { rules: { speed: 99 } }]) {
      const invalid = await create(extra);
      assert.equal(invalid.readiness.ready, false);
      assert.equal(invalid.status, "draft");
      assert.equal((await api(`/api/admin/raids/${invalid.id}/open`, {}, "admin")).status, 409);
    }
    const issue = (player = "alice") => api("/api/runs", { gameId, mode: "raid", raidId: raid.id }, player);
    const parallel = await Promise.all(Array.from({ length: 6 }, () => issue()));
    assert.equal(parallel.filter(r => r.status === 201).length, 3);
    assert.equal(parallel.filter(r => r.body.error?.code === "ATTEMPT_LIMIT").length, 3);
    for (const result of parallel.filter(r => r.status === 201)) {
      assert.equal(result.body.run.seed, raid.seed);
      assert.equal(result.body.run.gameVersion, "1.4.0");
    }
    assert.equal((await issue("bob")).body.run.seed, raid.seed);
    const view = (await api(`/api/raids/${raid.id}`)).body;
    assert.equal(view.attemptsRemaining, 0, "abandoned issued runs still consume attempts");
    assert.deepEqual(view.skrumpeyGoal, { rescued: 0, runs: 0, participants: 0 });
    store.saveRaid({ ...raid, id: "old-unpinned", gameVersion: undefined });
    assert.equal((await api("/api/runs", { gameId, mode: "raid", raidId: "old-unpinned" })).body.error.code, "RAID_NOT_READY");
  } finally { await close(); }
});

test("Skrumpey best-run ties use rescues; all attempts contribute only to the goal and frozen payout standings", async () => {
  const { store, api, create, close } = await setup();
  try {
    const raid = await create();
    let sequence = 0;
    // Feed accepted-result fixtures to isolate ranking/finalization from replay physics.
    const accept = async (player: string, score: number, rescued: number, mode: "ranked" | "raid" = "raid") => {
      const issued = await api("/api/runs", { gameId, mode, ...(mode === "raid" ? { raidId: raid.id } : {}) }, player);
      assert.equal(issued.status, 201);
      const config = issued.body.run as GameRunConfig;
      const result: GameRunResult = { ...config, result: "completed", primaryMetric: score, secondaryMetrics: { rescued }, finishedAt: new Date().toISOString() };
      store.acceptResult(store.getSession(config.runId)!, result, passport => passport);
      store.db.prepare("UPDATE accepted_results SET accepted_at=? WHERE run_id=?").run(new Date(1000 + sequence++).toISOString(), config.runId);
      return config;
    };
    await accept("alice", 1000, 2); const aliceBest = await accept("alice", 1000, 5); await accept("alice", 900, 40);
    const bobBest = await accept("bob", 1000, 6);
    await accept("carol", 1000, 6);
    await accept("alice", 1000, 2, "ranked"); await accept("alice", 1000, 5, "ranked"); await accept("bob", 1000, 6, "ranked");
    const view = (await api(`/api/raids/${raid.id}`)).body;
    assert.deepEqual(view.leaderboard.map((r: any) => r.secondaryMetrics.rescued), [6, 6, 5]);
    assert.equal(view.leaderboard[0].runId, bobBest.runId, "acceptance time breaks otherwise equal ties");
    assert.equal(view.leaderboard[2].runId, aliceBest.runId, "choose each player's best score, then rescues");
    assert.deepEqual(view.skrumpeyGoal, { rescued: 59, runs: 5, participants: 3 });
    const ranked = (await api(`/api/leaderboards/${gameId}`)).body.entries;
    assert.deepEqual(ranked.map((r: any) => r.secondaryMetrics.rescued), [6, 5]);
    const wallet = "0x0000000000000000000000000000000000000022";
    const ended: Raid = { ...raid, endsAt: new Date(Date.now() - 1).toISOString(),
      reward: { type: "erc20", asset: wallet }, funding: { chainId: 10143, vault: wallet, chainRaidId: `0x${"1".repeat(64)}`,
        rulesHash: `0x${"2".repeat(64)}`, gameVersion: "1.4.0", prizeWei: "100", payoutMode: "automatic" } };
    store.saveRaid(ended);
    store.db.prepare("INSERT INTO funded_raid_players VALUES (?,?,?)").run(raid.id, view.leaderboard[0].playerId, wallet);
    const final = (await api(`/api/raids/${raid.id}`)).body.raid as Raid;
    assert.equal(final.finalResult!.entries[0].runId, bobBest.runId);
    const service = new FundedRaids(store, { rpcUrl: undefined, vault: wallet });
    const plan = service.settlement(final);
    assert.equal(plan.artifact.winner, wallet);
    assert.equal(plan.artifact.finalResult.entries[0].runId, bobBest.runId);
    assert.equal(store.getPassport(view.leaderboard[0].playerId)!.wins, 1);
    const again = (await api(`/api/raids/${raid.id}`)).body.raid;
    assert.deepEqual(again.finalResult, final.finalResult);
    assert.equal(service.settlement(again).resultHash, plan.resultHash);
    assert.equal(store.getPassport(view.leaderboard[0].playerId)!.wins, 1);
  } finally { await close(); }
});

test("Skrumpey legacy raids retain their attempts and score-only ties after the cabinet upgrades", async () => {
  const { store, game, api, create, close } = await setup("1.3.0");
  try {
    const raid = await create({ maxAttempts: 5 });
    assert.equal(raid.status, "open");
    const runs: string[] = [];
    for (const [player, rescued] of [["alice", 1], ["bob", 99]] as const) {
      const config = (await api("/api/runs", { gameId, mode: "raid", raidId: raid.id }, player)).body.run as GameRunConfig;
      runs.push(config.runId);
      store.acceptResult(store.getSession(config.runId)!, { ...config, result: "completed", primaryMetric: 100, secondaryMetrics: { rescued }, finishedAt: new Date().toISOString() }, p => p);
      store.db.prepare("UPDATE accepted_results SET accepted_at=? WHERE run_id=?").run(new Date(1000 + runs.length).toISOString(), config.runId);
    }
    // A version switch cannot restyle old results or import them into the new board.
    store.saveGame({ ...game, manifest: { ...game.manifest, version: "1.4.0" } });
    const archived = (await api(`/api/raids/${raid.id}`)).body;
    assert.equal(archived.skrumpeyGoal, undefined);
    assert.equal(archived.leaderboard[0].runId, runs[0]);
    assert.equal((await api(`/api/leaderboards/${gameId}`)).body.entries.length, 0);
    assert.equal((await api("/api/runs", { gameId, mode: "raid", raidId: raid.id }, "charlie")).body.error.code, "RAID_NOT_READY");
  } finally { await close(); }
});

test("Skrumpey 1.4 HTTP replay verifies rescued counts and keeps Passport bests versioned", async () => {
  const { store, api, create, close } = await setup();
  try {
    const raid = await create();
    for (const mode of ["ranked", "raid"] as const) {
      const config = (await api("/api/runs", { gameId, mode, ...(mode === "raid" ? { raidId: raid.id } : {}) })).body.run as GameRunConfig;
      const sim = loadSkrumpeySim("1.4.0") as ReturnType<typeof loadSkrumpeySim> & { botInput(s: unknown): number };
      const seed = skrumpeySeed(config.seed!), state = sim.create(seed);
      let input = "";
      while (!state.over && input.length < 36000) { const b = sim.botInput(state); input += String.fromCharCode(48 + (b & 15)); sim.step(state, b); }
      assert.equal(state.over, true);
      const r = sim.result(state, "verify") as Record<string, number>;
      config.startedAt = new Date(Date.now() - input.length * 1000 / 60 - 5000).toISOString();
      store.db.prepare("UPDATE run_sessions SET json=? WHERE id=?").run(JSON.stringify(config), config.runId);
      const result: GameRunResult = { ...config, result: "completed", primaryMetric: r.score, finishedAt: new Date().toISOString(),
        secondaryMetrics: { distance: r.distance, bestCombo: r.bestCombo, perfects: r.perfects, collectibles: r.gems, kills: r.kills,
          hits: r.hits, falls: r.falls, rescued: r.rescued, trainBest: r.trainBest, ticks: r.endTick }, proof: { v: 1, rules: "1.4.0", seed, input } };
      const forged = await api(`/api/runs/${config.runId}/complete`, { ...result, secondaryMetrics: { ...result.secondaryMetrics, rescued: r.rescued + 1 } });
      assert.equal(forged.status, 400);
      assert.match(forged.body.error.message, /rescued/);
      const verified = await api(`/api/runs/${config.runId}/complete`, result);
      assert.equal(verified.status, 200, JSON.stringify(verified.body));
      assert.equal(verified.body.result.secondaryMetrics.rescued, r.rescued);
      assert.ok(verified.body.passport.bestScores[`${gameId}@1.4.0:score`] > 0);
      assert.equal(verified.body.passport.bestScores[`${gameId}:score`], undefined);
      assert.equal((await api(`/api/runs/${config.runId}/complete`, result)).status, 409);
      if (mode === "raid") assert.equal((await api(`/api/raids/${raid.id}`)).body.skrumpeyGoal.rescued, r.rescued);
    }
  } finally { await close(); }
});
