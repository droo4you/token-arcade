import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import type { GameRunConfig, GameRunResult } from "../../../packages/sdk/src/index.ts";
import { getWarmupSequence, WARMUP_GAME_ID } from "../../../packages/sdk/src/warmup.ts";
import { createArcadeServer } from "../src/server.ts";
import { ArcadeStore } from "../src/store.ts";
import { AdapterRegistry } from "../src/verifiers.ts";
import { arcadeWalletFromUser } from "../src/auth.ts";

const store = new ArcadeStore(":memory:", true);
const server = createArcadeServer({ store, authSettings: { localDemoMode: true }, staticRoot: "nonexistent-build" });
let base = "";

test("run diagnostics are owned, bounded, sanitized and admin-only, with server rejection evidence", async () => {
  const issued = await api("/api/runs", { method: "POST", auth: "diagnostic-player", body: { gameId: WARMUP_GAME_ID, mode: "ranked" } });
  assert.equal(issued.status, 201);
  const id = issued.body.run.runId;
  const path = `/api/runs/${id}/diagnostics`;
  const event = { event: "timeout", mountId: "11111111-1111-1111-1111-111111111111", sequence: 2, elapsedMs: 15000, hidden: true, stage: "applying", browser: "Safari", platform: "macOS", secret: "DO_NOT_STORE", url: "https://example.test/?token=DO_NOT_STORE" };
  assert.equal((await api(path, { method: "POST", body: event })).status, 401);
  assert.equal((await api(path, { method: "POST", auth: "other-player", body: event })).status, 404);
  assert.equal((await api(path, { method: "POST", auth: "diagnostic-player", body: { ...event, event: "unknown" } })).status, 400);
  assert.equal((await api(path, { method: "POST", auth: "diagnostic-player", body: event })).status, 200);
  const reportPath = `/api/admin/run-diagnostics?runId=${id}`;
  assert.equal((await api(reportPath)).status, 401);
  assert.equal((await api(reportPath, { auth: "diagnostic-player" })).status, 403);
  const failed = await api(`/api/runs/${id}/complete`, { method: "POST", auth: "diagnostic-player", body: {} });
  assert.equal(failed.status, 400);
  const report = (await api(reportPath, { auth: "admin" })).body;
  assert.deepEqual(report.events.map((e: any) => e.event), ["issued", "timeout", "submission_received", "rejected"]);
  assert.equal(report.events[1].hidden, true);
  assert.equal(report.events[1].browser, "Safari");
  assert.equal(report.events.at(-1).code, "INVALID_RESULT");
  assert.equal(report.events.at(-1).requestId, report.events.at(-2).requestId);
  assert.ok(!JSON.stringify(report).includes("DO_NOT_STORE"));
  assert.equal(store.getSession(id)?.consumedAt, undefined, "diagnostics do not consume a run");
  for (let n = 1; n < 120; n++) assert.equal((await api(path, { method: "POST", auth: "diagnostic-player", body: { ...event, sequence: n } })).status, 200);
  assert.equal((await api(path, { method: "POST", auth: "diagnostic-player", body: event })).status, 429);
});

test("funded raid administration requires admin and claims require player authentication", async () => {
  assert.equal((await api("/api/admin/raids/missing/funded/rules")).status, 401);
  assert.equal((await api("/api/admin/raids/missing/funded/rules", { auth: "player" })).status, 403);
  assert.equal((await api("/api/raids/missing/claim")).status, 401);
});

test("Free Play summaries support guests and accounts without awarding competitive progress", async () => {
  const now = new Date().toISOString();
  const result = { runId: "summary-guest", gameId: "skip-to-10k", gameVersion: "1.1.0", mode: "free", objective: "score", primaryMetric: 123,
    result: "completed", startedAt: now, finishedAt: now, secondaryMetrics: { earnedGwei: 50, rocksOwned: 3 }, proof: { ignored: true } };
  const body = { guestId: "12345678-1234-1234-1234-123456789012", result };
  assert.equal((await api("/api/free-play/summaries", { method: "POST", body })).status, 200);
  assert.equal((await api("/api/free-play/summaries", { method: "POST", body })).status, 200);
  const player = store.getOrCreatePassport("local-demo:summary-player");
  const before = JSON.stringify(player);
  assert.equal((await api("/api/free-play/summaries", { method: "POST", auth: "summary-player", body: { ...body, result: { ...result, runId: "summary-account" } } })).status, 200);
  assert.equal(JSON.stringify(store.getPassport(player.playerId)), before);
  assert.equal((await api("/api/admin/free-play/summaries")).status, 401);
  assert.equal((await api("/api/admin/free-play/summaries", { auth: "summary-player" })).status, 403);
  const report = await api("/api/admin/free-play/summaries?gameId=skip-to-10k", { auth: "admin" });
  assert.equal(report.body.summaries.length, 2);
  assert.equal(report.body.summaries.find((r: any) => r.runId === "summary-account").playerId, player.playerId);
  assert.equal(report.body.summaries.find((r: any) => r.runId === "summary-guest").playerId, null);
  assert.equal(report.body.summaries[0].proof, undefined);
  assert.equal(report.body.summaries[0].verified, false);
  assert.equal((await api("/api/admin/free-play/report")).status, 401);
  assert.equal((await api("/api/admin/free-play/report", { auth: "summary-player" })).status, 403);
  assert.equal((await api("/api/admin/free-play/report?days=999", { auth: "admin" })).status, 400);
  const analytics = await api("/api/admin/free-play/report?days=7", { auth: "admin" });
  assert.equal(analytics.status, 200);
  const group = analytics.body.groups.find((g: any) => g.gameId === "skip-to-10k");
  assert.equal(group.runs, 2); assert.equal(group.guests, 1); assert.equal(group.accounts, 1);
  assert.equal(group.primary.median, 123);
  assert.equal(group.recent[0].guestId, undefined);
  for (const patch of [{ mode: "ranked" }, { primaryMetric: "oops" }, { secondaryMetrics: { bad: "value" } }, { gameId: "unknown" }]) {
    const response = await api("/api/free-play/summaries", { method: "POST", body: { ...body, result: { ...result, ...patch } } });
    assert.ok(response.status >= 400);
  }
});

test("Free Play lifecycle is idempotent, bounded, and reconciles out-of-order exits", async () => {
  const now = new Date().toISOString();
  const run = { runId: "lifecycle-run", gameId: "skip-to-10k", gameVersion: "1.1.0", mode: "free", objective: "score", startedAt: now };
  const body = { guestId: "abcdef12-1234-1234-1234-123456789012", run };
  const send = (patch: object, auth?: string) => api("/api/free-play/events", { method: "POST", auth, body: { ...body, ...patch } });
  assert.equal((await send({ type: "exited", reason: "navigation" })).status, 200);
  assert.equal((await send({ type: "started", context: { upgrade_arm: 3 } }, "lifecycle-player")).status, 200);
  assert.equal((await send({ type: "started", context: { upgrade_arm: 99 } }, "lifecycle-player")).status, 200);
  const stored = store.db.prepare("SELECT json FROM free_play_events WHERE run_id=? AND type='started'").get(run.runId) as { json: string };
  assert.equal(JSON.parse(stored.json).context.upgrade_arm, 3, "retry cannot overwrite the initial loadout");
  let report = (await api("/api/admin/free-play/report", { auth: "admin" })).body;
  let group = report.lifecycle.groups.find((g: any) => g.gameId === run.gameId);
  assert.equal(group.started, 1); assert.equal(group.exited, 1); assert.equal(group.finished, 0);
  assert.equal((await api("/api/free-play/summaries", { method: "POST", auth: "lifecycle-player", body: { guestId: body.guestId, result: { ...run, primaryMetric: 99, result: "completed", finishedAt: now } } })).status, 200);
  report = (await api("/api/admin/free-play/report", { auth: "admin" })).body;
  group = report.lifecycle.groups.find((g: any) => g.gameId === run.gameId);
  assert.equal(group.finished, 1); assert.equal(group.exited, 0, "late result takes precedence over exit");
  const recent = report.groups.flatMap((g: any) => g.recent).find((r: any) => r.runId === run.runId);
  assert.deepEqual(recent.startContext, { upgrade_arm: 3 });
  for (const patch of [{ type: "other" }, { type: "started", run: { ...run, mode: "raid" } }, { type: "started", context: { privateText: "not numeric" } }, { type: "exited", reason: "tab_hidden" }]) assert.equal((await send(patch)).status, 400);
});

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
});

async function api(path: string, options: { method?: string; auth?: string; body?: unknown } = {}) {
  const response = await fetch(base + path, {
    method: options.method ?? "GET",
    headers: {
      ...(options.auth ? { authorization: `Bearer local-demo:${options.auth}` } : {}),
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  return { status: response.status, body: await response.json() as any };
}

function resultFor(run: GameRunConfig, score = 1_200): GameRunResult {
  const timesMs = Array.from({ length: 12 }, (_, index) => 100 + index * 80);
  return {
    gameId: run.gameId, gameVersion: run.gameVersion, runId: run.runId,
    mode: run.mode, raidId: run.raidId, seed: run.seed, objective: run.objective,
    primaryMetric: score, result: "completed", startedAt: run.startedAt,
    finishedAt: new Date(Date.parse(run.startedAt) + timesMs[11]).toISOString(),
    proof: { choices: getWarmupSequence(run.seed!), timesMs },
  };
}

test("published catalog contains exactly four Cabinet imports while the fixture stays internal", async () => {
  const health = await api("/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.auth.privy, false);
  assert.equal(health.body.auth.localDemo, true);
  assert.equal(health.body.settlement.ready, false);

  const publicGames = await api("/api/games");
  assert.deepEqual(publicGames.body.games.map((game: any) => game.manifest.id), ["coindle", "emonad-cabinet", "skip-to-10k", "two-places"]);
  assert.equal((await api("/api/raids")).body.raids.some((raid: any) => raid.gameId === WARMUP_GAME_ID), false);
  const adminGames = await api("/api/admin/games", { auth: "admin" });
  assert.equal(adminGames.body.games.length, 5);
  assert.equal(adminGames.body.games.some((game: any) => game.manifest.id === "skrumpey-slide" || game.manifest.id === "buy-bounce"), false);
});

test("profile avatar can be removed without losing the display name, and omission preserves it", async () => {
  const edit = (body: unknown) => api("/api/me", { method: "PATCH", auth: "avatar-test", body });
  for (const clear of [null, ""]) {
    assert.equal((await edit({ avatarUrl: "https://example.com/avatar.png", displayName: "Avatar test" })).status, 200);
    const unchanged = await edit({ displayName: "Kept name" });
    assert.equal(unchanged.body.passport.avatarUrl, "https://example.com/avatar.png");
    const removed = await edit({ avatarUrl: clear });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.passport.avatarUrl, undefined);
    assert.equal(removed.body.passport.displayName, "Kept name");
    assert.equal((await api("/api/me", { auth: "avatar-test" })).body.passport.avatarUrl, undefined);
  }
  assert.equal((await edit({ avatarUrl: "http://example.com/avatar.png" })).status, 400);
});

test("admin allowlist cannot bypass the creator Deploy action", async () => {
  assert.equal((await api("/api/admin/games")).status, 401);
  assert.equal((await api("/api/admin/games", { auth: "player" })).status, 403);
  const publish = await api("/api/admin/games/emonad-cabinet/publish", { method: "POST", auth: "admin" });
  assert.equal(publish.status, 409);
  assert.equal(publish.body.error.code, "DEVELOPER_DEPLOY_REQUIRED");
  assert.equal((await api("/api/games/skrumpey-slide")).status, 404);
});

test("forged client identity, metric, and reused sessions are rejected", async () => {
  const issued = await api("/api/runs", { method: "POST", auth: "player", body: { gameId: WARMUP_GAME_ID, mode: "ranked" } });
  assert.equal(issued.status, 201);
  const run = issued.body.run as GameRunConfig;
  const forged = resultFor(run, 50_000);
  assert.equal((await api(`/api/runs/${run.runId}/complete`, { method: "POST", auth: "admin", body: forged })).status, 404);
  await new Promise((resolve) => setTimeout(resolve, 1_020));
  const rejected = await api(`/api/runs/${run.runId}/complete`, { method: "POST", auth: "player", body: forged });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.error.code, "UNVERIFIED_RESULT", JSON.stringify(rejected.body));

  const accepted = await api(`/api/runs/${run.runId}/complete`, { method: "POST", auth: "player", body: resultFor(run) });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.verified, true);
  assert.equal(accepted.body.passport.bestScores[`${WARMUP_GAME_ID}:score`], 1_200);
  assert.equal(accepted.body.passport.rankedRuns, 1);
  assert.equal((await api(`/api/runs/${run.runId}/complete`, { method: "POST", auth: "player", body: resultFor(run) })).body.error.code, "RUN_CONSUMED");
  const standings = await api(`/api/leaderboards/${WARMUP_GAME_ID}`);
  assert.equal(standings.body.entries.length, 1);
  assert.equal(standings.body.entries[0].primaryMetric, 1_200);
});

test("raid attempt cap counts issued sessions, including abandoned ones", async () => {
  const first = await api("/api/runs", { method: "POST", auth: "raider", body: { gameId: WARMUP_GAME_ID, mode: "raid", raidId: "warmup-test-raid" } });
  const second = await api("/api/runs", { method: "POST", auth: "raider", body: { gameId: WARMUP_GAME_ID, mode: "raid", raidId: "warmup-test-raid" } });
  const third = await api("/api/runs", { method: "POST", auth: "raider", body: { gameId: WARMUP_GAME_ID, mode: "raid", raidId: "warmup-test-raid" } });
  assert.deepEqual([first.status, second.status, third.status], [201, 201, 201]);
  const fourth = await api("/api/runs", { method: "POST", auth: "raider", body: { gameId: WARMUP_GAME_ID, mode: "raid", raidId: "warmup-test-raid" } });
  assert.equal(fourth.status, 409);
  assert.equal(fourth.body.error.code, "ATTEMPT_LIMIT");
  const detail = await api("/api/raids/warmup-test-raid", { auth: "raider" });
  assert.equal(detail.body.attemptsUsed, 3);
  assert.equal(detail.body.attemptsRemaining, 0);
  const guestDetail = await api("/api/raids/warmup-test-raid");
  assert.equal(guestDetail.body.attemptsRemaining, undefined);
});

test("three players receive a durable final raid result and recover accepted submissions", async () => {
  const now = Date.now();
  const created = await api("/api/admin/raids", { method: "POST", auth: "admin", body: {
    name: "Three player final", gameId: WARMUP_GAME_ID, communityId: "internal-test", objective: "score",
    startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 60_000).toISOString(), maxAttempts: 3,
  } });
  const raidId = created.body.raid.id;
  const players = ["final-alice", "final-bob", "final-carol"];
  const runs: GameRunConfig[] = [];
  for (const player of players) {
    const issued = await api("/api/runs", { method: "POST", auth: player, body: { gameId: WARMUP_GAME_ID, mode: "raid", raidId } });
    assert.equal(issued.status, 201);
    runs.push(issued.body.run);
  }
  await new Promise((resolve) => setTimeout(resolve, 1020));
  for (let i = 0; i < players.length; i++) {
    const accepted = await api(`/api/runs/${runs[i].runId}/complete`, { method: "POST", auth: players[i], body: resultFor(runs[i]) });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  }
  const recovery = await api(`/api/runs/${runs[0].runId}/result`, { auth: players[0] });
  assert.equal(recovery.body.verified, true);
  assert.equal(recovery.body.result.runId, runs[0].runId);
  assert.equal((await api(`/api/runs/${runs[0].runId}/result`, { auth: players[1] })).status, 404);
  const raid = store.getRaid(raidId)!;
  store.saveRaid({ ...raid, endsAt: new Date(Date.now() - 1).toISOString() });
  const final = (await api(`/api/raids/${raidId}`)).body;
  assert.equal(final.raid.status, "closed");
  assert.deepEqual(final.raid.finalResult.entries.map((entry: any) => entry.runId), runs.map(run => run.runId));
  const winnerId = final.leaderboard[0].playerId;
  assert.equal(store.getPassport(winnerId)!.wins, 1);
  const winner = store.getPassport(winnerId)!;
  store.savePassport({ ...winner, displayName: "Changed after final" });
  const again = (await api(`/api/raids/${raidId}`)).body;
  assert.deepEqual(again.raid.finalResult, final.raid.finalResult);
  assert.equal(store.getPassport(winnerId)!.wins, 1);
  assert.equal((await api(`/api/runs/${runs[0].runId}/result`, { auth: players[0] })).body.verified, true);
  assert.equal((await api("/api/runs", { method: "POST", auth: players[0], body: { gameId: WARMUP_GAME_ID, mode: "raid", raidId } })).status, 409);
});

test("final result and winner count survive reopening SQLite; empty raids finish without a winner", () => {
  const directory = mkdtempSync(join(tmpdir(), "raid-final-"));
  const filename = join(directory, "arcade.sqlite");
  let saved = new ArcadeStore(filename, true);
  try {
    const passport = saved.getOrCreatePassport("persistence-winner");
    const raid = saved.getRaid("warmup-test-raid")!;
    saved.saveRaid({ ...raid, endsAt: new Date(Date.now() - 1).toISOString() });
    const finalized = saved.finalizeFreeRaid(raid.id, () => [{ rank: 1, playerId: passport.playerId, displayName: passport.displayName,
      primaryMetric: 1200, objective: "score", finishedAt: raid.endsAt, runId: "persisted-winner" }])!;
    saved.close();
    saved = new ArcadeStore(filename, true);
    assert.deepEqual(saved.getRaid(raid.id)!.finalResult, finalized.finalResult);
    saved.finalizeFreeRaid(raid.id, () => { throw new Error("must not finalize twice"); });
    assert.equal(saved.getPassport(passport.playerId)!.wins, 1);
    saved.saveRaid({ ...raid, id: "empty-final", endsAt: new Date(Date.now() - 1).toISOString() });
    assert.deepEqual(saved.finalizeFreeRaid("empty-final", () => [])!.finalResult!.entries, []);
  } finally { saved.close(); unlinkSync(filename); rmdirSync(directory); }
});

test("closing waits for an admitted verification before freezing standings", async () => {
  const isolated = new ArcadeStore(":memory:", true);
  const adapters = new AdapterRegistry();
  const original = adapters.get(WARMUP_GAME_ID)!;
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  adapters.register({ ...original, verifier: { gameId: WARMUP_GAME_ID, async verify(config, result) {
    entered(); await gate; return original.verifier!.verify(config, result);
  } } });
  const local = createArcadeServer({ store: isolated, adapters, authSettings: { localDemoMode: true }, staticRoot: "nonexistent-build" });
  await new Promise<void>(resolve => local.listen(0, "127.0.0.1", resolve));
  const address = `http://127.0.0.1:${(local.address() as AddressInfo).port}`;
  const call = async (path: string, body?: unknown) => {
    const response = await fetch(address + path, { method: body ? "POST" : "GET", headers: { authorization: "Bearer local-demo:boundary", "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    const run = (await call("/api/runs", { gameId: WARMUP_GAME_ID, mode: "raid", raidId: "warmup-test-raid" })).body.run;
    await new Promise(resolve => setTimeout(resolve, 1050));
    const pending = call(`/api/runs/${run.runId}/complete`, resultFor(run));
    await started;
    const raid = isolated.getRaid("warmup-test-raid")!;
    isolated.saveRaid({ ...raid, endsAt: new Date().toISOString() });
    const closing = await call("/api/raids/warmup-test-raid");
    assert.equal(closing.body.raid.status, "closed");
    assert.equal(closing.body.raid.finalResult, undefined);
    release();
    assert.equal((await pending).status, 200);
    const final = await call("/api/raids/warmup-test-raid");
    assert.equal(final.body.raid.finalResult.entries[0].runId, run.runId);
  } finally { release(); await new Promise<void>(resolve => local.close(() => resolve())); isolated.close(); }
});

test("economic raids remain drafts with explicit custody and collection blockers", async () => {
  const now = Date.now();
  const created = await api("/api/admin/raids", {
    method: "POST", auth: "admin", body: {
      name: "Unfunded demo", gameId: WARMUP_GAME_ID, communityId: "internal-test", objective: "score",
      startsAt: new Date(now - 1_000).toISOString(), endsAt: new Date(now + 60_000).toISOString(),
      maxAttempts: 3, entry: { asset: "MON", amount: "1" },
      reward: { type: "erc721", asset: "0x1111111111111111111111111111111111111111", tokenId: "1" },
      feeSplitBps: { prize: 7_000, community: 2_000, treasury: 1_000 },
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.raid.status, "draft");
  assert.ok(created.body.raid.readiness.blockers.some((item: string) => item.includes("custody")));
  const open = await api(`/api/admin/raids/${created.body.raid.id}/open`, { method: "POST", auth: "admin" });
  assert.equal(open.status, 409);
  assert.equal((await api(`/api/raids/${created.body.raid.id}`)).status, 404);
});

test("Launch Console can open a no-entry, no-prize raid with a complete fee allocation", async () => {
  const now = Date.now();
  const input = {
    name: "Free fixture event", gameId: WARMUP_GAME_ID, communityId: "internal-test", objective: "score",
    startsAt: new Date(now - 1_000).toISOString(), endsAt: new Date(now + 60_000).toISOString(),
    maxAttempts: 2, reward: { type: "none" },
    feeSplitBps: { prize: 0, community: 0, treasury: 10_000 },
  };
  const created = await api("/api/admin/raids", { method: "POST", auth: "admin", body: input });
  assert.equal(created.status, 201);
  assert.equal(created.body.raid.status, "open");
  assert.equal(created.body.raid.readiness.ready, true);
  const invalid = await api("/api/admin/raids", { method: "POST", auth: "admin", body: { ...input, feeSplitBps: { prize: 0, community: 0, treasury: 0 } } });
  assert.equal(invalid.status, 400);
  const badRules = await api("/api/admin/raids", { method: "POST", auth: "admin", body: { ...input, rules: { level: { nested: true } } } });
  assert.equal(badRules.body.error.code, "INVALID_RULES");
});

test("expired raids project as closed and cannot be reopened", async () => {
  const now = Date.now();
  store.saveRaid({
    id: "expired-raid", name: "Expired raid", gameId: WARMUP_GAME_ID, communityId: "internal-test",
    objective: "score", seed: "expired", startsAt: new Date(now - 120_000).toISOString(),
    endsAt: new Date(now - 60_000).toISOString(), maxAttempts: 2, reward: { type: "none" },
    feeSplitBps: { prize: 0, community: 0, treasury: 10_000 }, status: "open",
  });
  const listed = await api("/api/raids");
  assert.equal(listed.body.raids.find((raid: any) => raid.id === "expired-raid"), undefined);
  const detail = await api("/api/raids/expired-raid");
  assert.equal(detail.body.raid.status, "closed");
  const admin = await api("/api/admin/raids", { auth: "admin" });
  assert.equal(admin.body.raids.find((raid: any) => raid.id === "expired-raid").status, "closed");
  const entry = await api("/api/runs", { method: "POST", auth: "player", body: { gameId: WARMUP_GAME_ID, mode: "raid", raidId: "expired-raid" } });
  assert.equal(entry.body.error.code, "RAID_CLOSED");
  const reopen = await api("/api/admin/raids/expired-raid/open", { method: "POST", auth: "admin" });
  assert.equal(reopen.body.error.code, "RAID_CLOSED");
});

test("ERC-1155 Community Asset needs an unsigned uint256 token ID", async () => {
  const manifest = { id: "community-required-fixture", name: "Community fixture", description: "Test fixture", developer: "Tests", adapterId: "pending-fixture", version: "1.0.0", supportedModes: ["free"], supportedObjectives: ["score"], communityOptional: false, minicoinOptional: true };
  assert.equal((await api("/api/admin/games", { method: "POST", auth: "admin", body: { manifest } })).status, 201);
  const community = { id: "skrumpeys", name: "Skrumpeys", type: "erc1155", chainId: 31337, address: "0x1111111111111111111111111111111111111111" };
  for (const tokenId of [undefined, "bad", (2n ** 256n).toString()]) {
    const response = await api("/api/admin/games/community-required-fixture", { method: "PATCH", auth: "admin", body: { manifest, community: { ...community, ...(tokenId === undefined ? {} : { tokenId }) } } });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_COMMUNITY");
  }
});

test("Minicoin deployment is gated and requires immutable community configuration", async () => {
  const body = { name: "Skrumpey Coin", symbol: "SKR", metadataURI: "https://example.com/coin.json", initialSupply: "1000000000000000000" };
  const missingCommunity = await api("/api/admin/games/community-required-fixture/minicoin", { method: "POST", auth: "admin", body });
  assert.equal(missingCommunity.body.error.code, "COMMUNITY_REQUIRED");
  const disabled = await api("/api/admin/games/emonad-cabinet/minicoin", { method: "POST", auth: "admin", body });
  assert.equal(disabled.status, 409);
  assert.equal(disabled.body.error.code, "ECONOMY_PENDING");
  const recover = await api("/api/admin/games/emonad-cabinet/minicoin/reconcile", { method: "POST", auth: "admin", body: { transactionHash: `0x${"1".repeat(64)}` } });
  assert.equal(recover.body.error.code, "ECONOMY_PENDING");
});

test("ranked standings and Passport bests separate objectives and game versions", async () => {
  const isolatedStore = new ArcadeStore(":memory:", false);
  const adapters = new AdapterRegistry();
  const id = "objective-fixture";
  adapters.register({ gameId: id, freePlaySmokeTest: true, runTimeoutMs: 180_000, rankedRules: { level: 2 }, verifier: { gameId: id, async verify() { return { valid: true }; } } });
  const game = {
    manifest: { id, name: "Objective fixture", description: "API scoring test", version: "1.0.0", developer: "Tests", adapterId: id,
      supportedModes: ["free", "ranked", "raid"], supportedObjectives: ["score", "completion_time"], communityOptional: true, minicoinOptional: true },
    status: "published", createdAt: new Date().toISOString(), publishedAt: new Date().toISOString(),
  } as const;
  isolatedStore.saveGame({ ...game, manifest: { ...game.manifest, supportedModes: [...game.manifest.supportedModes], supportedObjectives: [...game.manifest.supportedObjectives] } });
  const isolatedServer = createArcadeServer({ store: isolatedStore, adapters, authSettings: { localDemoMode: true }, staticRoot: "nonexistent-build" });
  await new Promise<void>((resolve) => isolatedServer.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(isolatedServer.address() as AddressInfo).port}`;
  const call = async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { authorization: "Bearer local-demo:tester", ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return await response.json() as any;
  };
  try {
    const firstRun = (await call("/api/runs", "POST", { gameId: id, mode: "ranked" })).run as GameRunConfig;
    assert.equal(firstRun.objective, "score");
    assert.deepEqual(firstRun.rules, { level: 2 });
    assert.equal(Date.parse(firstRun.expiresAt!) - Date.parse(firstRun.startedAt), 180_000);
    const firstResult = await call(`/api/runs/${firstRun.runId}/complete`, "POST", resultFor(firstRun, 100));
    assert.equal(firstResult.passport.bestScores[`${id}:score`], 100);
    assert.deepEqual(firstResult.result.rules, { level: 2 });
    const second = { ...game, manifest: { ...game.manifest, version: "2.0.0", supportedModes: [...game.manifest.supportedModes], supportedObjectives: ["completion_time", "score"] as const } };
    isolatedStore.saveGame({ ...second, manifest: { ...second.manifest, supportedObjectives: [...second.manifest.supportedObjectives] } });
    const secondRun = (await call("/api/runs", "POST", { gameId: id, mode: "ranked" })).run as GameRunConfig;
    assert.equal(secondRun.objective, "completion_time");
    const secondResult = await call(`/api/runs/${secondRun.runId}/complete`, "POST", resultFor(secondRun, 20));
    assert.equal(secondResult.passport.bestScores[`${id}:score`], 100);
    assert.equal(secondResult.passport.bestScores[`${id}:completion_time`], 20);
    const standings = await call(`/api/leaderboards/${id}`);
    assert.equal(standings.objective, "completion_time");
    assert.deepEqual(standings.entries.map((entry: any) => entry.primaryMetric), [20]);
  } finally {
    await new Promise<void>((resolve) => isolatedServer.close(() => resolve()));
    isolatedStore.close();
  }
});

test("verifier receives issued rules even when the browser submits different rules", async () => {
  const isolatedStore = new ArcadeStore(":memory:", false);
  const adapters = new AdapterRegistry();
  const id = "rules-fixture";
  let verifierSaw: unknown;
  adapters.register({
    gameId: id, freePlaySmokeTest: true, rankedRules: { level: 3 },
    verifier: { gameId: id, async verify(config, result) {
      verifierSaw = result.rules;
      return { valid: config.rules?.level === 3 && result.rules?.level === 3 && result.primaryMetric === 3 };
    } },
  });
  isolatedStore.saveGame({
    manifest: { id, name: "Rules fixture", description: "Verifier rule integrity test", version: "1.0.0", developer: "Tests",
      adapterId: id, supportedModes: ["free", "ranked"], supportedObjectives: ["score"], communityOptional: true, minicoinOptional: true },
    status: "published", createdAt: new Date().toISOString(), publishedAt: new Date().toISOString(),
  });
  const isolatedServer = createArcadeServer({ store: isolatedStore, adapters, authSettings: { localDemoMode: true }, staticRoot: "nonexistent-build" });
  await new Promise<void>((resolve) => isolatedServer.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(isolatedServer.address() as AddressInfo).port}`;
  const call = async (path: string, body: unknown) => {
    const response = await fetch(origin + path, { method: "POST", headers: { authorization: "Bearer local-demo:player", "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    const issued = await call("/api/runs", { gameId: id, mode: "ranked" });
    assert.equal(issued.status, 201);
    const run = issued.body.run as GameRunConfig;
    assert.deepEqual(run.rules, { level: 3 });
    const tampered = { ...resultFor(run, 3), rules: { level: 99 } };
    const accepted = await call(`/api/runs/${run.runId}/complete`, tampered);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.deepEqual(verifierSaw, { level: 3 });
    assert.deepEqual(accepted.body.result.rules, { level: 3 });
  } finally {
    await new Promise<void>((resolve) => isolatedServer.close(() => resolve()));
    isolatedStore.close();
  }
});

test("arcade wallet selection uses only Privy's embedded Ethereum account", () => {
  const embedded = "0x1111111111111111111111111111111111111111";
  const external = "0x2222222222222222222222222222222222222222";
  const user = { linked_accounts: [
    { type: "wallet", chain_type: "ethereum", connector_type: "injected", wallet_client: "metamask", address: external },
    { type: "wallet", chain_type: "ethereum", connector_type: "embedded", wallet_client: "privy", address: embedded },
  ] };
  assert.equal(arcadeWalletFromUser(user as Parameters<typeof arcadeWalletFromUser>[0]), embedded);
});

test("Passport profile cannot self-assign wallets, identity, or scores", async () => {
  const forged = await api("/api/me", { method: "PATCH", auth: "player", body: { ownershipWallets: ["0x1111111111111111111111111111111111111111"] } });
  assert.equal(forged.status, 400);
  const updated = await api("/api/me", { method: "PATCH", auth: "player", body: { displayName: "Arcade Player" } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.passport.displayName, "Arcade Player");
});

test("ownership wallet association requires a fresh signature from that wallet", async () => {
  const account = privateKeyToAccount(`0x${"a".repeat(64)}`);
  const challenge = await api("/api/me/ownership/challenge", { method: "POST", auth: "player", body: { address: account.address } });
  assert.equal(challenge.status, 201);
  const wrong = await api("/api/me/ownership/confirm", { method: "POST", auth: "player", body: {
    address: account.address, nonce: challenge.body.nonce, signature: `0x${"0".repeat(130)}`,
  } });
  assert.equal(wrong.status, 400);
  const signature = await account.signMessage({ message: challenge.body.message });
  const linked = await api("/api/me/ownership/confirm", { method: "POST", auth: "player", body: { address: account.address, nonce: challenge.body.nonce, signature } });
  assert.equal(linked.status, 200);
  assert.deepEqual(linked.body.passport.ownershipWallets, [account.address]);
  const replay = await api("/api/me/ownership/confirm", { method: "POST", auth: "player", body: { address: account.address, nonce: challenge.body.nonce, signature } });
  assert.equal(replay.status, 409);
  const otherChallenge = await api("/api/me/ownership/challenge", { method: "POST", auth: "raider", body: { address: account.address } });
  const otherSignature = await account.signMessage({ message: otherChallenge.body.message });
  const crossLink = await api("/api/me/ownership/confirm", { method: "POST", auth: "raider", body: { address: account.address, nonce: otherChallenge.body.nonce, signature: otherSignature } });
  assert.equal(crossLink.status, 409);
  assert.equal(crossLink.body.error.code, "WALLET_LINKED");
});

test("built web files and SPA routes are served from the API origin", async () => {
  const directory = mkdtempSync(join(tmpdir(), "token-arcade-static-"));
  const index = join(directory, "index.html");
  writeFileSync(index, "<html>arcade test</html>");
  const staticStore = new ArcadeStore(":memory:", false);
  const staticServer = createArcadeServer({ store: staticStore, authSettings: {}, staticRoot: directory });
  try {
    await new Promise<void>((resolve) => staticServer.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${(staticServer.address() as AddressInfo).port}`;
    assert.match(await (await fetch(origin + "/")).text(), /arcade test/);
    assert.match(await (await fetch(origin + "/games/unknown-cabinet")).text(), /arcade test/);
    assert.equal((await (await fetch(origin + "/api/games")).json() as any).games.length, 4);
  } finally {
    await new Promise<void>((resolve) => staticServer.close(() => resolve()));
    staticStore.close();
    unlinkSync(index);
    rmdirSync(directory);
  }
});

const technicalReview = { builds: true, mounts: true, destroys: true, resultSchema: true, mobile: true, sourceReviewed: true, notes: "Reviewed versioned test artifact and lifecycle." };
function submittedManifest(id: string) {
  return { id, name: `Cabinet ${id}`, description: "A generic future cartridge.", version: "1.0.0", developer: "Creator", adapterId: "future-skeleton", skeletonId: "future-skeleton", supportedModes: ["free"], supportedObjectives: ["score"], communityOptional: true, minicoinOptional: true,
    entry: { kind: "iframe", url: `http://127.0.0.1:8788/${id}/v/1.0.0/`, origin: "http://127.0.0.1:8788" } };
}

test("a new reviewed iframe follows creator submission, admin approval and creator deployment", async () => {
  const id = "future-cabinet";
  const manifest = submittedManifest(id);
  assert.equal((await api("/api/creator/games", { method: "POST", body: { manifest } })).status, 401);
  const submitted = await api("/api/creator/games", { method: "POST", auth: "maker", body: { manifest, creatorId: "local-demo:admin", status: "published", review: { approvedBy: "forged" }, communityConcept: { name: "Future community", type: "concept", verification: "unverified" }, economy: { status: "coming_soon", reason: "Game first, economy later." } } });
  assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
  assert.equal(submitted.body.game.creatorId, "local-demo:maker");
  assert.equal(submitted.body.game.status, "submitted");
  assert.equal(submitted.body.game.review, undefined);
  assert.equal((await api(`/api/games/${id}`)).status, 404);
  assert.equal((await api(`/api/creator/games/${id}/deploy`, { method: "POST", auth: "maker" })).body.error.code, "NOT_APPROVED");
  assert.equal((await api(`/api/admin/games/${id}/approve`, { method: "POST", auth: "maker" })).status, 403);
  assert.equal((await api(`/api/admin/games/${id}/approve`, { method: "POST", auth: "admin" })).body.error.code, "NOT_VALIDATED");
  assert.equal((await api(`/api/admin/games/${id}/validate`, { method: "POST", auth: "admin", body: technicalReview })).status, 200);
  const approved = await api(`/api/admin/games/${id}/approve`, { method: "POST", auth: "admin" });
  assert.equal(approved.body.game.status, "approved");
  assert.equal((await api(`/api/games/${id}`)).status, 404);
  for (const outsider of ["other-maker", "admin"]) assert.equal((await api(`/api/creator/games/${id}/deploy`, { method: "POST", auth: outsider })).status, 404);
  const published = await api(`/api/creator/games/${id}/deploy`, { method: "POST", auth: "maker" });
  assert.equal(published.status, 200, JSON.stringify(published.body));
  assert.equal((await api(`/api/games/${id}`)).body.game.status, "published");
  assert.ok((await api("/api/games")).body.games.some((game: any) => game.manifest.id === id));
  assert.equal((await api("/api/creator/games", { auth: "other-maker" })).body.games.length, 0);
  assert.equal((await api(`/api/creator/games/${id}`, { method: "PATCH", auth: "maker", body: { manifest } })).body.error.code, "GAME_PUBLISHED");
  assert.equal((await api(`/api/admin/games/${id}`, { method: "PATCH", auth: "admin", body: { status: "paused" } })).status, 200);
  const changed = await api(`/api/creator/games/${id}`, { method: "PATCH", auth: "maker", body: { manifest: { ...manifest, description: "Revised artifact metadata" } } });
  assert.equal(changed.body.game.status, "submitted");
  assert.equal(changed.body.game.review, undefined);
  assert.equal((await api(`/api/creator/games/${id}/deploy`, { method: "POST", auth: "maker" })).body.error.code, "NOT_APPROVED");
  const rejected = await api(`/api/admin/games/${id}/reject`, { method: "POST", auth: "admin", body: { reason: "Review the new build first." } });
  assert.equal(rejected.body.game.status, "rejected");
  assert.equal(rejected.body.game.review.note, "Review the new build first.");
});

test("artifact admission rejects unapproved origins, mutable paths, modules and claimed economies", async () => {
  const manifest = submittedManifest("unsafe-cabinet");
  const entries = [
    { kind: "module", url: "/game.js", origin: "http://127.0.0.1:8788" },
    { kind: "iframe", url: "https://unreviewed.example/v/1.0.0/", origin: "https://unreviewed.example" },
    { kind: "iframe", url: "http://127.0.0.1:8788/latest/", origin: "http://127.0.0.1:8788" },
    { kind: "iframe", url: "http://127.0.0.1:8788/unsafe/v/1.0.0/", origin: "https://different.example" },
  ];
  for (const entry of entries) assert.equal((await api("/api/creator/games", { method: "POST", auth: "maker", body: { manifest: { ...manifest, entry } } })).status, 400);
  assert.equal((await api("/api/creator/games", { method: "POST", auth: "maker", body: { manifest, economy: { status: "enabled", reason: "Forged" } } })).body.error.code, "INVALID_ECONOMY");
  const previous = process.env.ALLOWED_CARTRIDGE_ORIGINS;
  process.env.ALLOWED_CARTRIDGE_ORIGINS = base;
  try {
    const sameOrigin = { kind: "iframe", url: `${base}/unsafe/v/1.0.0/`, origin: base };
    const denied = await api("/api/creator/games", { method: "POST", auth: "maker", body: { manifest: { ...manifest, entry: sameOrigin } } });
    assert.equal(denied.status, 400);
    assert.ok(denied.body.error.details.some((detail: string) => detail.includes("separate origin")));
  } finally { if (previous === undefined) delete process.env.ALLOWED_CARTRIDGE_ORIGINS; else process.env.ALLOWED_CARTRIDGE_ORIGINS = previous; }
});

test("shared Skeleton verifier keeps independent Cabinet scores and lets issued runs finish while paused", async () => {
  const isolatedStore = new ArcadeStore(":memory:", false);
  const adapters = new AdapterRegistry();
  adapters.register({ adapterId: "shared-skeleton", gameId: "shared-skeleton", freePlaySmokeTest: true, verifier: { gameId: "shared-skeleton", async verify(config, result) { return { valid: result.primaryMetric === (config.gameId === "cabinet-a" ? 11 : 22) }; } } });
  for (const id of ["cabinet-a", "cabinet-b"]) isolatedStore.saveGame({ manifest: { id, name: id, version: "1.0.0", description: "Shared Skeleton test", developer: "Tests", adapterId: "shared-skeleton", skeletonId: "shared-skeleton", supportedModes: ["free", "ranked"], supportedObjectives: ["score"], communityOptional: true, minicoinOptional: true }, status: "published", createdAt: new Date().toISOString() });
  const isolatedServer = createArcadeServer({ store: isolatedStore, adapters, authSettings: { localDemoMode: true }, staticRoot: "nonexistent-build" });
  await new Promise<void>((resolve) => isolatedServer.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(isolatedServer.address() as AddressInfo).port}`;
  const call = async (path: string, body?: unknown) => {
    const response = await fetch(origin + path, { method: body ? "POST" : "GET", headers: { authorization: "Bearer local-demo:player", ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    for (const [id, score] of [["cabinet-a", 11], ["cabinet-b", 22]] as const) {
      const run = (await call("/api/runs", { gameId: id, mode: "ranked" })).body.run;
      assert.equal((await call(`/api/runs/${run.runId}/complete`, resultFor(run, score))).status, 200);
      assert.deepEqual((await call(`/api/leaderboards/${id}`)).body.entries.map((entry: any) => entry.primaryMetric), [score]);
    }
    const run = (await call("/api/runs", { gameId: "cabinet-a", mode: "ranked" })).body.run;
    const game = isolatedStore.getGame("cabinet-a")!;
    isolatedStore.saveGame({ ...game, status: "paused" });
    assert.equal((await call(`/api/runs/${run.runId}/complete`, resultFor(run, 11))).status, 200);
    assert.equal((await call("/api/runs", { gameId: "cabinet-a", mode: "ranked" })).status, 404);
    assert.equal(isolatedStore.listAcceptedResults("cabinet-a", "ranked").length, 2);
    assert.equal(isolatedStore.listAcceptedResults("cabinet-b", "ranked").length, 1);
  } finally { await new Promise<void>((resolve) => isolatedServer.close(() => resolve())); isolatedStore.close(); }
});

test("Two Places standings prioritize apples before time and require three authored raid levels", async () => {
  const isolatedStore = new ArcadeStore(":memory:", false);
  const legacy = isolatedStore.getGame("two-places")!;
  isolatedStore.saveGame({ ...legacy, manifest: { ...legacy.manifest, version: "1.0.0", adapterId: "two-places", supportedObjectives: ["completion_time", "stars"] } });
  const adapters = new AdapterRegistry();
  adapters.register({ adapterId: "two-places", gameId: "two-places", freePlaySmokeTest: true, rankedRules: { level: 0 }, verifier: { gameId: "two-places", async verify() { return { valid: true }; } } });
  const isolatedServer = createArcadeServer({ store: isolatedStore, adapters, authSettings: { localDemoMode: true }, staticRoot: "nonexistent-build" });
  await new Promise<void>((resolve) => isolatedServer.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(isolatedServer.address() as AddressInfo).port}`;
  const call = async (path: string, player: string, body?: unknown) => {
    const response = await fetch(origin + path, { method: body ? "POST" : "GET", headers: { authorization: `Bearer local-demo:${player}`, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    for (const [player, time, apples] of [["alice", 100, 1], ["alice", 300, 3], ["bob", 200, 3], ["charlie", 50, 2]] as const) {
      const run = (await call("/api/runs", player, { gameId: "two-places", mode: "ranked" })).body.run;
      assert.equal((await call(`/api/runs/${run.runId}/complete`, player, { ...resultFor(run, time), secondaryMetrics: { apples, ticks: time * 60 / 1000 } })).status, 200);
    }
    const entries = (await call("/api/leaderboards/two-places", "alice")).body.entries;
    assert.deepEqual(entries.map((entry: any) => [entry.displayName, entry.secondaryMetrics.apples, entry.primaryMetric]), [["Bob", 3, 200], ["Alice", 3, 300], ["Charlie", 2, 50]]);
    const input = { name: "Three levels", gameId: "two-places", communityId: "skrumpeys", objective: "completion_time", startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 60_000).toISOString(), maxAttempts: 2, reward: { type: "none" } };
    const missing = await call("/api/admin/raids", "admin", input);
    assert.equal(missing.body.raid.status, "draft");
    assert.ok(missing.body.raid.readiness.blockers.some((blocker: string) => blocker.includes("three distinct")));
    const valid = await call("/api/admin/raids", "admin", { ...input, rules: { levelSet: "0,1,2" } });
    assert.equal(valid.body.raid.status, "open");
    assert.equal((await call("/api/runs", "alice", { gameId: "two-places", mode: "raid", raidId: valid.body.raid.id })).status, 201);
  } finally { await new Promise<void>((resolve) => isolatedServer.close(() => resolve())); isolatedStore.close(); }
});

test("legacy import migration preserves cabinet state and history and only runs once", () => {
  const directory = mkdtempSync(join(tmpdir(), "token-arcade-import-"));
  const filename = join(directory, "arcade.sqlite");
  let migrated = new ArcadeStore(filename, false);
  try {
    const old = migrated.getGame("emonad-cabinet")!;
    delete old.legacyImportRevision;
    old.manifest.name = "eMONAD Bounce";
    old.manifest.description = "Old integration copy";
    old.manifest.supportedModes = ["free"];
    old.status = "paused";
    old.communityStrategy = "retained-strategy";
    old.economy = { status: "pending", reason: "Retained review notes" };
    migrated.saveGame(old);
    const passport = migrated.getOrCreatePassport("local-demo:archive");
    const config: GameRunConfig = { gameId: old.manifest.id, gameVersion: "1.0.0", runId: "historical-run", mode: "ranked", objective: "score", seed: "historic", startedAt: new Date().toISOString() };
    migrated.createSession({ config, playerId: passport.playerId });
    migrated.acceptResult({ config, playerId: passport.playerId }, resultFor(config, 123), (current) => current);
    migrated.close(); migrated = new ArcadeStore(filename, false);
    const repaired = migrated.getGame("emonad-cabinet")!;
    assert.equal(repaired.manifest.name, "Mood Swings");
    assert.deepEqual(repaired.manifest.supportedModes, ["free", "ranked", "raid"]);
    assert.equal(repaired.status, "paused");
    assert.equal(repaired.communityStrategy, "retained-strategy");
    assert.equal(repaired.economy?.reason, "Retained review notes");
    assert.equal(migrated.listAcceptedResults("emonad-cabinet", "ranked")[0].result.primaryMetric, 123);
    repaired.manifest.name = "Operator's later title";
    migrated.saveGame(repaired);
    migrated.close(); migrated = new ArcadeStore(filename, false);
    assert.equal(migrated.getGame("emonad-cabinet")?.manifest.name, "Operator's later title");
  } finally { migrated.close(); unlinkSync(filename); rmdirSync(directory); }
});

test("eMONAD raids inherit fixed viewport rules and unchanged paused imports can resume", async () => {
  const input = { name: "eMONAD viewport test", gameId: "emonad-cabinet", communityId: "emonad", objective: "score", startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 60_000).toISOString(), maxAttempts: 3, reward: { type: "none" } };
  const created = await api("/api/admin/raids", { method: "POST", auth: "admin", body: input });
  assert.equal(created.body.raid.status, "open");
  assert.deepEqual(created.body.raid.rules, { viewportHeight: 844, viewportWidth: 390 });
  const issued = await api("/api/runs", { method: "POST", auth: "player", body: { gameId: "emonad-cabinet", mode: "raid", raidId: created.body.raid.id } });
  assert.equal(issued.status, 201);
  assert.deepEqual(issued.body.run.rules, created.body.raid.rules);
  const bad = await api("/api/admin/raids", { method: "POST", auth: "admin", body: { ...input, rules: { viewportWidth: 999 } } });
  assert.equal(bad.body.raid.status, "draft");
  assert.ok(bad.body.raid.readiness.blockers.some((item: string) => item.includes("390×844")));
  assert.equal((await api("/api/admin/games/emonad-cabinet", { method: "PATCH", auth: "admin", body: { status: "paused" } })).body.error.code, "ACTIVE_RAID");
  for (const raid of store.listRaids().filter(raid => raid.gameId === "emonad-cabinet" && raid.status === "open")) {
    store.saveRaid({ ...raid, endsAt: new Date(Date.now() - 1).toISOString() });
    await api(`/api/raids/${raid.id}`);
  }
  assert.equal((await api("/api/admin/games/emonad-cabinet", { method: "PATCH", auth: "admin", body: { status: "paused" } })).status, 200);
  assert.equal((await api("/api/admin/games/emonad-cabinet/resume", { method: "POST", auth: "player" })).status, 403);
  assert.equal((await api("/api/admin/games/emonad-cabinet/resume", { method: "POST", auth: "admin" })).body.game.status, "published");
  assert.equal((await api("/api/admin/games/future-cabinet/resume", { method: "POST", auth: "admin" })).body.error.code, "INVALID_STATE");
});


test("source intake requires configuration and review, privately notifies creator, and supports controlled reassignment", async () => {
  const body = { name: "Source Demo", description: "A source-only submission", developer: "Maker", sourceUrl: "https://github.com/example/private-game", preparation: "agent", requestedModes: ["free", "ranked", "raid"], playGuide: { free: "Explore", ranked: "One timed run", raid: "Three timed runs", scoring: "Highest distance", tieBreak: "Shortest time" } };
  assert.equal((await api("/api/creator/submissions", { method: "POST", body })).status, 401);
  assert.equal((await api("/api/creator/submissions", { method: "POST", auth: "intake-maker", body: { ...body, playGuide: { free: "Explore" } } })).status, 400, "competitive requests need challenge and scoring descriptions");
  assert.equal((await api("/api/creator/submissions", { method: "POST", auth: "intake-maker", body: { ...body, sourceUrl: "https://secret@example.com/game" } })).status, 400);
  const submitted = await api("/api/creator/submissions", { method: "POST", auth: "intake-maker", body: { ...body, creatorId: "local-demo:admin", status: "approved" } });
  assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
  const id = submitted.body.game.manifest.id;
  assert.equal(submitted.body.game.creatorId, "local-demo:intake-maker");
  assert.equal(submitted.body.game.manifest.entry, undefined);
  assert.deepEqual(submitted.body.game.manifest.supportedModes, ["free"]);
  await api(`/api/admin/games/${id}/validate`, { method: "POST", auth: "admin", body: technicalReview });
  assert.equal((await api(`/api/admin/games/${id}/approve`, { method: "POST", auth: "admin" })).status, 409);
  const manifest = { ...submittedManifest(id), playGuide: { free: body.playGuide.free } };
  assert.deepEqual(submitted.body.game.submission.playGuide, body.playGuide);
  assert.equal((await api(`/api/admin/games/${id}`, { method: "PATCH", auth: "intake-maker", body: { manifest } })).status, 403);
  const configured = await api(`/api/admin/games/${id}`, { method: "PATCH", auth: "admin", body: { manifest } });
  assert.equal(configured.status, 200, JSON.stringify(configured.body));
  assert.ok(configured.body.game.submission.configuredAt);
  assert.equal(configured.body.game.review, undefined);
  assert.equal((await api(`/api/creator/submissions/${id}`, { method: "PATCH", auth: "other-maker", body })).status, 404);
  const revised = await api(`/api/creator/submissions/${id}`, { method: "PATCH", auth: "intake-maker", body });
  assert.equal(revised.status, 200);
  assert.equal(revised.body.game.submission.configuredAt, undefined);
  assert.deepEqual(revised.body.game.manifest.entry, manifest.entry);
  assert.equal((await api(`/api/admin/games/${id}/approve`, { method: "POST", auth: "admin" })).status, 409);
  await api(`/api/admin/games/${id}`, { method: "PATCH", auth: "admin", body: { manifest } });
  await api(`/api/admin/games/${id}/validate`, { method: "POST", auth: "admin", body: technicalReview });
  assert.equal((await api(`/api/admin/games/${id}/approve`, { method: "POST", auth: "admin" })).status, 200);
  const inbox = await api("/api/creator/games", { auth: "intake-maker" });
  assert.equal(inbox.body.games.find((g: any) => g.manifest.id === id).status, "approved");
  const recipient = await api("/api/me", { auth: "new-owner" });
  assert.equal((await api("/api/admin/creators", { auth: "intake-maker" })).status, 403);
  assert.equal((await api(`/api/admin/games/${id}/transfer`, { method: "POST", auth: "intake-maker", body: { playerId: recipient.body.passport.playerId } })).status, 403);
  assert.equal((await api(`/api/admin/games/${id}/transfer`, { method: "POST", auth: "admin", body: { playerId: recipient.body.passport.playerId } })).status, 200);
  assert.equal((await api(`/api/creator/games/${id}/deploy`, { method: "POST", auth: "intake-maker" })).status, 404);
  assert.equal((await api(`/api/creator/games/${id}/deploy`, { method: "POST", auth: "new-owner" })).status, 409);
  await api(`/api/admin/games/${id}/validate`, { method: "POST", auth: "admin", body: technicalReview });
  await api(`/api/admin/games/${id}/approve`, { method: "POST", auth: "admin" });
  assert.equal((await api(`/api/creator/games/${id}/deploy`, { method: "POST", auth: "new-owner" })).status, 200);
  assert.equal((await api(`/api/games/${id}`)).body.game.submission, undefined);
  assert.equal((await api("/api/games")).body.games.find((g: any) => g.manifest.id === id).submission, undefined);
  assert.deepEqual((await api(`/api/games/${id}`)).body.game.manifest.playGuide, { free: "Explore" }, "only the reviewed enabled format is public");
  await api(`/api/admin/games/${id}`, { method: "PATCH", auth: "admin", body: { status: "paused" } });
  const changed = { ...manifest, playGuide: { free: "Different challenge" } };
  for (const [path, auth] of [[`/api/admin/games/${id}`, "admin"], [`/api/creator/games/${id}`, "new-owner"]]) {
    assert.equal((await api(path, { method: "PATCH", auth, body: { manifest: changed } })).body.error.code, "VERSION_REQUIRED");
  }
});
