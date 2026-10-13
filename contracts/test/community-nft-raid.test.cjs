const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
process.env.APPDATA = path.resolve(__dirname, "../.data/appdata");
process.env.LOCALAPPDATA = path.resolve(__dirname, "../.data/localappdata");
const { ethers, network } = require("hardhat");
const { compileContracts } = require("../scripts/compile.cjs");
const compiled = compileContracts({ "test/MockPrizeNFT.sol": fs.readFileSync(path.join(__dirname, "MockPrizeNFT.sol"), "utf8") });
async function deploy(file, name, signer, ...args) {
  const a = compiled[file][name];
  const c = await new ethers.ContractFactory(a.abi, `0x${a.evm.bytecode.object}`, signer).deploy(...args);
  await c.waitForDeployment();
  return c;
}
async function setup() {
  const [owner, sponsor, signer, winner, other] = await ethers.getSigners();
  const nft = await deploy("test/MockPrizeNFT.sol", "MockPrizeNFT", owner);
  const vault = await deploy("src/CommunityNftRaidVault.sol", "CommunityNftRaidVault", owner, owner.address);
  const game = ethers.id("skrumpey-slide");
  const template = { collection: nft.target, signer: signer.address, rulesHash: ethers.id("reviewed-slide-rules"), duration: 60, settlementTimeout: 120, claimWindow: 180, enabled: true };
  await (await vault.setTemplate(game, template)).wait();
  await (await nft.mint(sponsor.address, 1)).wait();
  await (await nft.mint(sponsor.address, 2)).wait();
  await (await nft.connect(sponsor).setApprovalForAll(vault.target, true)).wait();
  return { owner, sponsor, signer, winner, other, nft, vault, game, template };
}
async function advance(t) {
  await network.provider.send("evm_setNextBlockTimestamp", [Number(t)]);
  await network.provider.send("evm_mine");
}
test("community holder deposits an approved NFT and the snapshotted verifier awards it", async () => {
  const { owner, sponsor, signer, winner, other, nft, vault, game, template } = await setup();
  await assert.rejects(vault.connect(other).setTemplate(game, template));
  await assert.rejects(nft.connect(sponsor)["safeTransferFrom(address,address,uint256)"](sponsor.address, vault.target, 1));
  await assert.rejects(vault.connect(sponsor).createRaid(ethers.id("unapproved-game"), 1));
  await (await vault.connect(sponsor).createRaid(game, 1)).wait();
  const id = await vault.activeRaid(game);
  const raid = await vault.raids(id);
  assert.equal(raid.depositor, sponsor.address);
  assert.equal(await nft.ownerOf(1), vault.target);
  await assert.rejects(vault.connect(sponsor).createRaid(game, 2));
  await assert.rejects(vault.connect(signer).settleRaid(id, winner.address, ethers.id("result")));
  await (await vault.setTemplate(game, { ...template, signer: other.address })).wait();
  await advance(raid.endsAt);
  await assert.rejects(vault.connect(owner).settleRaid(id, owner.address, ethers.id("result")));
  await assert.rejects(vault.connect(other).settleRaid(id, other.address, ethers.id("result")));
  await (await vault.connect(signer).settleRaid(id, winner.address, ethers.id("result"))).wait();
  await assert.rejects(vault.cancelRaid(id));
  await assert.rejects(vault.connect(sponsor).claimPrize(id, sponsor.address));
  await (await vault.connect(winner).claimPrize(id, other.address)).wait();
  assert.equal(await nft.ownerOf(1), other.address);
  await assert.rejects(vault.connect(winner).claimPrize(id, winner.address));
});
test("cancellation, timeout and claim expiry return the NFT only to its sponsor", async () => {
  const { sponsor, signer, winner, other, nft, vault, game } = await setup();
  await (await vault.connect(sponsor).createRaid(game, 1)).wait();
  const first = await vault.activeRaid(game);
  await (await vault.cancelRaid(first)).wait();
  await assert.rejects(vault.connect(other).claimRefund(first, other.address));
  await (await vault.connect(sponsor).claimRefund(first, sponsor.address)).wait();
  assert.equal(await nft.ownerOf(1), sponsor.address);

  await (await vault.connect(sponsor).createRaid(game, 1)).wait();
  const second = await vault.activeRaid(game);
  await advance((await vault.raids(second)).settleBy);
  await assert.rejects(vault.connect(signer).settleRaid(second, winner.address, ethers.id("late")));
  await (await vault.connect(other).timeoutRaid(second)).wait();
  await (await vault.connect(sponsor).claimRefund(second, sponsor.address)).wait();

  await (await vault.connect(sponsor).createRaid(game, 1)).wait();
  const third = await vault.activeRaid(game);
  await advance((await vault.raids(third)).endsAt);
  await (await vault.connect(signer).settleRaid(third, winner.address, ethers.id("result"))).wait();
  await (await vault.connect(sponsor).createRaid(game, 2)).wait();
  const fourth = await vault.activeRaid(game);
  await advance((await vault.raids(third)).claimDeadline);
  await assert.rejects(vault.connect(winner).claimPrize(third, winner.address));
  await (await vault.connect(other).expirePrize(third)).wait();
  assert.equal(await vault.activeRaid(game), fourth, "expiring an old claim preserves the new active raid");
  await (await vault.connect(sponsor).claimRefund(third, other.address)).wait();
  assert.equal(await nft.ownerOf(1), other.address);
  await assert.rejects(vault.connect(sponsor).claimRefund(third, sponsor.address));
});
