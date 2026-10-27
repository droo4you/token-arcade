import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArcadeStore } from "../src/store.ts";
import type { GameRunConfig, Raid } from "../../../packages/sdk/src/index.ts";

for (const id of ["skip-to-10k", "two-places", "coindle"]) test(`${id} rollout drains sessions and raids, preserving account progress and old history`, () => {
  const dir = mkdtempSync(join(tmpdir(), "passport-rollout-")), file = join(dir, "db.sqlite");
  let store = new ArcadeStore(file, false);
  const restart = () => { store.close(); store = new ArcadeStore(file, false); };
  try {
    const current = store.getGame(id)!;
    const legacy = { ...current, status: "paused" as const, manifest: { ...current.manifest, version: "1.0.0", adapterId: id,
      entry: { kind: "iframe" as const, origin: "https://cart.example", url: `https://cart.example/${id}/v/1.0.0/` } } };
    store.saveGame(legacy);
    const passport = store.getOrCreatePassport("saved-player");
    const config: GameRunConfig = { runId: "pending", gameId: id, gameVersion: "1.0.0", mode: "ranked", objective: "score",
      startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 100000).toISOString() };
    store.createSession({ config, playerId: passport.playerId });
    restart(); assert.deepEqual(store.getGame(id), legacy, "active session keeps its rules");
    store.acceptResult(store.getSession("pending")!, { ...config, primaryMetric: 123, result: "completed", finishedAt: new Date().toISOString() }, p => p);
    const raid: Raid = { id: "old-raid", gameId: id, name: "Old raid", communityId: "test", objective: "score", seed: "old", maxAttempts: 3,
      startsAt: new Date(Date.now()-200000).toISOString(), endsAt: new Date(Date.now()-100000).toISOString(), reward: { type: "none" }, feeSplitBps: { prize: 0, community: 0, treasury: 10000 }, status: "open" };
    store.saveRaid(raid); restart(); assert.deepEqual(store.getGame(id), legacy, "even an ended raid must finalize first");
    store.saveRaid({ ...raid, status: "closed", finalResult: { finalizedAt: new Date().toISOString(), entries: [] } }); restart();
    const upgraded = store.getGame(id)!;
    assert.equal(upgraded.manifest.version, "1.1.0"); assert.equal(upgraded.manifest.adapterId, `${id}-v2`);
    assert.equal(upgraded.manifest.entry?.url, `https://cart.example/${id}/v/1.1.0/`);
    assert.equal(upgraded.status, "paused"); assert.deepEqual(upgraded.economy, legacy.economy);
    assert.deepEqual(store.getOrCreatePassport("saved-player"), passport);
    assert.equal(store.listAcceptedResults(id, "ranked")[0].result.primaryMetric, 123);
    restart(); assert.deepEqual(store.getGame(id), upgraded, "migration is idempotent");
    store.saveGame({ ...legacy, review: { approvedBy: "operator", approvedAt: new Date().toISOString() } });
    restart(); assert.equal(store.getGame(id)!.manifest.version, "1.0.0", "operator-reviewed records stay put");
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("Coindle rollout leaves creator cabinets, custom entries and unpaid funded raids intact", () => {
  const dir = mkdtempSync(join(tmpdir(), "coindle-rollout-")), file = join(dir, "db.sqlite");
  let store = new ArcadeStore(file, false);
  const restart = () => { store.close(); store = new ArcadeStore(file, false); };
  try {
    const current = store.getGame("coindle")!;
    const legacy = { ...current, manifest: { ...current.manifest, version: "1.0.0", adapterId: "coindle", skeletonId: "coindle",
      entry: { kind: "iframe" as const, origin: "https://cart.example", url: "https://cart.example/coindle/v/1.0.0/" } } };
    const owned = { ...legacy, creatorId: "creator" };
    store.saveGame(owned); restart(); assert.deepEqual(store.getGame("coindle"), owned);
    const custom = { ...legacy, manifest: { ...legacy.manifest, entry: { ...legacy.manifest.entry, url: "https://cart.example/custom-coindle/" } } };
    store.saveGame(custom); restart(); assert.deepEqual(store.getGame("coindle"), custom);
    store.saveGame(legacy);
    const raid: Raid = { id: "funded", gameId: "coindle", gameVersion: "1.0.0", name: "Funded legacy raid", communityId: "test",
      objective: "coins_solved", seed: "old", maxAttempts: 3, startsAt: "2026-01-01T00:00:00Z", endsAt: "2026-01-02T00:00:00Z",
      feeSplitBps: { prize: 10000, community: 0, treasury: 0 }, reward: { type: "native", asset: `0x${"0".repeat(40)}` }, status: "closed",
      finalResult: { finalizedAt: "2026-01-02T00:00:00Z", entries: [] },
      funding: { chainId: 10143, vault: `0x${"1".repeat(40)}`, chainRaidId: `0x${"2".repeat(64)}`, rulesHash: `0x${"3".repeat(64)}`,
        gameVersion: "1.0.0", prizeWei: "100", payoutMode: "automatic" } };
    store.saveRaid(raid); restart();
    assert.deepEqual(store.getGame("coindle"), legacy, "finalized funded raids must settle before migration");
    assert.deepEqual(store.getRaid(raid.id), raid);
    store.saveRaid({ ...raid, status: "settled" }); restart();
    assert.equal(store.getGame("coindle")!.manifest.version, "1.1.0");
    assert.deepEqual(store.getRaid(raid.id), { ...raid, status: "settled" }, "historical funding and results stay pinned");
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
