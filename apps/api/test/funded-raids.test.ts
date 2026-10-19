import assert from "node:assert/strict";
import { test } from "node:test";
import { keccak256, stringToHex } from "viem";
import { FundedRaids, fundedRules, artifactHash } from "../src/fundedRaids.ts";
import { ArcadeStore } from "../src/store.ts";
import type { Raid } from "../../../packages/sdk/src/index.ts";

const vault = "0x0000000000000000000000000000000000000011";
const token = "0x0000000000000000000000000000000000000012";
const wallet = "0x0000000000000000000000000000000000000013";
const hash = keccak256(stringToHex("chain-raid"));
function setup() {
  const store = new ArcadeStore(":memory:", true);
  const game = store.getGame("skip-to-10k")!;
  const raid: Raid = { id: "pilot", name: "Pilot", gameId: game.manifest.id, communityId: "test", objective: "distance", seed: "fixed", maxAttempts: 3,
    startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), reward: { type: "erc20", asset: token },
    feeSplitBps: { prize: 0, community: 0, treasury: 10000 }, status: "draft" };
  const now = BigInt(Math.floor(Date.now()/1000));
  const state = { chain: 10143, rules: artifactHash(fundedRules(raid, game)), status: 1, winner: wallet, result: hash, now };
  const service = new FundedRaids(store, { rpcUrl: undefined, vault });
  Object.defineProperty(service, "client", { value: {
    getChainId: async () => state.chain,
    getBlock: async () => ({ timestamp: state.now }),
    readContract: async ({ functionName }: { functionName: string }) => functionName === "gameId" ? keccak256(stringToHex(game.manifest.id)) : functionName === "wmon" ? token
      : [state.rules, state.result, 100n, now, now+1800n, now+3600n, 86400n, now+86400n, state.winner, state.status],
  } });
  store.saveRaid(raid);
  return { store, raid, game, service, state };
}

test("funded pilot binds custody, freezes entry wallet, and claims only the verified winner", async () => {
  const { store, raid, service, state } = setup();
  try {
    const bound = await service.bind(raid, hash);
    assert.equal(bound.reward.type, "erc20");
    assert.equal(bound.funding!.prizeWei, "100");
    assert.throws(() => service.settlement(bound), /frozen/);
    const player = { ...store.getOrCreatePassport("winner"), arcadeWallet: wallet };
    store.savePassport(player);
    assert.equal(service.snapshotWallet(bound, player), wallet);
    assert.equal(service.snapshotWallet(bound, { ...player, arcadeWallet: token }), wallet, "later wallet changes cannot redirect prize");
    const closed = { ...bound, status: "closed" as const, finalResult: { finalizedAt: new Date().toISOString(), entries: [{ rank: 1, playerId: player.playerId, displayName: "Winner", primaryMetric: 100, objective: "distance" as const, finishedAt: new Date().toISOString(), runId: "verified-run" }] } };
    const plan = service.settlement(closed);
    assert.equal(plan.artifact.winner, wallet);
    state.status = 2; state.result = plan.resultHash;
    assert.equal((await service.claim(closed, player)).claimed, false);
    await assert.rejects(service.claim(closed, store.getOrCreatePassport("loser")), /Only the recorded winner/);
    state.result = hash;
    await assert.rejects(service.claim(closed, player), /does not match/);
    state.result = plan.resultHash; state.status = 3;
    assert.deepEqual(await service.claim(closed, player), { claimed: true });
  } finally { store.close(); }
});

test("funded binding rejects wrong network, wrong rules, expired raids and reused custody", async () => {
  const { store, raid, service, state } = setup();
  try {
    state.chain = 143;
    await assert.rejects(service.bind(raid, hash), /testnet/);
    state.chain = 10143; const rules = state.rules; state.rules = hash;
    await assert.rejects(service.bind(raid, hash), /rules/);
    state.rules = rules; state.status = 3;
    await assert.rejects(service.bind(raid, hash), /Open a chain raid/);
    state.status = 1;
    const originalTime = state.now; state.now += 1600n;
    await assert.rejects(service.bind(raid, hash), /five minutes/);
    state.now = originalTime;
    await service.bind(raid, hash);
    await assert.rejects(service.bind(raid, hash), /already linked/);
  } finally { store.close(); }
});

test("funded finalization freezes standings and credits the winner once", async () => {
  const { store, raid, service } = setup();
  try {
    const bound = await service.bind(raid, hash);
    const player = store.getOrCreatePassport("winner");
    store.saveRaid({ ...bound, endsAt: new Date(Date.now()-1000).toISOString() });
    const entries = [{ rank: 1, playerId: player.playerId, displayName: "Winner", primaryMetric: 200, objective: "distance" as const, finishedAt: new Date().toISOString(), runId: "verified-run" }];
    assert.ok(store.finalizeFreeRaid(raid.id, () => entries)?.finalResult);
    assert.deepEqual(store.finalizeFreeRaid(raid.id, () => [])?.finalResult?.entries, entries);
    assert.equal(store.getPassport(player.playerId)!.wins, 1);
  } finally { store.close(); }
});

test("funded rules hash is stable by key order and changes with seed and version", () => {
  assert.equal(artifactHash({ a: 1, b: 2 }), artifactHash({ b: 2, a: 1 }));
  const { store, raid, game } = setup();
  try {
    assert.notEqual(artifactHash(fundedRules(raid, game)), artifactHash(fundedRules({ ...raid, seed: "other" }, game)));
    assert.notEqual(artifactHash(fundedRules(raid, game)), artifactHash(fundedRules(raid, { ...game, manifest: { ...game.manifest, version: "2" } })));
  } finally { store.close(); }
});
