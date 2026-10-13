const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
process.env.APPDATA = path.resolve(__dirname, "../.data/appdata");
process.env.LOCALAPPDATA = path.resolve(__dirname, "../.data/localappdata");
const { ethers, network } = require("hardhat");
const { compileContracts } = require("../scripts/compile.cjs");

// A minimal real PoolManager unlock caller. Every swap settles both currencies;
// this exercises v4 flash accounting and hook deltas rather than calling callbacks directly.
const harnessSource = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MiniCoinHookTestRouter is IUnlockCallback {
    using BalanceDeltaLibrary for BalanceDelta;
    IPoolManager public immutable manager;
    struct Call {
        bool liquidity;
        address payer;
        PoolKey key;
        ModifyLiquidityParams liq;
        SwapParams swapParams;
    }
    constructor(IPoolManager manager_) { manager = manager_; }
    function addLiquidity(PoolKey calldata key, int24 tickLower, int24 tickUpper, int256 liquidityDelta) external returns (BalanceDelta delta) {
        ModifyLiquidityParams memory liq = ModifyLiquidityParams(tickLower, tickUpper, liquidityDelta, bytes32(0));
        Call memory c = Call(true, msg.sender, key, liq, SwapParams(false, 0, 0));
        delta = abi.decode(manager.unlock(abi.encode(c)), (BalanceDelta));
    }
    function swap(PoolKey calldata key, SwapParams calldata params) external returns (BalanceDelta delta) {
        Call memory c = Call(false, msg.sender, key, ModifyLiquidityParams(0, 0, 0, bytes32(0)), params);
        delta = abi.decode(manager.unlock(abi.encode(c)), (BalanceDelta));
    }
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager), "manager only");
        Call memory c = abi.decode(data, (Call));
        BalanceDelta delta;
        if (c.liquidity) (delta,) = manager.modifyLiquidity(c.key, c.liq, "");
        else delta = manager.swap(c.key, c.swapParams, "");
        _settle(c.key.currency0, c.payer, delta.amount0());
        _settle(c.key.currency1, c.payer, delta.amount1());
        return abi.encode(delta);
    }
    function _settle(Currency currency, address payer, int128 amount) private {
        if (amount < 0) {
            manager.sync(currency);
            require(IERC20(Currency.unwrap(currency)).transferFrom(payer, address(manager), uint256(uint128(-amount))));
            manager.settle();
        } else if (amount > 0) {
            manager.take(currency, payer, uint256(uint128(amount)));
        }
    }
}

contract MiniCoinHookCreate2Deployer {
    function deploy(bytes memory code, bytes32 salt) external returns (address deployed) {
        assembly { deployed := create2(0, add(code, 32), mload(code), salt) }
        require(deployed != address(0), "CREATE2 failed");
    }
}
`;

const compiled = compileContracts({
  "test/MiniCoinHookHarness.sol": harnessSource,
  "test/MockEntryToken.sol": fs.readFileSync(path.join(__dirname, "MockEntryToken.sol"), "utf8"),
  "@uniswap/v4-core/src/PoolManager.sol": fs.readFileSync(
    path.join(__dirname, "../node_modules/@uniswap/v4-core/src/PoolManager.sol"), "utf8",
  ),
});
const artifact = (file, name) => compiled[file][name];

async function deploy(file, name, signer, ...args) {
  const a = artifact(file, name);
  const factory = new ethers.ContractFactory(a.abi, `0x${a.evm.bytecode.object}`, signer);
  const instance = await factory.deploy(...args);
  await instance.waitForDeployment();
  return instance;
}

function saltForFlags(deployer, initCode, flags) {
  const initCodeHash = ethers.keccak256(initCode);
  for (let i = 0; i < 200_000; i++) {
    const salt = ethers.toBeHex(i, 32);
    const target = ethers.getCreate2Address(deployer, salt, initCodeHash);
    if ((BigInt(target) & 0x3fffn) === flags) return { salt, target };
  }
  throw new Error("Could not mine v4 hook callback address");
}

function feeEvents(hook, receipt) {
  return receipt.logs.flatMap((log) => {
    if (log.address.toLowerCase() !== hook.target.toLowerCase()) return [];
    try {
      const parsed = hook.interface.parseLog(log);
      return parsed?.name === "FeeCaptured" ? [parsed.args.amount] : [];
    } catch { return []; }
  });
}

for (const wmonFirst of [true, false]) test(`real v4 swaps -> claims -> allocation -> raid -> winner (WMON currency${wmonFirst ? 0 : 1})`, async () => {
  const [admin, trader, collector, outsider, treasury, winner] = await ethers.getSigners();
  const poolManager = await deploy("@uniswap/v4-core/src/PoolManager.sol", "PoolManager", admin, admin.address);
  const tokens = [await deploy("test/MockEntryToken.sol", "MockEntryToken", admin), await deploy("test/MockEntryToken.sol", "MockEntryToken", admin)];
  tokens.sort((a, b) => BigInt(a.target) < BigInt(b.target) ? -1 : 1);
  const wmon = tokens[wmonFirst ? 0 : 1];
  const miniCoin = tokens[wmonFirst ? 1 : 0];
  const economy = await deploy("src/EconomyManager.sol", "EconomyManager", admin, admin.address, wmon.target);
  const accumulator = await deploy("src/FeeAccumulator.sol", "FeeAccumulator", admin, admin.address, poolManager.target, wmon.target);
  const vault = await deploy("src/EconomyRaidVault.sol", "EconomyRaidVault", admin,
    admin.address, wmon.target, miniCoin.target, ethers.id("skrumpey-slide"),
    { threshold: 1n, maxPrize: ethers.parseEther("10"), prizeBps: 2500, cooldown: 60,
      duration: 60, settlementTimeout: 600, claimWindow: 86400, rulesHash: ethers.id("local-rehearsal-rules") });
  const create2 = await deploy("test/MiniCoinHookHarness.sol", "MiniCoinHookCreate2Deployer", admin);
  const router = await deploy("test/MiniCoinHookHarness.sol", "MiniCoinHookTestRouter", admin, await poolManager.getAddress());

  const hookArtifact = artifact("src/MiniCoinHook.sol", "MiniCoinHook");
  const hookFactory = new ethers.ContractFactory(hookArtifact.abi, `0x${hookArtifact.evm.bytecode.object}`, admin);
  const initCode = (await hookFactory.getDeployTransaction(
    await poolManager.getAddress(), await wmon.getAddress(), await miniCoin.getAddress(),
    economy.target, accumulator.target, admin.address, 3000, 60, 100,
  )).data;
  // BEFORE_INITIALIZE | BEFORE_SWAP | AFTER_SWAP | BEFORE_SWAP_RETURNS_DELTA | AFTER_SWAP_RETURNS_DELTA.
  const { salt, target } = saltForFlags(await create2.getAddress(), initCode, 0x20ccn);
  await (await create2.deploy(initCode, salt)).wait();
  const hook = new ethers.Contract(target, hookArtifact.abi, admin);
  await assert.rejects(accumulator.connect(outsider).setHook(target));
  await (await accumulator.setHook(target)).wait();
  await assert.rejects(accumulator.setHook(target));
  await (await economy.setFeeSource(target)).wait();
  assert.equal(await hook.hookFeeBps(), 100n);

  const miniAddress = await miniCoin.getAddress();
  const wmonAddress = await wmon.getAddress();
  const key = {
    currency0: BigInt(miniAddress) < BigInt(wmonAddress) ? miniAddress : wmonAddress,
    currency1: BigInt(miniAddress) < BigInt(wmonAddress) ? wmonAddress : miniAddress,
    fee: 3000, tickSpacing: 60, hooks: target,
  };
  const poolId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)"], [key],
  ));
  assert.equal(await hook.approvedPoolId(), poolId);
  await (await economy.configurePool(poolId, vault.target, collector.address, treasury.address, 6500, 2000, 1500)).wait();
  await assert.rejects(poolManager.connect(outsider).initialize(key, 2n ** 96n));
  await assert.rejects(poolManager.initialize({ ...key, fee: 10_000 }, 2n ** 96n));
  await (await poolManager.initialize(key, 2n ** 96n)).wait();

  const mintAmount = 1_000_000_000n * 10n ** 18n;
  for (const token of [miniCoin, wmon]) {
    await (await token.mint(admin.address, mintAmount)).wait();
    await (await token.mint(trader.address, mintAmount)).wait();
    await (await token.approve(await router.getAddress(), ethers.MaxUint256)).wait();
    await (await token.connect(trader).approve(await router.getAddress(), ethers.MaxUint256)).wait();
  }
  const wmonIs0 = key.currency0.toLowerCase() === wmonAddress.toLowerCase();
  const oneSidedTicks = wmonIs0 ? [-120, -60] : [60, 120];
  await (await router.addLiquidity(key, ...oneSidedTicks, 100_000n * 10n ** 18n)).wait();
  assert.equal(await wmon.balanceOf(poolManager.target), 0n, "one-sided launch starts with no WMON reserves");
  assert.ok(await miniCoin.balanceOf(poolManager.target) > 0n);
  const firstBuyParams = {
    zeroForOne: wmonIs0,
    amountSpecified: -1n * 10n ** 18n,
    sqrtPriceLimitX96: wmonIs0 ? 4295128740n : 1461446703485210103287273052203988822378723970341n,
  };
  const firstBuy = await (await router.connect(trader).swap(key, firstBuyParams)).wait();
  let totalFees = feeEvents(hook, firstBuy).reduce((a, b) => a + b, 0n);
  assert.equal(totalFees, ethers.parseEther("0.01"), "first buy works without preexisting WMON reserves");
  assert.equal(await poolManager.balanceOf(accumulator.target, BigInt(wmonAddress)), totalFees);
  await (await router.addLiquidity(key, -887220, 887220, 100_000n * 10n ** 18n)).wait();

  const scenarios = [
    { name: "exact-input WMON input", zeroForOne: wmonIs0, amountSpecified: -1000n * 10n ** 18n, before: true },
    { name: "exact-input WMON output", zeroForOne: !wmonIs0, amountSpecified: -1000n * 10n ** 18n, before: false },
    { name: "exact-output WMON output", zeroForOne: !wmonIs0, amountSpecified: 100n * 10n ** 18n, before: true },
    { name: "exact-output WMON input", zeroForOne: wmonIs0, amountSpecified: 100n * 10n ** 18n, before: false },
  ];
  // Deterministic bounded amount sweep over every direction/amount mode.
  let seed = 0x5eed1234;
  for (let i = 0; i < 16; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const template = scenarios[i % 4];
    const wholeTokens = BigInt(20 + seed % 481);
    scenarios.push({
      ...template,
      name: `${template.name} amount sweep ${i + 1}`,
      amountSpecified: (template.amountSpecified < 0n ? -1n : 1n) * wholeTokens * 10n ** 18n,
    });
  }
  for (const scenario of scenarios) {
    const priorWmon = await wmon.balanceOf(trader.address);
    const params = {
      zeroForOne: scenario.zeroForOne,
      amountSpecified: scenario.amountSpecified,
      sqrtPriceLimitX96: scenario.zeroForOne ? 4295128740n : 1461446703485210103287273052203988822378723970341n,
    };
    const receipt = await (await router.connect(trader).swap(key, params)).wait();
    const poolSwaps = receipt.logs.flatMap((log) => {
      if (log.address.toLowerCase() !== (poolManager.target).toLowerCase()) return [];
      try {
        const parsed = poolManager.interface.parseLog(log);
        return parsed?.name === "Swap" ? [parsed.args] : [];
      } catch { return []; }
    });
    assert.equal(poolSwaps.length, 1, `${scenario.name}: one real pool swap`);
    const fees = feeEvents(hook, receipt);
    assert.equal(fees.length, 1, scenario.name);
    const fee = fees[0];
    assert.ok(fee > 0n, scenario.name);
    if (scenario.before) {
      const requested = scenario.amountSpecified < 0n ? -scenario.amountSpecified : scenario.amountSpecified;
      const expected = scenario.amountSpecified < 0n
        ? requested / 100n
        : (requested * 100n + 9899n) / 9900n;
      assert.equal(fee, expected, `${scenario.name}: specified WMON fee`);
    } else {
      const poolWmonLeg = wmonIs0 ? poolSwaps[0].amount0 : poolSwaps[0].amount1;
      const absoluteLeg = poolWmonLeg < 0n ? -poolWmonLeg : poolWmonLeg;
      assert.equal(fee, absoluteLeg / 100n, `${scenario.name}: 1% of the WMON pool leg`);
    }
    totalFees += fee;
    assert.equal(await hook.accrued(poolId), totalFees, scenario.name);
    assert.equal(await poolManager.balanceOf(accumulator.target, BigInt(wmonAddress)), totalFees, `${scenario.name}: WMON claims match ledger`);
    assert.equal(await wmon.balanceOf(target), 0n);
    const traderWmon = await wmon.balanceOf(trader.address);
    if (scenario.name === "exact-input WMON input") {
      assert.equal(fee, 10n * 10n ** 18n);
      assert.equal(priorWmon - traderWmon, 1000n * 10n ** 18n);
    }
    if (scenario.name === "exact-output WMON output") {
      assert.equal(fee, (scenario.amountSpecified * 100n + 9899n) / 9900n);
      assert.equal(traderWmon - priorWmon, scenario.amountSpecified);
    }
  }

  await assert.rejects(hook.connect(outsider).collect(poolId, collector.address, totalFees));
  await assert.rejects(accumulator.connect(outsider).redeem(outsider.address, 1n));
  await assert.rejects(accumulator.unlockCallback("0x"));
  await (await economy.connect(outsider).distribute(poolId)).wait();
  assert.equal(await hook.accrued(poolId), 0n);
  assert.equal(await poolManager.balanceOf(accumulator.target, BigInt(wmonAddress)), 0n);
  const communityShare = totalFees * 2000n / 10000n;
  const treasuryShare = totalFees * 1500n / 10000n;
  const raidShare = totalFees - communityShare - treasuryShare;
  assert.equal(await wmon.balanceOf(collector.address), communityShare);
  assert.equal(await wmon.balanceOf(treasury.address), treasuryShare);
  assert.equal(await vault.freeBalance(), raidShare);
  assert.equal(await wmon.balanceOf(economy.target), 0n);
  await assert.rejects(economy.distribute(poolId));

  await (await vault.connect(outsider).openEconomyRaid()).wait();
  const raidId = await vault.activeRaidId();
  const raid = await vault.raids(raidId);
  assert.ok(raid.prize > 0n && raid.prize <= raidShare / 4n);
  await network.provider.send("evm_setNextBlockTimestamp", [Number(raid.endsAt)]);
  await network.provider.send("evm_mine");
  await (await vault.settleRaid(raidId, winner.address, ethers.id("local-verified-result"))).wait();
  await (await vault.connect(winner).claimPrize(raidId, winner.address)).wait();
  assert.equal(await wmon.balanceOf(winner.address), raid.prize);
  assert.equal(await vault.freeBalance(), raidShare - raid.prize);
  assert.equal(await vault.lockedBalance(), 0n);
});
