/** Run separately with `node --experimental-sqlite --experimental-strip-types apps/api/test/minicoin.local-chain.ts`.
 * It uses only the in-process Hardhat chain and never connects to Monad. */
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";
import { test } from "node:test";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import { custom, keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { GameRunConfig, GameRunResult } from "../../../packages/sdk/src/index.ts";
import { ArcadeAuth, type Identity } from "../src/auth.ts";
import { buyBounceSeed } from "../src/gameVerification.ts";
import { createArcadeServer } from "../src/server.ts";
import { ArcadeStore } from "../src/store.ts";

const contractsRoot = resolve("contracts");
process.chdir(contractsRoot);
const requireContracts = createRequire(join(contractsRoot, "package.json"));
const hre = requireContracts("hardhat");
const { compileContracts } = requireContracts("./scripts/compile.cjs");
const localPrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const gameId = "emonad-cabinet";
const appId = "privy-local-chain-test-app";
const founderId = "did:privy:local-chain-founder";
const playerId = "did:privy:local-chain-player";
const testWallet = "0x1111111111111111111111111111111111111111";

function token(subject: string, privateKey: KeyObject): string {
  const now = Math.floor(Date.now() / 1_000);
  const header = Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: "privy.io", aud: appId, sub: subject, sid: randomUUID(), iat: now, exp: now + 3_600 })).toString("base64url");
  const signed = `${header}.${payload}`;
  return `${signed}.${sign("sha256", Buffer.from(signed), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}

class FixtureAuth extends ArcadeAuth {
  // Keep Privy's real signature/audience/expiry verification. Replace only
  // remote user lookup because this rehearsal has no external Privy account.
  override async arcadeWallet(identity: Identity): Promise<string | undefined> {
    return identity.id === playerId ? testWallet : undefined;
  }
}

const { makeTrial } = createRequire(import.meta.url)("../../../cartridges/emonad-cabinet/tools/harness.js") as {
  makeTrial(width: number, height: number): {
    run(seed: number, frames: number, frameMs: number, input: () => number): void;
    BB: { record(): Record<string, unknown>; state: { ath: number; buys: number; best: number; tickets: number; steps: number; shown: boolean } };
  };
};

test("local founder rehearsal associates an experimental Minicoin with a playable eMONAD Cabinet and verified Passport run", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const founderToken = token(founderId, privateKey);
  const playerToken = token(playerId, privateKey);
  const authSettings = {
    appId, appSecret: "test-only-secret", adminPrivyIds: founderId, localDemoMode: true,
    jwtVerificationKey: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
  const [owner] = await hre.ethers.getSigners();
  assert.equal(owner.address, privateKeyToAccount(localPrivateKey).address);
  const compiled = compileContracts();
  const artifact = compiled["src/MinicoinFactory.sol"].MinicoinFactory;
  const contractFactory = new hre.ethers.ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, owner);
  const factory = await contractFactory.deploy(owner.address);
  await factory.waitForDeployment();
  const settings = {
    enabled: true, transport: custom(hre.network.provider), chainId: "31337", privateKey: localPrivateKey,
    factoryAddress: await factory.getAddress() as string, treasuryAddress: owner.address as string,
    supplyRecipient: owner.address as string,
  };
  const makeServer = async (rehearsalEnabled: boolean, writesEnabled = true) => {
    const store = new ArcadeStore(":memory:", true);
    const seeded = store.getGame(gameId)!;
    assert.equal(seeded.status, "published");
    assert.equal(seeded.economy?.status, "pending");
    assert.equal(seeded.communityConcept?.verification, "unverified");
    const server = createArcadeServer({
      store, auth: new FixtureAuth(authSettings), localMinicoinRehearsal: rehearsalEnabled,
      minicoinSettings: { ...settings, enabled: writesEnabled, ...(writesEnabled ? {} : { privateKey: undefined }) },
      staticRoot: "nonexistent-build",
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const call = async (path: string, method = "GET", body?: unknown, bearer = founderToken) => {
      const response = await fetch(origin + path, {
        method, headers: { authorization: `Bearer ${bearer}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() as any };
    };
    return { server, store, call };
  };
  const disabled = await makeServer(false);
  try {
    const health = await disabled.call("/api/health");
    assert.equal(health.body.settlement.minicoin.rehearsalReady, false);
    assert.equal(health.body.settlement.minicoin.ready, true, "onchain settings alone cannot enable rehearsal");
    const blocked = await disabled.call(`/api/admin/games/${gameId}/minicoin/rehearse`, "POST", {
      name: "Blocked Rehearsal Coin", symbol: "BLOCK", metadataURI: "https://example.com/blocked.json", initialSupply: "1",
    });
    assert.equal(blocked.status, 503);
    assert.equal(blocked.body.error.code, "REHEARSAL_NOT_READY");
    assert.equal(await factory.minicoinByGame(keccak256(stringToHex(gameId))), "0x0000000000000000000000000000000000000000");
  } finally {
    await new Promise<void>((resolve) => disabled.server.close(() => resolve()));
    disabled.store.close();
  }

  const first = await makeServer(true);
  let hash: string;
  try {
    const body = { name: "eMONAD Rehearsal Coin", symbol: "EMDEMO", metadataURI: "https://example.com/emonad-rehearsal.json", initialSupply: "1000000000000000000" };
    const demoAdmin = await first.call(`/api/admin/games/${gameId}/minicoin/rehearse`, "POST", body, "local-demo:admin");
    assert.equal(demoAdmin.status, 403);
    assert.equal(demoAdmin.body.error.code, "FORBIDDEN");
    const regularPlayer = await first.call(`/api/admin/games/${gameId}/minicoin/rehearse`, "POST", body, playerToken);
    assert.equal(regularPlayer.status, 403);
    assert.equal(regularPlayer.body.error.code, "FORBIDDEN");
    const pending = await first.call(`/api/admin/games/${gameId}/minicoin`, "POST", body);
    assert.equal(pending.status, 409);
    assert.equal(pending.body.error.code, "ECONOMY_PENDING", "the live seeded Cabinet remains blocked");

    const deployed = await first.call(`/api/admin/games/${gameId}/minicoin/rehearse`, "POST", body);
    assert.equal(deployed.status, 201, JSON.stringify(deployed.body));
    hash = deployed.body.minicoin.deploymentTx;
    assert.equal(deployed.body.minicoin.chainId, 31337);
    assert.equal(deployed.body.minicoin.experimental, true);
    assert.equal(await factory.minicoinByGame(keccak256(stringToHex(gameId))), deployed.body.minicoin.address);
    const publicGames = await first.call("/api/games", "GET", undefined, playerToken);
    assert.equal(publicGames.status, 200);
    const publicCabinet = publicGames.body.games.find((game: any) => game.manifest.id === gameId);
    assert.equal(publicCabinet.manifest.id, gameId);
    assert.equal(publicCabinet.status, "published");
    assert.equal(publicCabinet.economy.status, "pending", "rehearsal must not mark the real economy ready");
    assert.equal(publicCabinet.communityConcept.verification, "unverified", "rehearsal must not verify an asset");
    assert.deepEqual(publicCabinet.minicoin, deployed.body.minicoin);

    const issued = await first.call("/api/runs", "POST", { gameId, mode: "ranked" }, playerToken);
    assert.equal(issued.status, 201, JSON.stringify(issued.body));
    const run = issued.body.run as GameRunConfig;
    assert.equal(run.gameId, gameId);
    assert.deepEqual(run.rules, { viewportHeight: 844, viewportWidth: 390 });
    const trial = makeTrial(390, 844);
    trial.run(buyBounceSeed(run.seed!), 6_000, 16, () => 195);
    const state = trial.BB.state;
    assert.equal(state.shown, true, "native gameplay reaches its terminal screen");
    const score = Math.round(state.ath);
    const secondaryMetrics = { buys: state.buys, bestStreak: state.best, collectibles: state.tickets, ticks: state.steps };
    const durationMs = state.steps * 1_000 / 120;
    run.startedAt = new Date(Date.now() - Math.ceil(durationMs) - 3_000).toISOString();
    first.store.db.prepare("UPDATE run_sessions SET json = ? WHERE id = ?").run(JSON.stringify(run), run.runId);
    const result: GameRunResult = {
      gameId: run.gameId, gameVersion: run.gameVersion, runId: run.runId,
      mode: run.mode, objective: run.objective, seed: run.seed,
      primaryMetric: score, secondaryMetrics, proof: trial.BB.record(), result: "completed",
      startedAt: run.startedAt, finishedAt: new Date().toISOString(),
    };
    const accepted = await first.call(`/api/runs/${run.runId}/complete`, "POST", result, playerToken);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.verified, true);
    assert.equal(accepted.body.result.gameId, gameId);
    const passportId = accepted.body.passport.playerId as string;
    assert.equal(accepted.body.passport.bestScores[`${gameId}:score`], score);
    const passport = await first.call("/api/me", "GET", undefined, playerToken);
    assert.equal(passport.body.passport.playerId, passportId);
    assert.equal(passport.body.passport.rankedRuns, 1);
    assert.equal(passport.body.passport.bestScores[`${gameId}:score`], score);
    const standings = await first.call(`/api/leaderboards/${gameId}`, "GET", undefined, playerToken);
    assert.equal(standings.body.gameId, gameId);
    assert.equal(standings.body.entries.length, 1);
    assert.equal(standings.body.entries[0].playerId, passportId);
    assert.equal(standings.body.entries[0].primaryMetric, score);
    assert.equal(standings.body.entries[0].runId, run.runId);

    const changed = await first.call(`/api/admin/games/${gameId}`, "PATCH", { communityStrategy: "new-strategy" });
    assert.equal(changed.body.error.code, "IMMUTABLE_ASSOCIATION");
    const duplicate = await first.call(`/api/admin/games/${gameId}/minicoin/rehearse`, "POST", body);
    assert.equal(duplicate.body.error.code, "MINICOIN_EXISTS");
  } finally {
    await new Promise<void>((resolve) => first.server.close(() => resolve()));
    first.store.close();
  }

  const recovered = await makeServer(true, false);
  try {
    const health = await recovered.call("/api/health");
    assert.equal(health.body.settlement.minicoin.rehearsalReady, false);
    assert.equal(health.body.settlement.minicoin.rehearsalReconcileReady, true);
    const wrongGame = await recovered.call("/api/admin/games/two-places/minicoin/rehearse/reconcile", "POST", { transactionHash: hash });
    assert.equal(wrongGame.body.error.code, "DEPLOY_UNVERIFIED");
    const association = await recovered.call(`/api/admin/games/${gameId}/minicoin/rehearse/reconcile`, "POST", { transactionHash: hash });
    assert.equal(association.status, 200, JSON.stringify(association.body));
    assert.equal(association.body.minicoin.deploymentTx, hash);
    const publicCabinet = (await recovered.call(`/api/games/${gameId}`, "GET", undefined, playerToken)).body.game;
    assert.equal(publicCabinet.manifest.id, gameId);
    assert.deepEqual(publicCabinet.minicoin, association.body.minicoin);
    assert.equal(publicCabinet.economy.status, "pending");
  } finally {
    await new Promise<void>((resolve) => recovered.server.close(() => resolve()));
    recovered.store.close();
  }
});
