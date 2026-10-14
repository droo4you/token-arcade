const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");
process.env.APPDATA = path.resolve(__dirname, "../.data/appdata");
process.env.LOCALAPPDATA = path.resolve(__dirname, "../.data/localappdata");
const hre = require("hardhat");
const C = require("../scripts/lib/economy-common.cjs");

test("testnet router rejects outsiders removing the operator's shared liquidity", async () => {
  const [owner, outsider] = await hre.ethers.getSigners();
  const manager = await C.factoryFor("PoolManager", owner).deploy(owner.address);
  await manager.waitForDeployment();
  const router = await C.factoryFor("EconomyTestRouter", owner).deploy(await manager.getAddress());
  await router.waitForDeployment();
  assert.equal(await router.liquidityOwner(), owner.address);
  const key = C.poolKey(owner.address, outsider.address, 3000, 60, C.ethers.ZeroAddress);
  await assert.rejects(router.connect(outsider).addLiquidity(key, 60, 120, -1n), /liquidity owner only/);
  await assert.rejects(router.connect(outsider).addLiquidity(key, 60, 120, 1n), /liquidity owner only/);
});
