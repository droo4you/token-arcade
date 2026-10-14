#!/usr/bin/env node
/*
 * Run one Free raid end-to-end on the deployed economy (Monad testnet or local rehearsal):
 *   wrap MON -> WMON, buy MiniCoin through the hooked pool (1% WMON hook fee accrues),
 *   distribute fees (prize vault / community / treasury), open the raid, wait for it to end,
 *   settle to WINNER (default deployer), and claim the prize.
 *
 *   RPC_URL=... PRIVATE_KEY=0x... BUY_WMON=0.05 node scripts/raid-loop-testnet.cjs
 * Requires a deployment made with DEPLOY_TEST_ROUTER=1. The signer must own the raid vault.
 * WINNER and RESULT_HASH come from the API's verified run; defaults are for the demo only.
 */
const fs = require("node:fs");
const C = require("./lib/economy-common.cjs");
const { ethers } = C;

async function main() {
  const { provider, signer, chainId, address: me } = await C.connect();
  const file = C.deploymentPath(chainId);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  if (d.status !== "complete" || !d.contracts.testRouter) throw new Error(`${file} incomplete or no testRouter`);
  const log = (...a) => console.log("[raid]", ...a);
  const send = async (label, p) => { const r = await (await p).wait(); log(`${label}: ${r.hash}`); return r; };
  const wmonAddr = d.external.wmon;
  const wmon = new ethers.Contract(wmonAddr, ["function deposit() payable", "function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"], signer);
  const router = C.at("EconomyTestRouter", d.contracts.testRouter, signer);
  const hook = C.at("MiniCoinHook", d.contracts.miniCoinHook, signer);
  const economy = C.at("EconomyManager", d.contracts.economyManager, signer);
  const vault = C.at("EconomyRaidVault", d.contracts.raidVault, signer);
  const key = d.pool.key, poolId = d.pool.poolId;
  const buy = ethers.parseEther(process.env.BUY_WMON || "0.05");

  if ((await wmon.balanceOf(me)) < buy) await send("wmon.deposit", wmon.deposit({ value: buy }));
  await send("wmon.approve(router)", wmon.approve(d.contracts.testRouter, ethers.MaxUint256));
  const wmonIs0 = key.currency0.toLowerCase() === wmonAddr.toLowerCase();
  const swapR = await send("router.swap(buy MiniCoin)", router.swap(key, { zeroForOne: wmonIs0, amountSpecified: -buy, sqrtPriceLimitX96: wmonIs0 ? C.MIN_SQRT : C.MAX_SQRT }, { gasLimit: 3_000_000n }));
  log(`hook accrued: ${ethers.formatEther(await hook.accrued(poolId))} WMON`);
  await send("economy.distribute", economy.distribute(poolId, { gasLimit: 1_000_000n }));
  log(`vault free balance: ${ethers.formatEther(await vault.freeBalance())} WMON`);
  const nextOpen = await vault.nextOpenAt();
  const now = BigInt((await provider.getBlock("latest")).timestamp);
  if (nextOpen > now) await waitUntil(provider, chainId, nextOpen, log);
  await send("vault.openEconomyRaid", vault.openEconomyRaid({ gasLimit: 1_000_000n }));
  const raidId = await vault.activeRaidId();
  const raid = await vault.raids(raidId);
  log(`raid ${raidId} prize ${ethers.formatEther(raid.prize)} WMON, ends ${new Date(Number(raid.endsAt) * 1000).toISOString()}`);
  await waitUntil(provider, chainId, raid.endsAt, log);
  const winner = process.env.WINNER || me;
  await send("vault.settleRaid", vault.settleRaid(raidId, winner, process.env.RESULT_HASH || ethers.id(`demo-result:${raidId}`), { gasLimit: 500_000n }));
  let claimTx;
  if (ethers.getAddress(winner) === me) claimTx = (await send("vault.claimPrize", vault.claimPrize(raidId, me, { gasLimit: 500_000n }))).hash;
  else log(`winner ${winner} must call claimPrize(${raidId}, <to>) themselves`);
  const out = { raidId, prizeWei: raid.prize.toString(), winner, swapTx: swapR.hash, claimTx, at: new Date().toISOString() };
  d.raids ??= []; d.raids.push(out); fs.writeFileSync(file, JSON.stringify(d, null, 2) + "\n");
  log("done", JSON.stringify(out));
}
async function waitUntil(provider, chainId, ts, log) {
  if (chainId === 31337n) { await provider.send("evm_setNextBlockTimestamp", [Number(ts)]); await provider.send("evm_mine", []); return; }
  for (;;) {
    const now = BigInt((await provider.getBlock("latest")).timestamp);
    if (now >= ts) return;
    log(`waiting ${ts - now}s for chain time...`); await new Promise((r) => setTimeout(r, Math.min(Number(ts - now), 15) * 1000 + 1000));
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
