import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { ArcadeStore } from "../src/store.ts";
import { createArcadeServer } from "../src/server.ts";
import { adultFromDate, prunePrivacyData } from "../src/privacy.ts";

test("age eligibility validates dates and the exact 18th birthday", () => {
  const now = new Date("2026-10-29T10:00:00Z");
  assert.equal(adultFromDate("2008-10-29", now), true);
  assert.equal(adultFromDate("2008-10-30", now), false);
  assert.equal(adultFromDate("2020-01-01", now), false);
  for (const v of [null, "2000-02-30", "2008-13-01", "2030-01-01", "1800-01-01", "18"]) assert.throws(() => adultFromDate(v, now));
});

test("age screen, tamper protection, owned export, idempotent deletion queue and retention", async () => {
  const store = new ArcadeStore(":memory:", true);
  const server = createArcadeServer({ store, authSettings: { localDemoMode: true, requireAdultSession: true }, staticRoot: "nonexistent" });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function call(path: string, { body, cookie, identity, originHeader }: { body?: unknown; cookie?: string; identity?: string; originHeader?: string } = {}) {
    const response = await fetch(origin + path, { method: body === undefined ? "GET" : "POST", headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}),
      ...(identity ? { authorization: `Bearer local-demo:${identity}` } : {}), ...(originHeader ? { origin: originHeader } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, cookie: response.headers.get("set-cookie")?.split(";")[0], data: await response.json() as any };
  }
  try {
    assert.equal((await call("/api/me", { identity: "player" })).data.error.code, "AGE_CHECK_REQUIRED");
    const blocked = await call("/api/privacy/age-session", { body: { birthDate: "2020-01-01" } });
    assert.equal(blocked.status, 403);
    assert.equal((await call("/api/privacy/age-session", { cookie: blocked.cookie, body: { birthDate: "1990-01-01" } })).status, 403);
    assert.equal((await call("/api/privacy/age-session", { body: { birthDate: "1990-01-01" }, originHeader: "https://evil.example" })).status, 403);
    const adult = await call("/api/privacy/age-session", { body: { birthDate: "1990-01-01" } });
    assert.equal(adult.status, 200);
    assert.ok(!adult.cookie?.includes("1990"));
    const cookie = adult.cookie!;
    assert.equal((await call("/api/privacy/age-session", { cookie })).data.status, "adult");
    assert.equal((await call("/api/me", { cookie: cookie.slice(0, -1) + (cookie.endsWith("a") ? "b" : "a"), identity: "player" })).status, 403);
    const me = await call("/api/me", { cookie, identity: "player" });
    assert.equal(me.status, 200);
    const id = me.data.passport.playerId;
    const other = store.getOrCreatePassport("local-demo:other");
    other.displayName = "PRIVATE_OTHER_PLAYER"; store.savePassport(other);
    assert.equal((await call("/api/me/privacy/export", { cookie })).status, 401);
    const exported = await call("/api/me/privacy/export", { cookie, identity: "player" });
    assert.equal(exported.data.passport.playerId, id);
    assert.ok(!JSON.stringify(exported.data).includes("PRIVATE_OTHER_PLAYER"));
    const first = await call("/api/me/privacy/deletion-request", { cookie, identity: "player", body: { playerId: other.playerId } });
    const again = await call("/api/me/privacy/deletion-request", { cookie, identity: "player", body: {} });
    assert.equal(first.status, 202); assert.equal(first.data.request.id, again.data.request.id);
    assert.equal((store.db.prepare("SELECT player_id FROM privacy_requests").get() as any).player_id, id);
    assert.equal((await call("/api/admin/privacy/requests", { cookie, identity: "player" })).status, 403);
    assert.equal((await call("/api/admin/privacy/requests", { cookie, identity: "admin" })).data.requests.length, 1);
    const old = new Date(Date.now() - 31 * 86400000).toISOString();
    const fresh = new Date().toISOString();
    for (const [run, at] of [["old", old], ["fresh", fresh]]) store.db.prepare("INSERT INTO free_play_summaries VALUES (?,?,?,?,?,?)").run(run, "game", id, "guest", at, "{}");
    prunePrivacyData(store);
    assert.deepEqual(store.db.prepare("SELECT run_id FROM free_play_summaries").all().map(r => r.run_id), ["fresh"]);
    assert.equal((store.db.prepare("SELECT count(*) AS n FROM privacy_requests").get() as any).n, 1, "pending request remains actionable");
  } finally { await new Promise<void>(r => server.close(() => r())); store.close(); }
});

test("reviewed deletion clears owned rows, preserves other accounts and refuses funded history", async () => {
  const { completeDeletion, requestDeletion } = await import("../src/privacy.ts");
  const store = new ArcadeStore(":memory:", true);
  const server = createArcadeServer({ store, authSettings: { localDemoMode: true }, staticRoot: "nonexistent" });
  try {
    const player = store.getOrCreatePassport("local-demo:delete-me");
    const other = store.getOrCreatePassport("local-demo:keep-me");
    store.db.prepare("INSERT INTO account_progress VALUES (?,?,?)").run(player.playerId, "two-places", "{}");
    store.db.prepare("INSERT INTO account_progress VALUES (?,?,?)").run(other.playerId, "two-places", "{}");
    const request = requestDeletion(store, player.playerId) as { id: string };
    store.db.prepare("INSERT INTO funded_raid_players VALUES (?,?,?)").run("funded", player.playerId, "0x0000000000000000000000000000000000000001");
    assert.throws(() => completeDeletion(store, request.id), /manual review/);
    assert.ok(store.getPassport(player.playerId), "failed review is nondestructive");
    store.db.prepare("DELETE FROM funded_raid_players WHERE player_id=?").run(player.playerId);
    completeDeletion(store, request.id);
    assert.equal(store.getPassport(player.playerId), undefined);
    assert.ok(store.getPassport(other.playerId));
    assert.deepEqual(store.db.prepare("SELECT player_id FROM account_progress").all().map(r => r.player_id), [other.playerId]);
    assert.equal((store.db.prepare("SELECT status FROM privacy_requests WHERE id=?").get(request.id) as any).status, "completed");
    completeDeletion(store, request.id);
  } finally { server.emit("close"); store.close(); }
});
