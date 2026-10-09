/** Run separately with `node --experimental-sqlite --experimental-strip-types apps/api/test/minicoin.local-chain.ts`.
 * It uses only the in-process Hardhat chain and never connects to Monad. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import { custom, keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createArcadeServer } from "../src/server.ts";
import { ArcadeStore } from "../src/store.ts";

const contractsRoot = resolve("contracts");
process.chdir(contractsRoot);
const requireContracts = createRequire(join(contractsRoot, "package.json"));
const hre = requireContracts("hardhat");
const { compileContracts } = requireContracts("./scripts/compile.cjs");
const localPrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

test("admin deploys, verifies, associates, and read-only reconciles a Minicoin on local EVM", async () => {
  const [owner, community] = await hre.ethers.getSigners();
  assert.equal(owner.address, privateKeyToAccount(localPrivateKey).address);
  const compiled = compileContracts();
  const artifact = compiled["src/MinicoinFactory.sol"].MinicoinFactory;
  const contractFactory = new hre.ethers.ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, owner);
  const factory = await contractFactory.deploy(owner.address);
  await factory.waitForDeployment();
  const settings = {
    enabled: true, transport: custom(hre.network.provider), chainId: "31337", privateKey: localPrivateKey,
    factoryAddress: await factory.getAddress() as string, treasuryAddress: owner.address as string,
    supplyRecipient: owner.address as string,
  };
  const makeServer = async (enabled: boolean) => {
    const store = new ArcadeStore(":memory:", true);
    const server = createArcadeServer({ store, authSettings: { localDemoMode: true }, minicoinSettings: { ...settings, enabled, ...(enabled ? {} : { privateKey: undefined }) }, staticRoot: "nonexistent-build" });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const call = async (path: string, method = "GET", body?: unknown) => {
      const response = await fetch(origin + path, {
        method, headers: { authorization: "Bearer local-demo:admin", ...(body ? { "content-type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, body: await response.json() as any };
    };
    return { server, store, call };
  };
  const first = await makeServer(true);
  let hash: string;
  try {
    const games = await first.call("/api/admin/games");
    const manifest = games.body.games.find((game: any) => game.manifest.id === "skrumpey-slide").manifest;
    const communityAsset = { id: "skrumpeys", name: "Skrumpeys", type: "erc721", chainId: 31337, address: community.address };
    const configured = await first.call("/api/admin/games/skrumpey-slide", "PATCH", { manifest, community: communityAsset, communityStrategy: "hold-skrumpeys" });
    assert.equal(configured.status, 200);
    const body = { name: "Skrumpey Coin", symbol: "SKR", metadataURI: "https://example.com/skr.json", initialSupply: "1000000000000000000" };
    const deployed = await first.call("/api/admin/games/skrumpey-slide/minicoin", "POST", body);
    assert.equal(deployed.status, 201, JSON.stringify(deployed.body));
    hash = deployed.body.minicoin.deploymentTx;
    assert.equal(deployed.body.minicoin.chainId, 31337);
    assert.equal(deployed.body.minicoin.experimental, true);
    assert.equal(await factory.minicoinByGame(keccak256(stringToHex("skrumpey-slide"))), deployed.body.minicoin.address);
    const changed = await first.call("/api/admin/games/skrumpey-slide", "PATCH", { communityStrategy: "new-strategy" });
    assert.equal(changed.body.error.code, "IMMUTABLE_ASSOCIATION");
    const duplicate = await first.call("/api/admin/games/skrumpey-slide/minicoin", "POST", body);
    assert.equal(duplicate.body.error.code, "MINICOIN_EXISTS");
  } finally {
    await new Promise<void>((resolve) => first.server.close(() => resolve()));
    first.store.close();
  }
  const recovered = await makeServer(false);
  try {
    const games = await recovered.call("/api/admin/games");
    const manifest = games.body.games.find((game: any) => game.manifest.id === "skrumpey-slide").manifest;
    await recovered.call("/api/admin/games/skrumpey-slide", "PATCH", { manifest, community: { id: "skrumpeys", name: "Skrumpeys", type: "erc721", chainId: 31337, address: community.address }, communityStrategy: "hold-skrumpeys" });
    const wrongGame = await recovered.call("/api/admin/games/buy-bounce/minicoin/reconcile", "POST", { transactionHash: hash! });
    assert.equal(wrongGame.body.error.code, "DEPLOY_UNVERIFIED");
    const association = await recovered.call("/api/admin/games/skrumpey-slide/minicoin/reconcile", "POST", { transactionHash: hash! });
    assert.equal(association.status, 200, JSON.stringify(association.body));
    assert.equal(association.body.minicoin.deploymentTx, hash!);
  } finally {
    await new Promise<void>((resolve) => recovered.server.close(() => resolve()));
    recovered.store.close();
  }
});
