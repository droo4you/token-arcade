// Read-only onchain verification; persists only public receipts and verification evidence.
const fs = require("node:fs");
const C = require("./lib/economy-common.cjs");
const { ethers } = C;
const equal = (a, b, label) => { if (String(a).toLowerCase() !== String(b).toLowerCase()) throw new Error(`${label} mismatch`); };
async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.TESTNET_RPC_URL || process.env.RPC_URL);
  try {
    const chain = (await provider.getNetwork()).chainId;
    if (chain !== 10143n) throw new Error("Verification is testnet-only");
    const file = C.deploymentPath(chain);
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    equal(d.chainId, chain, "chain");
    if (d.status !== "complete" || !d.raids?.length) throw new Error("Deployment and raid claim must complete first");
    const codeHashes = {};
    for (const [name, address] of Object.entries(d.contracts)) {
      const code = await provider.getCode(address);
      if (code === "0x") throw new Error(`${name} has no code`);
      codeHashes[name] = ethers.keccak256(code);
    }
    const c = d.contracts;
    const hook = C.at("MiniCoinHook", c.miniCoinHook, provider);
    const economy = C.at("EconomyManager", c.economyManager, provider);
    const accumulator = C.at("FeeAccumulator", c.feeAccumulator, provider);
    const vault = C.at("EconomyRaidVault", c.raidVault, provider);
    equal(BigInt(c.miniCoinHook) & 0x3fffn, C.HOOK_FLAGS, "hook flags");
    equal(await hook.approvedPoolId(), d.pool.poolId, "pool");
    equal(await hook.poolManager(), d.external.poolManager, "pool manager");
    equal(await hook.wmon(), d.external.wmon, "WMON");
    equal(await accumulator.hook(), c.miniCoinHook, "accumulator hook");
    equal(await economy.feeSource(), c.miniCoinHook, "economy fee source");
    equal(await vault.minicoin(), c.miniCoin, "vault token");
    equal(await vault.gameId(), ethers.id(d.gameId), "vault game");
    const allocation = await economy.allocations(d.pool.poolId);
    equal(allocation.prizeVault, c.raidVault, "allocation vault");
    const receipts = {};
    const txs = { ...d.txs, ...d.raids.at(-1).transactions };
    for (const [label, hash] of Object.entries(txs)) {
      const r = await provider.getTransactionReceipt(hash);
      if (!r || r.status !== 1) throw new Error(`${label} has no successful receipt`);
      receipts[label] = { hash, blockNumber: r.blockNumber, gasUsed: r.gasUsed.toString() };
    }
    const last = d.raids.at(-1);
    const raid = await vault.raids(last.raidId);
    equal(raid.status, 3n, "raid claimed status");
    equal(raid.winner, last.winner, "winner");
    equal(raid.prize, last.prizeWei, "prize");
    equal(await hook.accrued(d.pool.poolId), 0n, "distributed fees");
    equal(await vault.lockedBalance(), 0n, "remaining locked prizes");
    d.startBlock = Math.min(...Object.values(receipts).map((r) => r.blockNumber));
    d.verification = { at: new Date().toISOString(), codeHashes, receipts, claimed: true,
      vaultFreeWei: (await vault.freeBalance()).toString(), remainingTestMon: ethers.formatEther(await provider.getBalance(d.deployer)) };
    fs.writeFileSync(file, JSON.stringify(d, null, 2) + "\n");
    console.log(JSON.stringify({ chain: Number(chain), startBlock: d.startBlock, verifiedTransactions: Object.keys(receipts).length,
      raidId: last.raidId, claimTx: last.claimTx, prizeWei: last.prizeWei, remainingTestMon: d.verification.remainingTestMon }));
  } finally { provider.destroy(); }
}
main().catch((e) => { console.error(e.shortMessage || e.message); process.exitCode = 1; });
