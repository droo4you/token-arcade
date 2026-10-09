const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
process.env.APPDATA = path.resolve(__dirname, "../.data/appdata");
process.env.LOCALAPPDATA = path.resolve(__dirname, "../.data/localappdata");
const { ethers, network } = require("hardhat");
const { compileContracts } = require("../scripts/compile.cjs");

const mockSource = fs.readFileSync(path.join(__dirname, "MockPrizeNFT.sol"), "utf8");
const mockEntrySource = fs.readFileSync(path.join(__dirname, "MockEntryToken.sol"), "utf8");
const compiled = compileContracts({
  "test/MockPrizeNFT.sol": mockSource,
  "test/MockEntryToken.sol": mockEntrySource,
});

async function deploy(file, name, signer, ...args) {
  const artifact = compiled[file][name];
  const factory = new ethers.ContractFactory(
    artifact.abi,
    `0x${artifact.evm.bytecode.object}`,
    signer,
  );
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

async function setup() {
  const [admin, depositor, winner, other] = await ethers.getSigners();
  const nft = await deploy("test/MockPrizeNFT.sol", "MockPrizeNFT", admin);
  const vault = await deploy("src/RaidPrizeVault.sol", "RaidPrizeVault", admin, admin.address);
  return { admin, depositor, winner, other, nft, vault };
}

test("factory deploys one fixed-supply token with immutable game and community association", async () => {
  const { admin, depositor, other, nft } = await setup();
  const factory = await deploy("src/MinicoinFactory.sol", "MinicoinFactory", admin, admin.address);
  const gameId = ethers.id("skrumpey-slide");
  const config = {
    gameId,
    name: "Skrumpey Slide Experimental Minicoin",
    symbol: "SKR-EXP",
    metadataURI: "ipfs://example-token-metadata",
    communityAssetType: 2,
    communityAsset: await nft.getAddress(),
    communityTokenId: 0,
    strategyRef: ethers.id("metropolis-nft-strategy-v0"),
    treasury: other.address,
    supplyRecipient: depositor.address,
    initialSupply: 1000n * 10n ** 18n,
  };

  await assert.rejects(factory.connect(other).deploy(config));
  await (await factory.deploy(config)).wait();
  const tokenAddress = await factory.minicoinByGame(gameId);
  assert.notEqual(tokenAddress, ethers.ZeroAddress);
  const token = new ethers.Contract(
    tokenAddress,
    compiled["src/ExperimentalMinicoin.sol"].ExperimentalMinicoin.abi,
    admin,
  );
  assert.equal(await token.gameId(), gameId);
  assert.equal(await token.factory(), await factory.getAddress());
  assert.equal(await token.creator(), admin.address);
  assert.equal(await token.treasury(), other.address);
  assert.equal(await token.communityAsset(), await nft.getAddress());
  assert.equal(await token.communityAssetType(), 2n);
  assert.equal(await token.strategyRef(), config.strategyRef);
  assert.equal(await token.EXPERIMENTAL(), true);
  assert.equal(await token.totalSupply(), config.initialSupply);
  assert.equal(await token.balanceOf(depositor.address), config.initialSupply);
  await assert.rejects(factory.deploy(config));
  await assert.rejects(factory.deploy({ ...config, gameId: ethers.ZeroHash }));
  await assert.rejects(factory.deploy({ ...config, gameId: ethers.id("other"), treasury: ethers.ZeroAddress }));
  await assert.rejects(factory.deploy({ ...config, gameId: ethers.id("other"), communityAssetType: 0 }));
});

test("vault only accepts a registered NFT deposit and lets the awarded winner claim once", async () => {
  const { admin, depositor, winner, other, nft, vault } = await setup();
  const raidId = ethers.id("raid-1");
  const gameId = ethers.id("skrumpey-slide");
  const nftAddress = await nft.getAddress();
  const vaultAddress = await vault.getAddress();
  await (await nft.mint(depositor.address, 7)).wait();

  await assert.rejects(vault.connect(other).registerRaid(raidId, gameId, nftAddress, nftAddress));
  await (await vault.registerRaid(raidId, gameId, nftAddress, nftAddress)).wait();
  await assert.rejects(vault.registerRaid(raidId, gameId, nftAddress, nftAddress));
  await assert.rejects(nft.connect(depositor)["safeTransferFrom(address,address,uint256)"](depositor.address, vaultAddress, 7));
  assert.equal(await nft.ownerOf(7), depositor.address);
  await (await nft.connect(depositor).approve(vaultAddress, 7)).wait();
  await (await vault.connect(depositor).depositPrize(raidId, 7)).wait();
  assert.equal(await nft.ownerOf(7), vaultAddress);
  const deposited = await vault.prizes(raidId);
  assert.equal(deposited.depositor, depositor.address);
  assert.equal(deposited.gameId, gameId);
  assert.equal(deposited.status, 2n);
  await assert.rejects(vault.connect(depositor).depositPrize(raidId, 7));
  await assert.rejects(vault.connect(other).awardPrize(raidId, winner.address));
  await (await vault.awardPrize(raidId, winner.address)).wait();
  await assert.rejects(vault.cancelRaid(raidId));
  await assert.rejects(vault.connect(other).claimPrize(raidId, other.address));
  await (await vault.connect(winner).claimPrize(raidId, other.address)).wait();
  assert.equal(await nft.ownerOf(7), other.address);
  await assert.rejects(vault.connect(winner).claimPrize(raidId, winner.address));
});

test("a cancelled funded raid refunds only the depositor", async () => {
  const { depositor, other, nft, vault } = await setup();
  const raidId = ethers.id("raid-2");
  const nftAddress = await nft.getAddress();
  await (await vault.registerRaid(raidId, ethers.id("skrumpey-slide"), nftAddress, nftAddress)).wait();
  await (await nft.mint(depositor.address, 8)).wait();
  await (await nft.connect(depositor).approve(await vault.getAddress(), 8)).wait();
  await (await vault.connect(depositor).depositPrize(raidId, 8)).wait();
  await (await vault.cancelRaid(raidId)).wait();
  await assert.rejects(vault.awardPrize(raidId, other.address));
  await assert.rejects(vault.connect(other).claimRefund(raidId, other.address));
  await (await vault.connect(depositor).claimRefund(raidId, other.address)).wait();
  assert.equal(await nft.ownerOf(8), other.address);
  await assert.rejects(vault.connect(depositor).claimRefund(raidId, depositor.address));
});

test("vault owner cannot renounce control while prizes may need settlement", async () => {
  const { vault } = await setup();
  await assert.rejects(vault.renounceOwnership());
});

test("native entry fees are escrowed until end, then split into pull balances", async () => {
  const { admin, depositor, winner, other } = await setup();
  const router = await deploy("src/EntryFeeRouter.sol", "EntryFeeRouter", admin, admin.address);
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const raidId = ethers.id("native-fee-raid");
  const route = {
    raidId,
    gameId: ethers.id("skrumpey-slide"),
    communityAsset: other.address,
    asset: ethers.ZeroAddress,
    entryAmount: 101n,
    startsAt: now,
    endsAt: now + 60,
    prizeRecipient: admin.address,
    communityRecipient: winner.address,
    treasuryRecipient: other.address,
    prizeBps: 5000,
    communityBps: 3000,
    treasuryBps: 2000,
  };
  await assert.rejects(router.registerRoute({ ...route, treasuryBps: 2001 }));
  await (await router.registerRoute(route)).wait();
  await assert.rejects(router.connect(depositor).payEntry(raidId));
  await (await router.setAccepting(raidId, false)).wait();
  await assert.rejects(router.connect(depositor).payEntry(raidId, { value: 101n }));
  await (await router.setAccepting(raidId, true)).wait();
  await (await router.connect(depositor).payEntry(raidId, { value: 101n })).wait();
  await (await router.connect(winner).payEntry(raidId, { value: 101n })).wait();
  assert.equal(await router.paidBy(raidId, depositor.address), 101n);
  await assert.rejects(router.settleRoute(raidId));
  await network.provider.send("evm_setNextBlockTimestamp", [route.endsAt]);
  await assert.rejects(router.connect(other).payEntry(raidId, { value: 101n }));
  await network.provider.send("evm_setNextBlockTimestamp", [route.endsAt + 1]);
  await network.provider.send("evm_mine");
  await (await router.settleRoute(raidId)).wait();
  assert.equal(await router.withdrawable(ethers.ZeroAddress, admin.address), 101n);
  assert.equal(await router.withdrawable(ethers.ZeroAddress, winner.address), 60n);
  assert.equal(await router.withdrawable(ethers.ZeroAddress, other.address), 41n);
  await assert.rejects(router.cancelRoute(raidId));
  await assert.rejects(router.connect(depositor).withdraw(ethers.ZeroAddress, depositor.address));
  const balanceBefore = await ethers.provider.getBalance(depositor.address);
  await (await router.connect(winner).withdraw(ethers.ZeroAddress, depositor.address)).wait();
  assert.equal(await ethers.provider.getBalance(depositor.address), balanceBefore + 60n);
  await assert.rejects(router.connect(winner).withdraw(ethers.ZeroAddress, depositor.address));
});

test("ERC-20 entry cancellation refunds each payer's full escrow", async () => {
  const { admin, depositor, other } = await setup();
  const token = await deploy("test/MockEntryToken.sol", "MockEntryToken", admin);
  const router = await deploy("src/EntryFeeRouter.sol", "EntryFeeRouter", admin, admin.address);
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const raidId = ethers.id("erc20-fee-raid");
  const route = {
    raidId,
    gameId: ethers.id("two-places"),
    communityAsset: other.address,
    asset: await token.getAddress(),
    entryAmount: 25n,
    startsAt: now,
    endsAt: now + 60,
    prizeRecipient: admin.address,
    communityRecipient: depositor.address,
    treasuryRecipient: other.address,
    prizeBps: 4000,
    communityBps: 4000,
    treasuryBps: 2000,
  };
  await (await router.registerRoute(route)).wait();
  await (await token.mint(depositor.address, 100)).wait();
  await (await token.connect(depositor).approve(await router.getAddress(), 50)).wait();
  await assert.rejects(router.connect(depositor).payEntry(raidId, { value: 25n }));
  await (await router.connect(depositor).payEntry(raidId)).wait();
  await (await router.connect(depositor).payEntry(raidId)).wait();
  assert.equal(await token.balanceOf(await router.getAddress()), 50n);
  await (await router.cancelRoute(raidId)).wait();
  await assert.rejects(router.connect(other).claimRefund(raidId, other.address));
  await (await router.connect(depositor).claimRefund(raidId, other.address)).wait();
  assert.equal(await token.balanceOf(other.address), 50n);
  assert.equal(await token.balanceOf(await router.getAddress()), 0n);
  await assert.rejects(router.connect(depositor).claimRefund(raidId, depositor.address));
  await assert.rejects(router.settleRoute(raidId));
});
