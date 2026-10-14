import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestIndexer } from "envio";

const VAULT = "0x2e9497f8f8fc1cb4b51acd35e5e27a21b389af7d"; // testnet RaidVault (config default)
const POOL = "0x" + "aa".repeat(32);
const RAID = "0x" + "bb".repeat(32);
const WINNER = "0x00000000000000000000000000000000000000Ee";
const blk = (n: number) => ({ number: n, timestamp: 1_760_000_000 + n });
const tx = (n: number) => ({ hash: "0x" + n.toString(16).padStart(64, "0"), from: WINNER });

test("fee -> distribute -> raid open -> settle -> claim updates Raid, VaultBalance, PlayerStats", async () => {
  const ix = createTestIndexer();
  await ix.process({ chains: { 10143: { startBlock: 1, endBlock: 10, simulate: [
    { contract: "EconomyManager", event: "PoolConfigured", block: blk(1), transaction: tx(1), params: { poolId: POOL, prizeVault: VAULT, communityRecipient: WINNER, treasuryRecipient: WINNER, prizeBps: 6500n, communityBps: 2000n, treasuryBps: 1500n } },
    { contract: "MiniCoinHook", event: "FeeCaptured", block: blk(2), transaction: tx(2), params: { poolId: POOL, amount: 1000n } },
    { contract: "EconomyManager", event: "Distributed", block: blk(3), transaction: tx(3), params: { poolId: POOL, total: 1000n, prize: 650n, community: 200n, treasury: 150n } },
    { contract: "EconomyRaidVault", event: "RaidOpened", srcAddress: VAULT, block: blk(4), transaction: tx(4), params: { raidId: RAID, gameId: POOL, minicoin: WINNER, prize: 160n, startsAt: 1n, endsAt: 2n, settleBy: 3n, rulesHash: POOL } },
    { contract: "EconomyRaidVault", event: "RaidSettled", srcAddress: VAULT, block: blk(5), transaction: tx(5), params: { raidId: RAID, winner: WINNER, prize: 160n, resultHash: POOL, claimDeadline: 9n } },
    { contract: "EconomyRaidVault", event: "PrizeClaimed", srcAddress: VAULT, block: blk(6), transaction: tx(6), params: { raidId: RAID, winner: WINNER, to: WINNER, amount: 160n } },
  ] as any } } });
  const raid = await ix.Raid.getOrThrow(`${VAULT}-${RAID}`);
  assert.equal(raid.status, "CLAIMED");
  assert.equal(raid.winner, WINNER.toLowerCase());
  const vb = await ix.VaultBalance.getOrThrow(VAULT);
  assert.equal(vb.freeBalance, 490n);
  assert.equal(vb.lockedBalance, 0n);
  assert.equal(vb.totalPrizesPaid, 160n);
  const pool = await ix.Pool.getOrThrow(POOL);
  assert.equal(pool.totalFeesAccrued, 1000n);
  assert.equal(pool.swapCount, 1);
  const pl = await ix.PlayerStats.getOrThrow(WINNER.toLowerCase());
  assert.equal(pl.raidsWon, 1);
  assert.equal(pl.totalPrizeWei, 160n);
  assert.equal((await ix.RaidClaim.getAll()).length, 1);
});
