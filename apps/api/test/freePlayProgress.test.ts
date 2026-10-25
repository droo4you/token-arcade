import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { ArcadeStore } from "../src/store.ts";
import { createArcadeServer } from "../src/server.ts";
import { initializeProgress, syncProgress, readProgress } from "../src/freePlayProgress.ts";
import { progressKeys } from "../../../packages/sdk/src/progress.ts";

const skip = progressKeys("skip-to-10k")[0];
const snapshot = (gwei: number, up = 0, rocks = [1]) => ({ [skip]: { gwei, up: { arm: up }, rocks, rock: rocks[0], runs: 1 } });
test("account progress merges guest saves once and applies concurrent currency deltas without resurrecting spent gwei", () => {
  const store = new ArcadeStore(":memory:", false); initializeProgress(store);
  try {
    const prepare = { deviceId: "browser-one", guest: snapshot(100, 1) };
    const first = syncProgress(store, "alice", "skip-to-10k", { prepare });
    assert.equal((first[skip] as any).gwei, 100);
    const spend = { id: "operation-spend", base: first, state: snapshot(60, 2) };
    syncProgress(store, "alice", "skip-to-10k", { operation: spend });
    syncProgress(store, "alice", "skip-to-10k", { operation: spend });
    const next = syncProgress(store, "alice", "skip-to-10k", { prepare });
    assert.equal((next[skip] as any).gwei, 60, "re-import does not undo a purchase");
    const earned = { id: "operation-earn", base: first, state: snapshot(120, 1, [1, 2]) };
    const merged = syncProgress(store, "alice", "skip-to-10k", { operation: earned });
    assert.equal((merged[skip] as any).gwei, 80);
    assert.equal((merged[skip] as any).up.arm, 2);
    assert.deepEqual((merged[skip] as any).rocks, [1, 2]);
    // The network accepted a save but its ack was lost. Reopening applies its durable outbox once,
    // then the additional local change based on that pending snapshot.
    const recovered = syncProgress(store, "alice", "skip-to-10k", { prepare: { ...prepare, pending: earned,
      local: { id: "operation-after-pending", base: earned.state, state: snapshot(130, 1, [1, 2]) } } });
    assert.equal((recovered[skip] as any).gwei, 90);
    assert.deepEqual(readProgress(store, "bob", "skip-to-10k"), {});
    assert.equal(store.listAcceptedResults("skip-to-10k", "ranked").length, 0);
  } finally { store.close(); }
});

test("Two Places, Mood Swings and Coindle preserve unlocks, personal bests and overlapping daily history", () => {
  const store = new ArcadeStore(":memory:", false); initializeProgress(store);
  try {
    const imported = (game: string, deviceId: string, data: unknown) => syncProgress(store, "alice", game, { prepare: { deviceId, guest: { [progressKeys(game)[0]]: data } } });
    imported("two-places", "device-one", { unlocked: 5, best: { 0: { time: 600, apples: 3, total: 3 } } });
    const two = imported("two-places", "device-two", { unlocked: 2, best: { 0: { time: 500, apples: 1, total: 3 }, 1: { time: 700, apples: 2, total: 2 } } });
    assert.equal((Object.values(two)[0] as any).unlocked, 5);
    assert.deepEqual((Object.values(two)[0] as any).best[0], { time: 500, apples: 3, total: 3 });
    imported("emonad-cabinet", "device-one", { bestMood: 100, earned: 100, unlocked: ["skrumpey"], avatar: "skrumpey" });
    const mood = imported("emonad-cabinet", "device-two", { bestMood: 50, earned: 80, unlocked: ["molandak"], avatar: "molandak" });
    assert.equal((Object.values(mood)[0] as any).earned, 100);
    assert.ok((Object.values(mood)[0] as any).unlocked.includes("skrumpey"));
    assert.ok((Object.values(mood)[0] as any).unlocked.includes("molandak"));
    const stats = { played: 10, won: 8, streak: 3, maxStreak: 5, distribution: [1, 2, 3, 1, 1, 0], lastPlayedDate: "2026-10-25" };
    imported("coindle", "device-one", stats);
    const coindle = imported("coindle", "device-two", { ...stats, played: 8, won: 6, streak: 1, lastPlayedDate: "2026-10-24" });
    assert.equal((Object.values(coindle)[0] as any).played, 10);
    assert.equal((Object.values(coindle)[0] as any).streak, 3);
  } finally { store.close(); }
});

test("authenticated progress API isolates accounts, rejects unrelated keys, and survives a database restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "account-progress-")), file = join(dir, "db.sqlite");
  let store = new ArcadeStore(file, false);
  const server = createArcadeServer({ store, authSettings: { localDemoMode: true }, staticRoot: "nonexistent-build" });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, path = "/api/me/progress/skip-to-10k";
  const request = async (player?: string, body?: unknown) => {
    const r = await fetch(origin + path, { method: body ? "POST" : "GET", headers: { ...(player ? { authorization: `Bearer local-demo:${player}` } : {}), "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json() as any };
  };
  let scope = "";
  try {
    assert.equal((await request()).status, 401);
    const opened = await request("alice"); scope = opened.body.scope;
    assert.deepEqual(opened.body.keys, [skip]);
    assert.equal((await request("alice", { scope, prepare: { deviceId: "device-first", guest: snapshot(100) } })).status, 200);
    assert.equal((await request("bob", { scope, operation: { id: "wrong-account", base: {}, state: snapshot(200) } })).status, 409);
    assert.equal((await request("alice", { scope, operation: { id: "bad-key-test", base: {}, state: { secrets: "must not sync" } } })).status, 400);
    assert.deepEqual((await request("bob")).body.state, {});
    const before = store.getOrCreatePassport("local-demo:alice");
    assert.deepEqual(before.bestScores, {}); assert.equal(before.rankedRuns, 0);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
  try { store = new ArcadeStore(file, false); initializeProgress(store); assert.equal((readProgress(store, scope, "skip-to-10k")[skip] as any).gwei, 100); }
  finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
