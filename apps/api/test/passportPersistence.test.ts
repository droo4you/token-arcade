import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createArcadeServer } from "../src/server.ts";
import { ArcadeStore } from "../src/store.ts";

// Passport profile fields live in the server SQLite DB (ARCADE_DB_PATH), keyed by auth identity.
// Simulates a process restart: write through the API, close everything, reopen the same file.
async function withServer<T>(dbPath: string, fn: (base: string) => Promise<T>): Promise<T> {
  const store = new ArcadeStore(dbPath, true);
  const server = createArcadeServer({ store, authSettings: { localDemoMode: true }, staticRoot: "nonexistent-build" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try { return await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>((resolve) => server.close(() => resolve())); store.close(); }
}
const me = (base: string, init: RequestInit = {}) => fetch(`${base}/api/me`, { ...init, headers: { Authorization: "Bearer local-demo:player", "Content-Type": "application/json" } });

test("Passport name, avatar and stats survive a server restart on the same DB file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ta-passport-"));
  const dbPath = join(dir, "arcade.sqlite");
  try {
    const before = await withServer(dbPath, async (base) => {
      const patched = await me(base, { method: "PATCH", body: JSON.stringify({ displayName: "Droober", avatarUrl: "https://example.com/pfp.png" }) });
      assert.equal(patched.status, 200);
      return (await patched.json()).passport;
    });
    const store = new ArcadeStore(dbPath, true);
    const p = store.getPassport(before.playerId)!;
    p.bestScores["emonad-cabinet"] = 916; p.gamesPlayed = 3; store.savePassport(p); store.close();
    const after = await withServer(dbPath, async (base) => (await (await me(base)).json()).passport);
    assert.equal(after.playerId, before.playerId);
    assert.equal(after.displayName, "Droober");
    assert.equal(after.avatarUrl, "https://example.com/pfp.png");
    assert.equal(after.bestScores["emonad-cabinet"], 916);
    assert.equal(after.gamesPlayed, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
