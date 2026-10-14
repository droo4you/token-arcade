import { indexer } from "envio";

type Ev = { srcAddress: string; logIndex: number; block: { number: number; timestamp: number }; transaction: { hash: string; from?: string } };
const eid = (e: Ev) => `${e.transaction.hash}-${e.logIndex}`;
const raidKey = (vault: string, raidId: string) => `${vault.toLowerCase()}-${raidId}`;

async function vaultBalance(context: any, vault: string, ts: number) {
  return context.VaultBalance.getOrCreate({ id: vault.toLowerCase(), freeBalance: 0n, lockedBalance: 0n,
    totalDistributedIn: 0n, totalPrizesPaid: 0n, raidsOpened: 0, updatedAt: ts });
}
async function player(context: any, addr: string) {
  return context.PlayerStats.getOrCreate({ id: addr.toLowerCase(), raidsWon: 0, nftRaidsWon: 0, prizesClaimed: 0, totalPrizeWei: 0n, lastWinAt: undefined });
}
async function updateRaid(context: any, id: string, patch: Record<string, unknown>, ts: number) {
  const raid = await context.Raid.get(id);
  if (!raid) { context.log.warn(`Raid ${id} not found`); return undefined; }
  const next = { ...raid, ...patch, updatedAt: ts };
  context.Raid.set(next);
  return next;
}
async function returned(context: any, e: Ev, raidId: string, amount: bigint, status: string) {
  const ts = e.block.timestamp;
  const raid = await updateRaid(context, raidKey(e.srcAddress, raidId), { status }, ts);
  const vb = await vaultBalance(context, e.srcAddress, ts);
  const locked = raid ? raid.prize : amount;
  context.VaultBalance.set({ ...vb, freeBalance: vb.freeBalance + amount, lockedBalance: vb.lockedBalance - locked > 0n ? vb.lockedBalance - locked : 0n, updatedAt: ts });
}

// ---------------- EconomyRaidVault (WMON prize raids) ----------------
indexer.onEvent({ contract: "EconomyRaidVault", event: "RaidOpened" }, async ({ event, context }) => {
  const ts = event.block.timestamp, p = event.params;
  context.Raid.set({ id: raidKey(event.srcAddress, p.raidId), kind: "ECONOMY", vault: event.srcAddress.toLowerCase(), raidId: p.raidId,
    gameId: p.gameId, rulesHash: p.rulesHash, status: "OPEN", prize: p.prize, minicoin: p.minicoin, collection: undefined, tokenId: undefined,
    depositor: undefined, startsAt: p.startsAt, endsAt: p.endsAt, settleBy: p.settleBy, winner: undefined, resultHash: undefined,
    claimDeadline: undefined, openedTx: event.transaction.hash, openedAt: ts, updatedAt: ts });
  const vb = await vaultBalance(context, event.srcAddress, ts);
  context.VaultBalance.set({ ...vb, freeBalance: vb.freeBalance - p.prize, lockedBalance: vb.lockedBalance + p.prize, raidsOpened: vb.raidsOpened + 1, updatedAt: ts });
});
indexer.onEvent({ contract: "EconomyRaidVault", event: "RaidSettled" }, async ({ event, context }) => {
  const ts = event.block.timestamp, p = event.params;
  await updateRaid(context, raidKey(event.srcAddress, p.raidId), { status: "SETTLED", winner: p.winner.toLowerCase(), resultHash: p.resultHash, claimDeadline: p.claimDeadline }, ts);
  const pl = await player(context, p.winner);
  context.PlayerStats.set({ ...pl, raidsWon: pl.raidsWon + 1, lastWinAt: ts });
});
indexer.onEvent({ contract: "EconomyRaidVault", event: "PrizeClaimed" }, async ({ event, context }) => {
  const ts = event.block.timestamp, p = event.params, id = raidKey(event.srcAddress, p.raidId);
  await updateRaid(context, id, { status: "CLAIMED" }, ts);
  context.RaidClaim.set({ id: eid(event), raid_id: id, winner: p.winner.toLowerCase(), to: p.to.toLowerCase(), amount: p.amount, txHash: event.transaction.hash, timestamp: ts });
  const vb = await vaultBalance(context, event.srcAddress, ts);
  context.VaultBalance.set({ ...vb, lockedBalance: vb.lockedBalance - p.amount, totalPrizesPaid: vb.totalPrizesPaid + p.amount, updatedAt: ts });
  const pl = await player(context, p.winner);
  context.PlayerStats.set({ ...pl, prizesClaimed: pl.prizesClaimed + 1, totalPrizeWei: pl.totalPrizeWei + p.amount });
});
indexer.onEvent({ contract: "EconomyRaidVault", event: "RaidCancelled" }, async ({ event, context }) => returned(context, event, event.params.raidId, event.params.returnedToFree, "CANCELLED"));
indexer.onEvent({ contract: "EconomyRaidVault", event: "RaidTimedOut" }, async ({ event, context }) => returned(context, event, event.params.raidId, event.params.returnedToFree, "TIMED_OUT"));
indexer.onEvent({ contract: "EconomyRaidVault", event: "PrizeExpired" }, async ({ event, context }) => returned(context, event, event.params.raidId, event.params.returnedToFree, "EXPIRED"));
indexer.onEvent({ contract: "EconomyRaidVault", event: "ConfigUpdated" }, async ({ event, context }) => {
  context.log.info(`Raid vault ${event.srcAddress} config: threshold=${event.params.threshold} prizeBps=${event.params.prizeBps}`);
});

// ---------------- CommunityNftRaidVault (sponsored NFT raids) ----------------
indexer.onEvent({ contract: "CommunityNftRaidVault", event: "RaidOpened" }, async ({ event, context }) => {
  const ts = event.block.timestamp, p = event.params;
  context.Raid.set({ id: raidKey(event.srcAddress, p.raidId), kind: "NFT", vault: event.srcAddress.toLowerCase(), raidId: p.raidId,
    gameId: p.gameId, rulesHash: p.rulesHash, status: "OPEN", prize: 0n, minicoin: undefined, collection: p.collection.toLowerCase(), tokenId: p.tokenId,
    depositor: p.depositor.toLowerCase(), startsAt: p.startsAt, endsAt: p.endsAt, settleBy: undefined, winner: undefined, resultHash: undefined,
    claimDeadline: undefined, openedTx: event.transaction.hash, openedAt: ts, updatedAt: ts });
});
indexer.onEvent({ contract: "CommunityNftRaidVault", event: "Awarded" }, async ({ event, context }) => {
  const ts = event.block.timestamp, p = event.params;
  await updateRaid(context, raidKey(event.srcAddress, p.raidId), { status: "SETTLED", winner: p.winner.toLowerCase(), resultHash: p.resultHash, claimDeadline: p.claimDeadline }, ts);
  const pl = await player(context, p.winner);
  context.PlayerStats.set({ ...pl, nftRaidsWon: pl.nftRaidsWon + 1, lastWinAt: ts });
});
indexer.onEvent({ contract: "CommunityNftRaidVault", event: "Claimed" }, async ({ event, context }) => {
  const ts = event.block.timestamp, p = event.params, id = raidKey(event.srcAddress, p.raidId);
  const raid = await updateRaid(context, id, { status: "CLAIMED" }, ts);
  const winner = (raid?.winner ?? p.to).toLowerCase();
  context.RaidClaim.set({ id: eid(event), raid_id: id, winner, to: p.to.toLowerCase(), amount: 0n, txHash: event.transaction.hash, timestamp: ts });
  const pl = await player(context, winner);
  context.PlayerStats.set({ ...pl, prizesClaimed: pl.prizesClaimed + 1 });
});
indexer.onEvent({ contract: "CommunityNftRaidVault", event: "RefundAvailable" }, async ({ event, context }) => {
  await updateRaid(context, raidKey(event.srcAddress, event.params.raidId), { status: "REFUND_AVAILABLE" }, event.block.timestamp);
});
indexer.onEvent({ contract: "CommunityNftRaidVault", event: "Refunded" }, async ({ event, context }) => {
  await updateRaid(context, raidKey(event.srcAddress, event.params.raidId), { status: "REFUNDED" }, event.block.timestamp);
});
indexer.onEvent({ contract: "CommunityNftRaidVault", event: "TemplateSet" }, async ({ event, context }) => {
  context.log.info(`NFT raid template ${event.params.gameId} collection=${event.params.collection} enabled=${event.params.enabled}`);
});

// ---------------- Fees: hook -> accumulator -> manager -> vault ----------------
indexer.onEvent({ contract: "EconomyManager", event: "PoolConfigured" }, async ({ event, context }) => {
  const p = event.params;
  const prior = await context.Pool.get(p.poolId);
  context.Pool.set({ id: p.poolId, prizeVault: p.prizeVault.toLowerCase(), communityRecipient: p.communityRecipient.toLowerCase(),
    treasuryRecipient: p.treasuryRecipient.toLowerCase(), prizeBps: Number(p.prizeBps), communityBps: Number(p.communityBps), treasuryBps: Number(p.treasuryBps),
    totalFeesAccrued: prior?.totalFeesAccrued ?? 0n, totalDistributed: prior?.totalDistributed ?? 0n, swapCount: prior?.swapCount ?? 0 });
});
indexer.onEvent({ contract: "EconomyManager", event: "Distributed" }, async ({ event, context }) => {
  const ts = event.block.timestamp, p = event.params;
  context.Distribution.set({ id: eid(event), poolId: p.poolId, total: p.total, prize: p.prize, community: p.community, treasury: p.treasury, txHash: event.transaction.hash, timestamp: ts });
  const pool = await context.Pool.get(p.poolId);
  if (!pool) return;
  context.Pool.set({ ...pool, totalDistributed: pool.totalDistributed + p.total });
  const vb = await vaultBalance(context, pool.prizeVault, ts);
  context.VaultBalance.set({ ...vb, freeBalance: vb.freeBalance + p.prize, totalDistributedIn: vb.totalDistributedIn + p.prize, updatedAt: ts });
});
indexer.onEvent({ contract: "MiniCoinHook", event: "FeeCaptured" }, async ({ event, context }) => {
  const p = event.params;
  context.FeeAccrual.set({ id: eid(event), poolId: p.poolId, amount: p.amount, txHash: event.transaction.hash,
    trader: event.transaction.from?.toLowerCase(), blockNumber: event.block.number, timestamp: event.block.timestamp });
  const pool = await context.Pool.get(p.poolId);
  if (pool) context.Pool.set({ ...pool, totalFeesAccrued: pool.totalFeesAccrued + p.amount, swapCount: pool.swapCount + 1 });
});
indexer.onEvent({ contract: "MiniCoinHook", event: "FeeCollected" }, async ({ event, context }) => {
  context.log.info(`Fees collected for ${event.params.poolId}: ${event.params.amount} -> ${event.params.recipient}`);
});
indexer.onEvent({ contract: "FeeAccumulator", event: "HookSet" }, async ({ event, context }) => {
  context.log.info(`FeeAccumulator hook set: ${event.params.hook}`);
});
indexer.onEvent({ contract: "FeeAccumulator", event: "Redeemed" }, async ({ event, context }) => {
  context.log.info(`FeeAccumulator redeemed ${event.params.amount} -> ${event.params.recipient}`);
});
