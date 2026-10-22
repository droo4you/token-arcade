import assert from "node:assert/strict";
import { test } from "node:test";
import { keccak256, stringToHex, decodeFunctionData } from "viem";
import { ArcadeStore } from "../src/store.ts";
import { FundedRaids, fundedVaultAbi } from "../src/fundedRaids.ts";
import { AutomaticPayouts } from "../src/automaticPayouts.ts";
import type { Raid } from "../../../packages/sdk/src/index.ts";

const key = `0x${"11".repeat(32)}`;
const vault = "0x0000000000000000000000000000000000000011";
const winner = "0x0000000000000000000000000000000000000022";
function setup() {
  const store = new ArcadeStore(":memory:", true);
  const funded = new FundedRaids(store, { vault, rpcUrl: undefined });
  const raid: Raid = { id: "auto", name: "Auto", communityId: "test", gameId: "skip-to-10k", seed: "a", objective: "distance", maxAttempts: 3,
    startsAt: new Date(0).toISOString(), endsAt: new Date(1000).toISOString(), status: "closed", reward: { type: "erc20", asset: vault }, feeSplitBps: { prize: 0, community: 0, treasury: 10000 },
    funding: { chainId: 10143, vault, chainRaidId: keccak256(stringToHex("raid")), rulesHash: keccak256(stringToHex("rules")), gameVersion: "1", prizeWei: "75", payoutMode: "automatic" },
    finalResult: { finalizedAt: new Date().toISOString(), entries: [{ rank: 1, playerId: "winner", displayName: "Winner", primaryMetric: 5, objective: "distance", finishedAt: new Date().toISOString(), runId: "accepted" }] } };
  store.saveRaid(raid);
  store.db.prepare("INSERT INTO funded_raid_players VALUES (?,?,?)").run(raid.id, "winner", winner);
  const worker = new AutomaticPayouts(store, funded, { enabled: true, privateKey: key, rpcUrl: undefined });
  const state = { chain: 10143, sent: [] as string[], signs: 0, failSend: true, mined: false, success: true, status: 1, rules: raid.funding!.rulesHash, gasPrice: 1n };
  const client = {
    getChainId: async () => state.chain,
    getBlock: async () => ({ timestamp: 100n }),
    readContract: async ({ functionName }: { functionName: string }) => functionName === "payoutVersion" ? 1n : functionName === "owner" ? "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A"
      : [state.rules, funded.settlement(raid).resultHash, 75n, 0n, 1n, 1000n, 86400n, 1000n, winner, state.status],
    estimateGas: async () => 100n, getGasPrice: async () => state.gasPrice,
    getBalance: async () => 1000000000000000000n, getTransactionCount: async () => 0,
    getTransactionReceipt: async () => { if (!state.mined) throw Object.assign(new Error("missing"), { name: "TransactionReceiptNotFoundError" }); return { status: state.success ? "success" : "reverted" }; },
    sendRawTransaction: async ({ serializedTransaction }: { serializedTransaction: string }) => { assert.ok(store.db.prepare("SELECT 1 FROM raid_payouts").get(), "persist before broadcast"); state.sent.push(serializedTransaction); if (state.failSend) throw new Error("RPC failure"); return keccak256("0x1234"); },
  };
  const wallet = { signTransaction: async ({ data }: { data: `0x${string}` }) => { state.signs++; const call = decodeFunctionData({ abi: fundedVaultAbi, data }); assert.equal(call.functionName, state.status === 1 ? "settleAndPay" : "payWinner"); return "0x1234"; } };
  Object.defineProperty(worker, "client", { value: client }); Object.defineProperty(worker, "wallet", { value: wallet });
  return { store, funded, worker, state, raid, client, wallet };
}
test("ambiguous RPC errors and process restarts reuse persisted bytes and pay once", async () => {
  const { store, funded, worker, state, raid, client, wallet } = setup();
  try {
    await worker.tick(r => r);
    assert.equal(state.signs, 1); assert.equal(worker.decorate(raid).payout?.status, "submitted");
    const restarted = new AutomaticPayouts(store, funded, { enabled: true, privateKey: key, rpcUrl: undefined });
    Object.defineProperty(restarted, "client", { value: client }); Object.defineProperty(restarted, "wallet", { value: wallet });
    state.failSend = false;
    await restarted.tick(r => r);
    assert.deepEqual(state.sent, ["0x1234", "0x1234"]); assert.equal(state.signs, 1);
    state.mined = true;
    await restarted.tick(r => r); await restarted.tick(r => r);
    assert.equal(restarted.decorate(raid).payout?.status, "paid"); assert.equal(state.signs, 1); assert.equal(state.sent.length, 2);
  } finally { store.close(); }
});
test("wrong chain, mismatched custody, and excessive gas never sign", async () => {
  const { store, worker, state, raid } = setup();
  try {
    state.chain = 143; await worker.tick(r => r);
    state.chain = 10143; state.rules = keccak256(stringToHex("other")); await worker.tick(r => r);
    state.rules = raid.funding!.rulesHash; state.gasPrice = 1000000000000000n; await worker.tick(r => r);
    assert.equal(state.signs, 0); assert.equal(state.sent.length, 0);
  } finally { store.close(); }
});
test("reverted receipt is flagged and never automatically re-signed", async () => {
  const { store, worker, state, raid } = setup();
  try {
    state.failSend = false; await worker.tick(r => r);
    state.mined = true; state.success = false; await worker.tick(r => r); await worker.tick(r => r);
    assert.equal(worker.decorate(raid).payout?.status, "attention"); assert.equal(state.signs, 1);
  } finally { store.close(); }
});
test("unfinalized standings and legacy claims are not automatically paid", async () => {
  const { store, worker, state, raid } = setup();
  try {
    await worker.tick(r => ({ ...r, status: "open", finalResult: undefined }));
    store.saveRaid({ ...raid, funding: { ...raid.funding!, payoutMode: undefined } });
    await worker.tick(r => r); assert.equal(state.signs, 0);
  } finally { store.close(); }
});
