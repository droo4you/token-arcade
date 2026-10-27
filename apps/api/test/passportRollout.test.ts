import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArcadeStore } from "../src/store.ts";
import type { GameRunConfig, Raid } from "../../../packages/sdk/src/index.ts";

for (const id of ["skip-to-10k", "two-places"]) test(`${id} rollout drains sessions and raids, preserving account progress and old history`, () => {
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
