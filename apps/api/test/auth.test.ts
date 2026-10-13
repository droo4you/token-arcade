import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { GameRunConfig, GameRunResult } from "../../../packages/sdk/src/index.ts";
import { ArcadeAuth, type Identity } from "../src/auth.ts";
import { createArcadeServer } from "../src/server.ts";
import { ArcadeStore } from "../src/store.ts";

const appId = "privy-test-app";
const playerId = "did:privy:passport-player";
const wallet = "0x1111111111111111111111111111111111111111";

function token(subject: string, audience: string, privateKey: KeyObject, expiresAt = Math.floor(Date.now() / 1_000) + 3_600): string {
  const now = Math.floor(Date.now() / 1_000);
  const header = Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: "privy.io", aud: audience, sub: subject, sid: randomUUID(), iat: now, exp: expiresAt })).toString("base64url");
  const signed = `${header}.${payload}`;
  return `${signed}.${sign("sha256", Buffer.from(signed), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function request(origin: string, path: string, bearer?: string, body?: unknown) {
  const response = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() as any };
}

test("signed Privy bearer gates Passport and verified Cabinet scores across sign-in and API restart", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const forgedKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey;
  const verificationKey = publicKey.export({ format: "pem", type: "spki" }).toString();
  const signed = token(playerId, appId, privateKey);
  const directory = mkdtempSync(join(tmpdir(), "token-arcade-auth-"));
  const filename = join(directory, "arcade.sqlite");
  class FixtureAuth extends ArcadeAuth {
    // The real token verifier runs; only Privy's remote user lookup is replaced.
    override async arcadeWallet(identity: Identity): Promise<string | undefined> {
      return identity.id === playerId ? wallet : undefined;
    }
  }
  const authSettings = { appId, appSecret: "test-only-secret", jwtVerificationKey: verificationKey, localDemoMode: false };
  let store: ArcadeStore | undefined;
  let server: Server | undefined;
  try {
    store = new ArcadeStore(filename, false);
    server = createArcadeServer({ store, auth: new FixtureAuth(authSettings), staticRoot: "nonexistent-build" });
    let origin = await listen(server);

    assert.equal((await request(origin, "/api/me")).status, 401);
    assert.equal((await request(origin, "/api/me", token(playerId, appId, forgedKey))).status, 401);
    assert.equal((await request(origin, "/api/me", token(playerId, "another-app", privateKey))).status, 401);
    assert.equal((await request(origin, "/api/me", token(playerId, appId, privateKey, Math.floor(Date.now() / 1_000) - 1))).status, 401);
    assert.equal((await request(origin, "/api/me", "local-demo:player")).status, 401);

    const first = await request(origin, "/api/me", signed);
    assert.equal(first.status, 200);
    assert.equal(first.body.walletSync.ready, true);
    assert.equal(first.body.passport.arcadeWallet, wallet);
    const passportId = first.body.passport.playerId as string;
    const issued = await request(origin, "/api/runs", signed, { gameId: "two-places", mode: "ranked" });
    assert.equal(issued.status, 201);
    const config = issued.body.run as GameRunConfig;
    const proof = JSON.parse(readFileSync(new URL("./fixtures/twoPlacesLevel1.json", import.meta.url), "utf8")) as { v: number; tracks: number[][] };
    const ticks = proof.tracks[0].length - 1;
    const primaryMetric = Math.round(ticks * 1_000 / 60);
    const durationMs = ticks * 1_000 / 60;
    // Rewind only this isolated test session so its native replay can finish
    // without sleeping through the whole authored level.
    config.startedAt = new Date(Date.now() - Math.ceil(durationMs) - 3_000).toISOString();
    store.db.prepare("UPDATE run_sessions SET json = ? WHERE id = ?").run(JSON.stringify(config), config.runId);
    const result: GameRunResult = {
      gameId: config.gameId, gameVersion: config.gameVersion, runId: config.runId,
      mode: config.mode, objective: config.objective, seed: config.seed,
      primaryMetric, secondaryMetrics: { ticks, apples: 2, deaths: 0, levelsCompleted: 1 },
      proof, result: "completed", startedAt: config.startedAt, finishedAt: new Date().toISOString(),
    };
    const otherPlayer = token("did:privy:other-player", appId, privateKey);
    assert.equal((await request(origin, `/api/runs/${config.runId}/complete`, otherPlayer, result)).status, 404);
    const forgedScore = await request(origin, `/api/runs/${config.runId}/complete`, signed, { ...result, primaryMetric: primaryMetric + 1 });
    assert.equal(forgedScore.body.error.code, "UNVERIFIED_RESULT");
    const accepted = await request(origin, `/api/runs/${config.runId}/complete`, signed, result);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.verified, true);
    assert.equal(accepted.body.passport.playerId, passportId);
    assert.equal(accepted.body.passport.bestScores["two-places:completion_time"], primaryMetric);
    assert.equal(accepted.body.passport.rankedRuns, 1);
    assert.equal((await request(origin, `/api/runs/${config.runId}/complete`, signed, result)).body.error.code, "RUN_CONSUMED");
    const board = await request(origin, "/api/leaderboards/two-places");
    assert.equal(board.body.entries.length, 1);
    assert.equal(board.body.entries[0].playerId, passportId);
    assert.equal(board.body.entries[0].primaryMetric, primaryMetric);

    // No bearer after sign-out; a new signed session for the same Privy ID
    // returns the existing Passport after reopening the durable database.
    assert.equal((await request(origin, "/api/me")).status, 401);
    await close(server); server = undefined;
    store.close(); store = undefined;
    store = new ArcadeStore(filename, false);
    server = createArcadeServer({ store, auth: new FixtureAuth(authSettings), staticRoot: "nonexistent-build" });
    origin = await listen(server);
    const second = await request(origin, "/api/me", token(playerId, appId, privateKey));
    assert.equal(second.status, 200);
    assert.equal(second.body.passport.playerId, passportId);
    assert.equal(second.body.passport.arcadeWallet, wallet);
    assert.equal(second.body.passport.rankedRuns, 1);
    assert.equal(second.body.passport.bestScores["two-places:completion_time"], primaryMetric);
    assert.equal((await request(origin, "/api/leaderboards/two-places")).body.entries[0].playerId, passportId);
  } finally {
    if (server?.listening) await close(server);
    store?.close();
    unlinkSync(filename);
    rmdirSync(directory);
  }
});

test("rehearsal disables local demo curator without blocking the allowlisted Privy founder", async () => {
  const founderId = "did:privy:founder-admin";
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const auth = new ArcadeAuth({
    appId, appSecret: "test-only-secret",
    jwtVerificationKey: publicKey.export({ format: "pem", type: "spki" }).toString(),
    adminPrivyIds: founderId, localDemoMode: true,
  });
  const store = new ArcadeStore(":memory:", true);
  const server = createArcadeServer({ store, auth, localMinicoinRehearsal: true, staticRoot: "nonexistent-build" });
  try {
    const origin = await listen(server);
    const health = await request(origin, "/api/health");
    assert.equal(health.body.auth.localDemo, true);
    assert.equal(health.body.auth.localDemoAdmin, false);

    const demoAdmin = await request(origin, "/api/admin/games", "local-demo:admin");
    assert.equal(demoAdmin.status, 403);
    assert.equal(demoAdmin.body.error.code, "FORBIDDEN");
    const demoDeploy = await request(origin, "/api/admin/games/emonad-cabinet/minicoin/rehearse", "local-demo:admin", {
      name: "Blocked Coin", symbol: "BLOCK", metadataURI: "https://example.com/blocked.json", initialSupply: "1",
    });
    assert.equal(demoDeploy.status, 403);
    assert.equal(demoDeploy.body.error.code, "FORBIDDEN");
    assert.equal((await request(origin, "/api/admin/games", token(playerId, appId, privateKey))).status, 403);
    assert.equal((await request(origin, "/api/admin/games", token(founderId, appId, privateKey))).status, 200);
  } finally {
    if (server.listening) await close(server);
    store.close();
  }

  const ordinaryAuth = new ArcadeAuth({ localDemoMode: true });
  const ordinaryStore = new ArcadeStore(":memory:", true);
  const ordinaryServer = createArcadeServer({ store: ordinaryStore, auth: ordinaryAuth, staticRoot: "nonexistent-build" });
  try {
    const origin = await listen(ordinaryServer);
    assert.equal((await request(origin, "/api/health")).body.auth.localDemoAdmin, true);
    assert.equal((await request(origin, "/api/admin/games", "local-demo:admin")).status, 200);
  } finally {
    if (ordinaryServer.listening) await close(ordinaryServer);
    ordinaryStore.close();
  }
});

test("production mode rejects demo identity even when the request arrives through loopback", async () => {
  const previous = process.env.NODE_ENV;
  const auth = (() => {
    try {
      process.env.NODE_ENV = "production";
      return new ArcadeAuth({ localDemoMode: true });
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  })();
  const store = new ArcadeStore(":memory:", auth.localDemoMode);
  const server = createArcadeServer({ store, auth, staticRoot: "nonexistent-build" });
  try {
    const origin = await listen(server);
    const health = await request(origin, "/api/health");
    assert.equal(health.body.auth.localDemo, false);
    const denied = await request(origin, "/api/me", "local-demo:player");
    assert.equal(denied.status, 401);
    assert.equal(denied.body.error.code, "UNAUTHENTICATED");
  } finally {
    if (server.listening) await close(server);
    store.close();
  }
});

test("concurrent Passport requests provision one user-owned Privy wallet", async () => {
  const auth = new ArcadeAuth({ appId, appSecret: "test-only-secret" });
  let linked = false;
  let createCalls = 0;
  let externalId = "";
  Object.defineProperty(auth, "client", { value: {
    users: () => ({ _get: async () => ({ id: playerId, linked_accounts: linked ? [{
      type: "wallet", chain_type: "ethereum", connector_type: "embedded", wallet_client: "privy", address: wallet,
    }] : [] }) }),
    wallets: () => ({ create: async (params: { chain_type: string; owner: { user_id: string }; external_id: string; idempotency_key: string }) => {
      createCalls++;
      assert.equal(params.chain_type, "ethereum");
      assert.equal(params.owner.user_id, playerId);
      assert.equal(params.external_id, params.idempotency_key);
      externalId = params.external_id;
      linked = true;
      return { chain_type: "ethereum", external_id: externalId, address: wallet };
    } }),
  } });
  const identity: Identity = { id: playerId, isAdmin: false, source: "privy" };
  const results = await Promise.all([auth.arcadeWallet(identity), auth.arcadeWallet(identity)]);
  assert.deepEqual(results, [wallet, wallet]);
  assert.equal(createCalls, 1);
  assert.match(externalId, /^ta_arcade_[a-f0-9]{40}$/);
  assert.equal(await auth.arcadeWallet(identity), wallet);
  assert.equal(createCalls, 1);
});

test("wallet provisioning recovers a concurrent external-ID conflict", async () => {
  const auth = new ArcadeAuth({ appId, appSecret: "test-only-secret" });
  let requestedExternalId = "";
  Object.defineProperty(auth, "client", { value: {
    users: () => ({ _get: async () => ({ id: playerId, linked_accounts: [] }) }),
    wallets: () => ({
      create: async (params: { external_id: string }) => {
        requestedExternalId = params.external_id;
        throw { status: 409 };
      },
      get: async (id: string) => {
        assert.equal(id, `ext_wal_${requestedExternalId}`);
        return { chain_type: "ethereum", external_id: requestedExternalId, address: wallet };
      },
    }),
  } });
  assert.equal(await auth.arcadeWallet({ id: playerId, isAdmin: false, source: "privy" }), wallet);
});
