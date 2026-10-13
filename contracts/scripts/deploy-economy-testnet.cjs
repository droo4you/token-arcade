#!/usr/bin/env node
/*
 * Deploy the MiniCoin economy to Monad testnet (chain 10143) or a local rehearsal chain (31337).
 *
 *   RPC_URL=https://testnet-rpc.monad.xyz PRIVATE_KEY=0x... node scripts/deploy-economy-testnet.cjs
 *
 * Deploys (or reuses, if already recorded in the deployment file and present on chain):
 *   MiniCoin (ExperimentalMinicoin, unless MINICOIN_ADDRESS is given), EconomyManager, FeeAccumulator,
 *   EconomyRaidVault, EconomyCreate2Deployer, MiniCoinHook (CREATE2-mined for v4 flags 0x20cc),
 *   optional EconomyTestRouter; wires setHook/setFeeSource/configurePool; initializes the
 *   MiniCoin/WMON v4 pool; optionally seeds one-sided MiniCoin liquidity.
 * Writes addresses to deployments/monad-testnet.json (or deployments/local-<chain>.json).
 *
 * Env (all optional except RPC_URL/PRIVATE_KEY):
 *   POOL_MANAGER, WMON           default: Monad-maintained testnet v4 infra (see lib/economy-common.cjs)
 *   MINICOIN_ADDRESS             reuse an existing MiniCoin (e.g. from the Creator Portal launch flow)
 *   MINICOIN_NAME/SYMBOL/SUPPLY  default "Skrumpey Slide MiniCoin"/"SLIDE"/1e9 tokens
 *   GAME_ID                      default skrumpey-slide
 *   OWNER                        final owner of manager/accumulator/vault (default deployer; ownership is
 *                                transferred at the end if different — the raid settler must be the owner)
 *   COMMUNITY_RECIPIENT, TREASURY_RECIPIENT   default deployer
 *   SPLIT_BPS                    prize,community,treasury default 6500,2000,1500
 *   LP_FEE=3000 TICK_SPACING=60 HOOK_FEE_BPS=100
 *   RAID_THRESHOLD_WEI=1 RAID_MAX_PRIZE_WEI=1e18 RAID_PRIZE_BPS=2500 RAID_COOLDOWN=60 RAID_DURATION=120
 *   RAID_SETTLE_TIMEOUT=3600 RAID_CLAIM_WINDOW=86400
 *   DEPLOY_TEST_ROUTER=1         deploy EconomyTestRouter (needed for seed liquidity + raid-loop demo)
 *   SEED_LIQUIDITY=100000e18     one-sided MiniCoin liquidity units (requires router; 0 disables)
 * Never targets mainnet: chain 143 is refused.
 */
const fs = require("node:fs");
const path = require("node:path");
const C = require("./lib/economy-common.cjs");
const { ethers } = C;

const num = (v, d) => (v === undefined || v === "" ? d : BigInt(v.replace(/e(\d+)$/, (_, e) => "0".repeat(+e))));

async function main() {
  const { provider, signer, chainId, address: deployer } = await C.connect();
  const known = C.KNOWN[Number(chainId)] || {};
  const poolManager = process.env.POOL_MANAGER || known.poolManager;
  const wmon = process.env.WMON || known.wmon;
  if (!poolManager || !wmon) throw new Error("POOL_MANAGER and WMON are required on this chain.");
  for (const [n, a] of [["POOL_MANAGER", poolManager], ["WMON", wmon]]) {
    if ((await provider.getCode(a)) === "0x") throw new Error(`${n} ${a} has no code on chain ${chainId}`);
  }
  const outPath = C.deploymentPath(chainId);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const state = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : {};
  if (state.chainId && state.chainId !== chainId.toString()) throw new Error(`${outPath} is for chain ${state.chainId}`);
  Object.assign(state, { chainId: chainId.toString(), deployer, status: "incomplete", updatedAt: new Date().toISOString() });
  state.external = { poolManager, wmon, source: known.poolManager ? "Monad-maintained v4 testnet infra: github.com/monad-developers/uniswap-v4-hooks-example@c3cc78a shared-infrastructure.json" : "env/local" };
  state.contracts ??= {};
  const save = () => fs.writeFileSync(outPath, JSON.stringify(state, null, 2) + "\n");
  save();
  const log = (...a) => console.log("[deploy]", ...a);
  log(`chain ${chainId}, deployer ${deployer}, balance ${ethers.formatEther(await provider.getBalance(deployer))} MON`);

  async function reuse(key) {
    const a = state.contracts[key];
    return a && (await provider.getCode(a)) !== "0x" ? a : undefined;
  }
  async function deployOnce(key, name, ...args) {
    const existing = await reuse(key);
    if (existing) { log(`${key}: reuse ${existing}`); return C.at(name, existing, signer); }
    const c = await C.factoryFor(name, signer).deploy(...args);
    await c.waitForDeployment();
    state.contracts[key] = await c.getAddress(); save();
    log(`${key}: ${state.contracts[key]}`);
    return c;
  }
  async function send(label, txPromise) { const r = await (await txPromise).wait(); log(`${label}: ${r.hash}`); state.txs ??= {}; state.txs[label] = r.hash; save(); return r; }

  const gameIdText = process.env.GAME_ID || "skrumpey-slide";
  const gameId = ethers.id(gameIdText);
  const supply = num(process.env.MINICOIN_SUPPLY, 1_000_000_000n * 10n ** 18n);

  // 1. MiniCoin
  let miniCoinAddr = process.env.MINICOIN_ADDRESS;
  if (miniCoinAddr) { state.contracts.miniCoin = miniCoinAddr; state.miniCoinSource = "MINICOIN_ADDRESS"; save(); }
  else {
    const mc = await deployOnce("miniCoin", "ExperimentalMinicoin", {
      gameId, name: process.env.MINICOIN_NAME || "Skrumpey Slide MiniCoin", symbol: process.env.MINICOIN_SYMBOL || "SLIDE",
      metadataURI: process.env.MINICOIN_METADATA_URI || "", communityAssetType: 0, communityAsset: ethers.ZeroAddress,
      communityTokenId: 0, strategyRef: ethers.ZeroHash, treasury: process.env.TREASURY_RECIPIENT || deployer,
      supplyRecipient: deployer, initialSupply: supply,
    }, deployer);
    miniCoinAddr = await mc.getAddress(); state.miniCoinSource = "deployed ExperimentalMinicoin (testnet only)";
  }
  // 2. Core economy
  const economy = await deployOnce("economyManager", "EconomyManager", deployer, wmon);
  const accumulator = await deployOnce("feeAccumulator", "FeeAccumulator", deployer, poolManager, wmon);
  const raidConfig = {
    threshold: num(process.env.RAID_THRESHOLD_WEI, 1n), maxPrize: num(process.env.RAID_MAX_PRIZE_WEI, 10n ** 18n),
    prizeBps: Number(process.env.RAID_PRIZE_BPS || 2500), cooldown: Number(process.env.RAID_COOLDOWN || 60),
    duration: Number(process.env.RAID_DURATION || 120), settlementTimeout: Number(process.env.RAID_SETTLE_TIMEOUT || 3600),
    claimWindow: Number(process.env.RAID_CLAIM_WINDOW || 86400), rulesHash: ethers.id(`${gameIdText}:free-raid:v1`),
  };
  const vault = await deployOnce("raidVault", "EconomyRaidVault", deployer, wmon, miniCoinAddr, gameId, raidConfig);
  const create2 = await deployOnce("create2Deployer", "EconomyCreate2Deployer");

  // 3. Hook via CREATE2 address mining
  const lpFee = Number(process.env.LP_FEE || 3000), tickSpacing = Number(process.env.TICK_SPACING || 60), hookFeeBps = Number(process.env.HOOK_FEE_BPS || 100);
  let hookAddr = await reuse("miniCoinHook");
  if (!hookAddr) {
    const initCode = (await C.factoryFor("MiniCoinHook", signer).getDeployTransaction(
      poolManager, wmon, miniCoinAddr, await economy.getAddress(), await accumulator.getAddress(), deployer, lpFee, tickSpacing, hookFeeBps)).data;
    const { salt, target, iterations } = C.mineHookSalt(await create2.getAddress(), initCode);
    log(`mined hook salt ${salt} after ${iterations} tries -> ${target}`);
    await send("deployHook", create2.deploy(initCode, salt, { gasLimit: 6_000_000n }));
    if ((await provider.getCode(target)) === "0x") throw new Error("Hook not deployed at mined address");
    hookAddr = target; state.contracts.miniCoinHook = target; state.hookSalt = salt; save();
  } else log(`miniCoinHook: reuse ${hookAddr}`);
  const hook = C.at("MiniCoinHook", hookAddr, signer);

  // 4. Wiring
  if ((await accumulator.hook()) === ethers.ZeroAddress) await send("accumulator.setHook", accumulator.setHook(hookAddr));
  if ((await economy.feeSource()) === ethers.ZeroAddress) await send("economy.setFeeSource", economy.setFeeSource(hookAddr));
  const key = C.poolKey(miniCoinAddr, wmon, lpFee, tickSpacing, hookAddr);
  const poolId = C.poolIdOf(key);
  if ((await hook.approvedPoolId()) !== poolId) throw new Error("Hook approvedPoolId mismatch");
  state.pool = { key, poolId, lpFee, tickSpacing, hookFeeBps }; save();
  const [prizeBps, communityBps, treasuryBps] = (process.env.SPLIT_BPS || "6500,2000,1500").split(",").map(Number);
  const alloc = await economy.allocations(poolId);
  if (!alloc.configured) await send("economy.configurePool", economy.configurePool(poolId, await vault.getAddress(),
    process.env.COMMUNITY_RECIPIENT || deployer, process.env.TREASURY_RECIPIENT || deployer, prizeBps, communityBps, treasuryBps));
  state.split = { prizeBps, communityBps, treasuryBps }; save();

  // 5. Pool initialization at 1:1 (sqrtPriceX96 = 2^96) unless SQRT_PRICE_X96 given
  const pm = C.at("PoolManager", poolManager, signer);
  if (!state.poolInitialized) {
    await send("poolManager.initialize", pm.initialize(key, num(process.env.SQRT_PRICE_X96, 2n ** 96n)));
    state.poolInitialized = true; save();
  }

  // 6. Optional test router + one-sided MiniCoin seed liquidity (no WMON needed)
  if (process.env.DEPLOY_TEST_ROUTER === "1") {
    const router = await deployOnce("testRouter", "EconomyTestRouter", poolManager);
    const seed = num(process.env.SEED_LIQUIDITY, 100_000n * 10n ** 18n);
    if (seed > 0n && !state.seededLiquidity) {
      const mc = C.at("ExperimentalMinicoin", miniCoinAddr, signer);
      await send("miniCoin.approve(router)", mc.approve(await router.getAddress(), ethers.MaxUint256));
      const wmonIs0 = key.currency0.toLowerCase() === wmon.toLowerCase();
      const ticks = wmonIs0 ? [-2 * tickSpacing, -tickSpacing] : [tickSpacing, 2 * tickSpacing];
      await send("router.addLiquidity(seed)", router.addLiquidity(key, ...ticks, seed, { gasLimit: 3_000_000n }));
      state.seededLiquidity = { ticks, liquidity: seed.toString() }; save();
    }
  }
  // 7. Optional ownership handoff
  const owner = process.env.OWNER;
  if (owner && ethers.getAddress(owner) !== deployer) {
    for (const [k, c] of [["economyManager", economy], ["feeAccumulator", accumulator], ["raidVault", vault]]) {
      if ((await c.owner()) === deployer) await send(`${k}.transferOwnership`, c.transferOwnership(owner));
    }
    state.owner = ethers.getAddress(owner);
  } else state.owner = deployer;
  state.status = "complete"; state.updatedAt = new Date().toISOString(); save();
  log(`done -> ${outPath}`);
  console.log(JSON.stringify(state.contracts, null, 2));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
