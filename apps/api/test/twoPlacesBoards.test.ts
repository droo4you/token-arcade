import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import type { GameRunConfig, GameRunResult } from "../../../packages/sdk/src/index.ts";
import { createTwoPlacesBoardsVerifier, twoRules, twoLevelRules, twoRaidRules } from "../src/twoPlacesBoards.ts";
import { ArcadeStore } from "../src/store.ts";
import { AdapterRegistry } from "../src/verifiers.ts";
import { createArcadeServer } from "../src/server.ts";

const track = JSON.parse(readFileSync(new URL("./fixtures/twoPlacesLevel1.json", import.meta.url), "utf8")).tracks[0] as number[];
function config(raid = false): GameRunConfig {
  let seed = "";
  for (let i = 0; !seed; i++) if (twoRules.order(String(i))[0] === 0) seed = String(i);
  return { gameId: "two-places", gameVersion: "1.1.0", runId: "test", seed, mode: raid ? "raid" : "ranked", objective: raid ? "score" : "completion_time",
    startedAt: new Date(Date.now() - 600_000).toISOString(), rules: raid ? twoRaidRules(seed) : twoLevelRules() };
}
function result(c: GameRunConfig, tracks = [track], deaths = 0): GameRunResult {
  const ticks = tracks.reduce((n, t) => n + t.length, 0), elapsedMs = Math.round(ticks * 1000 / 60);
  return { ...c, primaryMetric: c.mode === "raid" ? 1 : elapsedMs, result: "completed", finishedAt: new Date().toISOString(),
    secondaryMetrics: { ticks, elapsedMs, apples: 2, deaths, levelsCompleted: 1 }, proof: { v: 2, seed: c.seed, tracks: tracks.map(twoRules.encode) } };
}

test("Two Places verifies per-level speedruns, counts restarts in time, and rejects forged levels/scores", async () => {
  const c = config(), verifier = createTwoPlacesBoardsVerifier();
  assert.deepEqual(await verifier.verify(c, result(c)), { valid: true });
  const restart = 1024 | (1024 << 11);
  assert.deepEqual(await verifier.verify(c, result(c, [[restart, ...track]], 1)), { valid: true });
  assert.equal((await verifier.verify(c, { ...result(c), primaryMetric: 9017 })).valid, false);
  assert.equal((await verifier.verify({ ...c, rules: twoLevelRules(1) }, result(c))).valid, false);
  assert.equal((await verifier.verify(c, { ...result(c), proof: { v: 2, seed: "other", tracks: [twoRules.encode(track)] } })).valid, false);
  assert.equal((await verifier.verify(c, { ...result(c), proof: { v: 2, seed: c.seed, tracks: [twoRules.encode([...track, 0])] } })).valid, false);
  assert.throws(() => twoLevelRules(20));
  assert.deepEqual(twoRules.decode(twoRules.encode([0, 2049, (1 << 22) - 1])), [0, 2049, (1 << 22) - 1]);
  assert.throws(() => twoRules.decode("////"));
});

test("Two Places raid replays follow one shuffled order and permit only a final unfinished level", async () => {
  const c = config(true), verifier = createTwoPlacesBoardsVerifier();
  assert.equal(new Set(twoRules.order(c.seed!)).size, 20);
  assert.deepEqual(twoRules.order(c.seed!), twoRules.order(c.seed!));
  assert.notDeepEqual(twoRules.order("one"), twoRules.order("two"));
  assert.deepEqual(await verifier.verify(c, result(c)), { valid: true });
  assert.deepEqual(await verifier.verify(c, result(c, [track, [0]])), { valid: true });
  assert.equal((await verifier.verify(c, result(c, [[0], track]))).valid, false);
  assert.equal((await verifier.verify({ ...c, rules: { ...c.rules, levelSet: "0,1,2" } }, result(c))).valid, false);
  assert.equal((await verifier.verify(c, { ...result(c), primaryMetric: 2 })).valid, false);
  // At the cap, an unfinished first level is a valid zero-level result, with no farmed apples.
  const empty = Array(twoRules.MAX_FRAMES).fill(0);
  const partial = { ...result(c, [empty]), primaryMetric: 0, secondaryMetrics: { ticks: empty.length, elapsedMs: 500_000, apples: 0, deaths: 0, levelsCompleted: 0 } };
  assert.deepEqual(await verifier.verify(c, partial), { valid: true });
});

test("Two Places HTTP boards separate all levels, apply time/apples order, and rank raids separately from their goal", async () => {
  const store = new ArcadeStore(":memory:", false), adapters = new AdapterRegistry();
  // Ranking fixtures deliberately replace only replay verification; real replay coverage is above and in gameSessions.
  adapters.register({ adapterId: "two-places-v2", gameId: "two-places", freePlaySmokeTest: true, rankedRules: twoLevelRules(), verifier: { gameId: "two-places", async verify() { return { valid: true }; } } });
  const server = createArcadeServer({ store, adapters, authSettings: { localDemoMode: true }, staticRoot: "nonexistent-build" });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (path: string, player = "alice", body?: unknown) => {
    const r = await fetch(origin + path, { method: body ? "POST" : "GET", headers: { authorization: `Bearer local-demo:${player}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json() as any };
  };
  const submit = async (player: string, level: number, score: number, apples: number, raidId?: string, elapsedMs = 1000) => {
    const issued = await call("/api/runs", player, { gameId: "two-places", mode: raidId ? "raid" : "ranked", level, raidId });
    assert.equal(issued.status, 201, JSON.stringify(issued.body));
    const c = issued.body.run;
    const reply = await call(`/api/runs/${c.runId}/complete`, player, { ...result(c), primaryMetric: score, secondaryMetrics: { apples, elapsedMs } });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    return c;
  };
  try {
    const saved = (await call("/api/me/progress/two-places")).body;
    await call("/api/me/progress/two-places", "alice", { scope: saved.scope, prepare: { deviceId: "unlocked-fixture", guest: { "ta.two-places.two-places.v1": { unlocked: 20 } } } });
    for (let level = 0; level < 20; level++) {
      await submit("alice", level, 100 + level, 1);
      const board = await call(`/api/leaderboards/two-places?level=${level}`);
      assert.deepEqual(board.body.entries.map((e: any) => e.primaryMetric), [100 + level]);
    }
    await submit("alice", 0, 300, 9); // More apples do not replace a faster run.
    await submit("bob", 0, 100, 3);
    await submit("charlie", 0, 50, 0);
    assert.deepEqual((await call("/api/leaderboards/two-places?level=0")).body.entries.map((e: any) => e.displayName), ["Charlie", "Bob", "Alice"]);
    assert.equal((await call("/api/leaderboards/two-places?level=20")).status, 400);
    assert.equal((await call("/api/runs", "alice", { gameId: "two-places", mode: "ranked", level: -1 })).status, 400);
    const passport = (await call("/api/me")).body.passport;
    assert.equal(passport.bestScores["two-places@1.1.0:completion_time_level_20"], 119);
    const raid = (await call("/api/admin/raids", "admin", { name: "Shuffled run", gameId: "two-places", communityId: "skrumpeys", objective: "score", maxAttempts: 3, startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 600_000).toISOString(), reward: { type: "none" } })).body.raid;
    assert.equal(raid.status, "open");
    const a = await submit("alice", 19, 1, 9, raid.id, 50);
    const b = await submit("bob", 0, 2, 1, raid.id, 500);
    await submit("charlie", 0, 2, 2, raid.id, 1000);
    await submit("dana", 0, 2, 2, raid.id, 800);
    assert.equal(a.seed, b.seed);
    assert.deepEqual(a.rules, b.rules);
    assert.equal(a.rules.levelSet, twoRules.order(a.seed).join(","));
    const lobby = (await call(`/api/raids/${raid.id}`)).body;
    assert.deepEqual(lobby.leaderboard.map((e: any) => e.displayName), ["Dana", "Charlie", "Bob", "Alice"]);
    assert.deepEqual(lobby.twoPlacesGoal, { levels: 7, participants: 4 });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});

test("Two Places restart preserves a legacy record with a noncanonical entry", () => {
  const dir = mkdtempSync(join(tmpdir(), "two-legacy-")), file = join(dir, "db.sqlite");
  let store = new ArcadeStore(file, false);
  try {
    const current = store.getGame("two-places")!;
    const legacy = { ...current, manifest: { ...current.manifest, version: "1.0.0", adapterId: "two-places" } };
    store.saveGame(legacy); store.close(); store = new ArcadeStore(file, false);
    assert.deepEqual(store.getGame("two-places"), legacy);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
