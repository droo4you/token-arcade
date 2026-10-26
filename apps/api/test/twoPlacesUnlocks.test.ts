import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { ArcadeStore } from "../src/store.ts";
import { createArcadeServer } from "../src/server.ts";
import { twoPlacesUnlockedCount } from "../../../packages/sdk/src/progress.ts";

const key = "ta.two-places.two-places.v1";
test("Two Places unlock count defaults safely and bounds saved progress", () => {
  for (const state of [{}, { [key]: null }, { [key]: { unlocked: "20" } }, { [key]: { unlocked: NaN } }]) assert.equal(twoPlacesUnlockedCount(state), 1);
  assert.equal(twoPlacesUnlockedCount({ [key]: { unlocked: 3 } }), 3);
  assert.equal(twoPlacesUnlockedCount({ [key]: { unlocked: 100 } }), 20);
});

test("Passport levels follow account-synced campaign unlocks and reject direct locked requests", async () => {
  const store = new ArcadeStore(":memory:", false);
  const server = createArcadeServer({ store, authSettings: { localDemoMode: true }, staticRoot: "nonexistent-build" });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (path: string, player: string, body?: unknown) => {
    const response = await fetch(origin + path, { method: body ? "POST" : "GET", headers: { authorization: `Bearer local-demo:${player}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() as any };
  };
  const run = (level: number, player = "alice", extra = {}) => call("/api/runs", player, { gameId: "two-places", mode: "ranked", level, ...extra });
  try {
    assert.equal((await run(0)).status, 201);
    const before = (store.db.prepare("SELECT COUNT(*) AS count FROM run_sessions").get() as { count: number }).count;
    const locked = await run(2, "alice", { unlocked: 20 });
    assert.equal(locked.status, 403); assert.equal(locked.body.error.code, "LEVEL_LOCKED");
    assert.equal((store.db.prepare("SELECT COUNT(*) AS count FROM run_sessions").get() as { count: number }).count, before, "a rejected request does not issue a session");
    const opened = await call("/api/me/progress/two-places", "alice");
    assert.equal((await call("/api/me/progress/two-places", "alice", { scope: opened.body.scope, prepare: { deviceId: "phone-device", guest: { [key]: { unlocked: 3 } } } })).status, 200);
    const otherDevice = await call("/api/me/progress/two-places", "alice");
    assert.equal(twoPlacesUnlockedCount(otherDevice.body.state), 3);
    for (let level = 0; level < 3; level++) assert.equal((await run(level)).status, 201);
    assert.equal((await run(3)).status, 403);
    assert.equal((await run(2, "bob")).status, 403, "another account cannot use Alice's unlocks");
    assert.equal((await run(-1)).status, 400); assert.equal((await run(20)).status, 400);
    const raid = (await call("/api/admin/raids", "admin", { name: "Shared levels", gameId: "two-places", communityId: "skrumpeys", objective: "score", maxAttempts: 3, startsAt: new Date(Date.now()-1000).toISOString(), endsAt: new Date(Date.now()+600000).toISOString(), reward: { type: "none" } })).body.raid;
    const raidRun = await call("/api/runs", "bob", { gameId: "two-places", mode: "raid", raidId: raid.id });
    assert.equal(raidRun.status, 201); assert.equal(raidRun.body.run.rules.levelSet.split(",").length, 20);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
