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

test("published catalog excludes unintegrated external cartridges", async () => {
  const health = await api("/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.auth.privy, false);
  assert.equal(health.body.auth.localDemo, true);
  assert.equal(health.body.settlement.ready, false);

  const publicGames = await api("/api/games");
  assert.deepEqual(publicGames.body.games.map((game: any) => game.manifest.id), [WARMUP_GAME_ID]);
  const adminGames = await api("/api/admin/games", { auth: "admin" });
  assert.equal(adminGames.body.games.length, 5);
  assert.equal(adminGames.body.games.find((game: any) => game.manifest.id === "skrumpey-slide").status, "draft");
});

test("admin allowlist and publish readiness block unintegrated games", async () => {
  assert.equal((await api("/api/admin/games")).status, 401);
  assert.equal((await api("/api/admin/games", { auth: "player" })).status, 403);
  const publish = await api("/api/admin/games/skrumpey-slide/publish", { method: "POST", auth: "admin" });
  assert.equal(publish.status, 409);
  assert.equal(publish.body.error.code, "NOT_READY");
  assert.ok(publish.body.error.details.some((item: string) => item.includes("adapter")));
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
  assert.equal(listed.body.raids.find((raid: any) => raid.id === "expired-raid").status, "closed");
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
  const games = await api("/api/admin/games", { auth: "admin" });
  const manifest = games.body.games.find((game: any) => game.manifest.id === "skrumpey-slide").manifest;
  const community = { id: "skrumpeys", name: "Skrumpeys", type: "erc1155", chainId: 31337, address: "0x1111111111111111111111111111111111111111" };
  for (const tokenId of [undefined, "bad", (2n ** 256n).toString()]) {
    const response = await api("/api/admin/games/skrumpey-slide", { method: "PATCH", auth: "admin", body: { manifest, community: { ...community, ...(tokenId === undefined ? {} : { tokenId }) } } });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_COMMUNITY");
  }
});

test("Minicoin deployment is gated and requires immutable community configuration", async () => {
  const body = { name: "Skrumpey Coin", symbol: "SKR", metadataURI: "https://example.com/coin.json", initialSupply: "1000000000000000000" };
  const missingCommunity = await api("/api/admin/games/skrumpey-slide/minicoin", { method: "POST", auth: "admin", body });
  assert.equal(missingCommunity.body.error.code, "COMMUNITY_REQUIRED");
  const disabled = await api("/api/admin/games/buy-bounce/minicoin", { method: "POST", auth: "admin", body });
  assert.equal(disabled.status, 503);
  assert.equal(disabled.body.error.code, "SETTLEMENT_NOT_READY");
  const recover = await api("/api/admin/games/buy-bounce/minicoin/reconcile", { method: "POST", auth: "admin", body: { transactionHash: `0x${"1".repeat(64)}` } });
  assert.equal(recover.body.error.code, "SETTLEMENT_NOT_READY");
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
    assert.match(await (await fetch(origin + "/games/buy-bounce")).text(), /arcade test/);
    assert.equal((await (await fetch(origin + "/api/games")).json() as any).games.length, 0);
  } finally {
    await new Promise<void>((resolve) => staticServer.close(() => resolve()));
    staticStore.close();
    unlinkSync(index);
    rmdirSync(directory);
  }
});
