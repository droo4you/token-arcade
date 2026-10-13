const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
process.env.APPDATA = path.resolve(__dirname, "../.data/appdata");
process.env.LOCALAPPDATA = path.resolve(__dirname, "../.data/localappdata");
const { ethers } = require("hardhat");
const { compileContracts } = require("../scripts/compile.cjs");

const compiled = compileContracts({
  "test/MockEntryToken.sol": fs.readFileSync(path.join(__dirname, "MockEntryToken.sol"), "utf8"),
  "test/MockFeeSource.sol": fs.readFileSync(path.join(__dirname, "MockFeeSource.sol"), "utf8"),
});

async function deploy(file, name, signer, ...args) {
  const artifact = compiled[file][name];
  const factory = new ethers.ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, signer);
  const instance = await factory.deploy(...args);
  await instance.waitForDeployment();
  return instance;
}

test("permissionless WMON distribution conserves each pool's fee and keeps allocations fixed", async () => {
  const [owner, caller, vault, community, treasury] = await ethers.getSigners();
  const wmon = await deploy("test/MockEntryToken.sol", "MockEntryToken", owner);
  const source = await deploy("test/MockFeeSource.sol", "MockFeeSource", owner, await wmon.getAddress());
  const manager = await deploy("src/EconomyManager.sol", "EconomyManager", owner,
    owner.address, await wmon.getAddress());
  await (await source.setManager(await manager.getAddress())).wait();
  await assert.rejects(manager.connect(caller).setFeeSource(await source.getAddress()));
  await (await manager.setFeeSource(await source.getAddress())).wait();
  await assert.rejects(manager.setFeeSource(await source.getAddress()));
  const a = ethers.id("skrumpey-pool-a");
  const b = ethers.id("skrumpey-pool-b");
  await assert.rejects(manager.connect(caller).configurePool(a, vault.address, community.address, treasury.address, 6500, 2000, 1500));
  await assert.rejects(manager.configurePool(a, vault.address, community.address, treasury.address, 6500, 2000, 1501));
  await (await manager.configurePool(a, vault.address, community.address, treasury.address, 6500, 2000, 1500)).wait();
  await (await manager.configurePool(b, vault.address, community.address, treasury.address, 5000, 2500, 2500)).wait();
  await assert.rejects(manager.configurePool(a, vault.address, community.address, treasury.address, 5000, 2500, 2500));
  await assert.rejects(manager.renounceOwnership());
  await assert.rejects(manager.distribute(a));

  await (await wmon.mint(owner.address, 301n)).wait();
  await (await wmon.approve(await source.getAddress(), 301n)).wait();
  await (await source.fund(a, 101n)).wait();
  await (await source.fund(b, 200n)).wait();
  await assert.rejects(manager.distribute(ethers.id("unconfigured")));
  await (await manager.connect(caller).distribute(a)).wait();
  assert.equal(await wmon.balanceOf(vault.address), 66n);
  assert.equal(await wmon.balanceOf(community.address), 20n);
  assert.equal(await wmon.balanceOf(treasury.address), 15n);
  assert.equal(await source.accrued(a), 0n);
  assert.equal(await source.accrued(b), 200n);
  assert.equal(await wmon.balanceOf(await manager.getAddress()), 0n);

  await (await manager.connect(caller).distribute(b)).wait();
  assert.equal(await wmon.balanceOf(vault.address), 166n);
  assert.equal(await wmon.balanceOf(community.address), 70n);
  assert.equal(await wmon.balanceOf(treasury.address), 65n);
  assert.equal(await source.accrued(b), 0n);
  assert.equal(await wmon.balanceOf(await source.getAddress()), 0n);
  await assert.rejects(source.connect(caller).collect(a, caller.address, 1n));
});
