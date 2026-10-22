const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
process.env.APPDATA = path.resolve(__dirname, "../.data/appdata");
process.env.LOCALAPPDATA = path.resolve(__dirname, "../.data/localappdata");
const { ethers, network } = require("hardhat");
const { compileContracts } = require("../scripts/compile.cjs");

const compiled = compileContracts({
  "test/MockEntryToken.sol": fs.readFileSync(path.join(__dirname, "MockEntryToken.sol"), "utf8"),
});

test("atomic payout delivers to a zero-gas winner and cannot be repeated", async () => {
  const { admin, other, wmon, vault } = await setup();
  const recipient = ethers.Wallet.createRandom().address;
  await (await wmon.mint(await vault.getAddress(), 400)).wait();
  const raidId = await openRaid(vault);
  const result = ethers.id("automatic-result");
  await assert.rejects(vault.settleAndPay(raidId, recipient, result));
  await advanceTo((await vault.raids(raidId)).endsAt);
  await assert.rejects(vault.connect(other).settleAndPay(raidId, recipient, result));
  assert.equal(await vault.payoutVersion(), 1n);
  const receipt = await (await vault.connect(admin).settleAndPay(raidId, recipient, result)).wait();
  const events = receipt.logs.map(log => { try { return vault.interface.parseLog(log); } catch { return null; } });
  assert.equal(events.find(e => e?.name === "PrizeClaimed").args.winner, recipient);
  assert.equal(events.find(e => e?.name === "PrizeClaimed").args.to, recipient);
  assert.ok(events.find(e => e?.name === "RaidSettled"));
  assert.equal(await ethers.provider.getBalance(recipient), 0n);
  assert.equal(await wmon.balanceOf(recipient), 75n);
  assert.equal((await vault.raids(raidId)).status, 3n);
  assert.equal(await vault.lockedBalance(), 0n);
  assert.equal(await vault.freeBalance(), 325n);
  await assert.rejects(vault.settleAndPay(raidId, recipient, result));
  await assert.rejects(vault.connect(other).payWinner(raidId));
});

test("sponsored retry pays only the stored winner", async () => {
  const { winner, other, wmon, vault } = await setup();
  await (await wmon.mint(await vault.getAddress(), 400)).wait();
  const raidId = await openRaid(vault);
  await assert.rejects(vault.payWinner(raidId));
  await advanceTo((await vault.raids(raidId)).endsAt);
  await (await vault.settleRaid(raidId, winner.address, ethers.id("result"))).wait();
  await (await vault.connect(other).payWinner(raidId)).wait();
  assert.equal(await wmon.balanceOf(winner.address), 75n);
  assert.equal(await wmon.balanceOf(other.address), 0n);
  await assert.rejects(vault.connect(winner).claimPrize(raidId, other.address));
});

test("failed atomic transfer rolls back settlement and preserves reserved funds", async () => {
  const { winner, wmon, vault } = await setup();
  await (await wmon.mint(await vault.getAddress(), 400)).wait();
  const id = await openRaid(vault);
  await advanceTo((await vault.raids(id)).endsAt);
  await (await wmon.setRejectTransfers(true)).wait();
  await assert.rejects(vault.settleAndPay(id, winner.address, ethers.id("result")));
  assert.equal((await vault.raids(id)).status, 1n);
  assert.equal(await vault.activeRaidId(), id);
  assert.equal(await vault.lockedBalance(), 75n);
  assert.equal(await wmon.balanceOf(winner.address), 0n);
  await (await wmon.setRejectTransfers(false)).wait();
  await (await vault.settleAndPay(id, winner.address, ethers.id("result"))).wait();
  assert.equal(await wmon.balanceOf(winner.address), 75n);
});

async function deploy(file, name, signer, ...args) {
  const artifact = compiled[file][name];
  const factory = new ethers.ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, signer);
  const deployed = await factory.deploy(...args);
  await deployed.waitForDeployment();
  return deployed;
}

function config(overrides = {}) {
  return {
    threshold: 400n,
    maxPrize: 75n,
    prizeBps: 2500,
    cooldown: 60,
    duration: 3600,
    settlementTimeout: 600,
    claimWindow: 86400,
    rulesHash: ethers.id("slide-v1-free-raid-rules"),
    ...overrides,
  };
}

async function setup(initialConfig = config()) {
  const [admin, winner, other] = await ethers.getSigners();
  const wmon = await deploy("test/MockEntryToken.sol", "MockEntryToken", admin);
  const minicoin = await deploy("test/MockEntryToken.sol", "MockEntryToken", admin);
  const gameId = ethers.id("skrumpey-slide");
  const vault = await deploy(
    "src/EconomyRaidVault.sol", "EconomyRaidVault", admin,
    admin.address, await wmon.getAddress(), await minicoin.getAddress(), gameId, initialConfig,
  );
  return { admin, winner, other, wmon, minicoin, gameId, vault };
}

async function openRaid(vault) {
  const receipt = await (await vault.openEconomyRaid()).wait();
  const event = receipt.logs
    .map((log) => { try { return vault.interface.parseLog(log); } catch { return null; } })
    .find((log) => log?.name === "RaidOpened");
  assert.ok(event);
  return event.args.raidId;
}

async function advanceTo(timestamp) {
  await network.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
  await network.provider.send("evm_mine");
}

test("direct WMON allocations trigger one free-entry raid and stay separate from locked WMON", async () => {
  const { admin, other, wmon, minicoin, gameId, vault } = await setup(config({ threshold: 100n, maxPrize: 100n }));
  assert.equal(await vault.wmon(), await wmon.getAddress());
  assert.equal(await vault.minicoin(), await minicoin.getAddress());
  assert.equal(await vault.gameId(), gameId);
  assert.equal(await vault.freeBalance(), 0n);

  await (await wmon.mint(admin.address, 200)).wait();
  await (await wmon.transfer(await vault.getAddress(), 99)).wait();
  await assert.rejects(vault.connect(other).openEconomyRaid());
  await (await wmon.transfer(await vault.getAddress(), 1)).wait();
  const raidId = await openRaid(vault.connect(other));
  const raid = await vault.raids(raidId);
  assert.equal(raid.status, 1n);
  assert.equal(raid.prize, 25n); // Hard ceiling: 25% of the free WMON at opening.
  assert.equal(raid.rulesHash, config().rulesHash);
  assert.equal(await vault.activeRaidId(), raidId);
  assert.equal(await vault.lockedBalance(), 25n);
  assert.equal(await vault.freeBalance(), 75n);
  await assert.rejects(vault.openEconomyRaid());

  await (await wmon.transfer(await vault.getAddress(), 100)).wait();
  assert.equal(await vault.freeBalance(), 175n);
  await assert.rejects(vault.connect(other).setConfig(config()));
  await (await vault.setConfig(config({ rulesHash: ethers.id("slide-v2-rules") }))).wait();
  assert.equal((await vault.raids(raidId)).rulesHash, config().rulesHash);
  assert.equal(await vault.lockedBalance(), 25n);
});

test("settlement is bounded to the raid escrow, and only its verified winner can claim", async () => {
  const { admin, winner, other, wmon, vault } = await setup();
  await (await wmon.mint(admin.address, 400)).wait();
  await (await wmon.transfer(await vault.getAddress(), 400)).wait();
  const raidId = await openRaid(vault);
  const opened = await vault.raids(raidId);
  assert.equal(opened.prize, 75n); // maxPrize caps the 100 WMON bps calculation.
  assert.equal(await vault.freeBalance(), 325n);

  const resultHash = ethers.id("verified-run-artifact");
  await assert.rejects(vault.settleRaid(raidId, winner.address, resultHash));
  await advanceTo(opened.endsAt);
  await assert.rejects(vault.connect(other).settleRaid(raidId, winner.address, resultHash));
  await assert.rejects(vault.settleRaid(raidId, ethers.ZeroAddress, resultHash));
  await assert.rejects(vault.settleRaid(raidId, winner.address, ethers.ZeroHash));
  await (await vault.settleRaid(raidId, winner.address, resultHash)).wait();
  const settled = await vault.raids(raidId);
  assert.equal(settled.status, 2n);
  assert.equal(settled.resultHash, resultHash);
  assert.equal(await vault.activeRaidId(), ethers.ZeroHash);
  await assert.rejects(vault.cancelRaid(raidId));
  await assert.rejects(vault.connect(other).claimPrize(raidId, other.address));

  await (await vault.connect(winner).claimPrize(raidId, other.address)).wait();
  assert.equal(await wmon.balanceOf(other.address), 75n);
  assert.equal(await wmon.balanceOf(await vault.getAddress()), 325n);
  assert.equal(await vault.lockedBalance(), 0n);
  assert.equal(await vault.freeBalance(), 325n);
  assert.equal((await vault.raids(raidId)).status, 3n);
  await assert.rejects(vault.connect(winner).claimPrize(raidId, winner.address));
  await assert.rejects(vault.expirePrize(raidId));
});

test("timeout and owner cancellation return only unawarded escrow to the free balance", async () => {
  const { admin, other, wmon, vault } = await setup();
  await (await wmon.mint(admin.address, 400)).wait();
  await (await wmon.transfer(await vault.getAddress(), 400)).wait();
  const timedOutId = await openRaid(vault);
  const timedOut = await vault.raids(timedOutId);
  await assert.rejects(vault.connect(other).timeoutRaid(timedOutId));
  await advanceTo(timedOut.settleBy);
  await assert.rejects(vault.settleRaid(timedOutId, other.address, ethers.id("late-result")));
  await (await vault.connect(other).timeoutRaid(timedOutId)).wait();
  assert.equal((await vault.raids(timedOutId)).status, 5n);
  assert.equal(await vault.freeBalance(), 400n);
  assert.equal(await vault.lockedBalance(), 0n);
  await assert.rejects(vault.timeoutRaid(timedOutId));

  const cancelledId = await openRaid(vault);
  await assert.rejects(vault.connect(other).cancelRaid(cancelledId));
  await (await vault.cancelRaid(cancelledId)).wait();
  assert.equal((await vault.raids(cancelledId)).status, 4n);
  assert.equal(await vault.freeBalance(), 400n);
  assert.equal(await vault.lockedBalance(), 0n);
  await assert.rejects(vault.cancelRaid(cancelledId));
});

test("an expired unclaimed winner prize is recycled, and config cannot exceed the prize ceiling", async () => {
  const { admin, winner, other, wmon, vault } = await setup();
  await assert.rejects(vault.setConfig(config({ prizeBps: 2501 })));
  await assert.rejects(vault.setConfig(config({ claimWindow: 0 })));
  await assert.rejects(vault.setConfig(config({ rulesHash: ethers.ZeroHash })));
  await assert.rejects(vault.renounceOwnership());

  await (await wmon.mint(admin.address, 400)).wait();
  await (await wmon.transfer(await vault.getAddress(), 400)).wait();
  const raidId = await openRaid(vault);
  await advanceTo((await vault.raids(raidId)).endsAt);
  await (await vault.settleRaid(raidId, winner.address, ethers.id("result"))).wait();
  const settled = await vault.raids(raidId);
  await assert.rejects(vault.connect(other).expirePrize(raidId));
  await advanceTo(settled.claimDeadline);
  await assert.rejects(vault.connect(other).payWinner(raidId));
  await assert.rejects(vault.connect(winner).claimPrize(raidId, winner.address));
  await (await vault.connect(other).expirePrize(raidId)).wait();
  assert.equal((await vault.raids(raidId)).status, 6n);
  assert.equal(await vault.lockedBalance(), 0n);
  assert.equal(await vault.freeBalance(), 400n);
  assert.equal(await wmon.balanceOf(winner.address), 0n);
  await assert.rejects(vault.expirePrize(raidId));
});

test("a later raid cannot spend WMON still reserved for an earlier winner", async () => {
  const { admin, winner, other, wmon, vault } = await setup();
  await (await wmon.mint(admin.address, 800)).wait();
  await (await wmon.transfer(await vault.getAddress(), 400)).wait();
  const firstId = await openRaid(vault);
  const first = await vault.raids(firstId);
  await advanceTo(first.endsAt);
  await (await vault.settleRaid(firstId, winner.address, ethers.id("first-result"))).wait();

  await (await wmon.transfer(await vault.getAddress(), 400)).wait();
  await assert.rejects(vault.openEconomyRaid()); // The previous raid's cooldown still applies.
  await advanceTo(await vault.nextOpenAt());
  assert.equal(await vault.freeBalance(), 725n);
  const secondId = await openRaid(vault);
  assert.notEqual(secondId, firstId);
  assert.equal(await vault.lockedBalance(), 150n);
  assert.equal(await vault.freeBalance(), 650n);

  await (await vault.connect(winner).claimPrize(firstId, other.address)).wait();
  assert.equal(await wmon.balanceOf(other.address), 75n);
  assert.equal(await vault.lockedBalance(), 75n);
  assert.equal(await vault.freeBalance(), 650n);
  await advanceTo((await vault.raids(secondId)).settleBy);
  await (await vault.connect(other).timeoutRaid(secondId)).wait();
  assert.equal(await vault.lockedBalance(), 0n);
  assert.equal(await vault.freeBalance(), 725n);
});
