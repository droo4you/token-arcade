/** Isolated EVM integration test; never connects to a public chain. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import type { AddressInfo } from "node:net";
import { custom } from "viem";
import { createArcadeServer } from "../src/server.ts";
import { ArcadeStore } from "../src/store.ts";
import { TestnetMinicoinService } from "../src/testnet-minicoin.ts";

const root = resolve("contracts");
process.env.APPDATA = join(root, ".data/appdata");
process.env.LOCALAPPDATA = join(root, ".data/localappdata");
process.chdir(root);
const requireContracts = createRequire(join(root, "package.json"));
const hre = requireContracts("hardhat");
const { compileContracts } = requireContracts("./scripts/compile.cjs");
const testKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

test("creator request -> exact admin approval -> one token deployment -> restart reconciliation", async () => {
  const [owner] = await hre.ethers.getSigners();
  const artifact = compileContracts()["src/MinicoinFactory.sol"].MinicoinFactory;
  const factory = await new hre.ethers.ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, owner).deploy(owner.address);
  await factory.waitForDeployment();
  const settings = { enabled: true, transport: custom(hre.network.provider), chainId: "31337", privateKey: testKey,
    factoryAddress: await factory.getAddress(), treasuryAddress: owner.address, supplyRecipient: owner.address };
  const store = new ArcadeStore(":memory:", true);
  const game = store.getGame("emonad-cabinet")!;
  game.creatorId = "local-demo:player";
  store.saveGame(game);
  const server = createArcadeServer({ store, authSettings: { localDemoMode: true }, testnetMinicoinSettings: settings, staticRoot: "nonexistent" });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (role: string, action = "", body?: unknown) => {
    const prefix = ["approve", "reject"].includes(action) ? "admin" : "creator";
    const response = await fetch(`${origin}/api/${prefix}/games/emonad-cabinet/testnet-minicoin${action ? `/${action}` : ""}`, {
      method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer local-demo:${role}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() as any };
  };
  const input = { name: "Arcade Test", symbol: "TARC", metadataURI: "https://example.com/test.json", initialSupply: "1000000000000000000000000" };
  try {
    const first = await call("player", "", input);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    let id = first.body.launch.id;
    assert.equal((await call("outsider", "", input)).status, 404);
    assert.equal((await call("player", "approve", { requestId: id })).status, 403);
    assert.equal((await call("player", "deploy", { requestId: id, confirmTestnet: true })).status, 409);
    assert.equal((await call("admin", "approve", { requestId: id })).status, 200);
    // A revision invalidates approval, even if a stale browser still has the old request id.
    game.manifest = { ...game.manifest, version: "1.0.1" }; store.saveGame(game);
    assert.equal((await call("player", "deploy", { requestId: id, confirmTestnet: true })).body.error.code, "STALE_APPROVAL");
    const revised = await call("player", "", input); id = revised.body.launch.id;
    assert.equal((await call("admin", "approve", { requestId: first.body.launch.id })).body.error.code, "STALE_REQUEST");
    await call("admin", "approve", { requestId: id });
    const [a, b] = await Promise.all([
      call("player", "deploy", { requestId: id, confirmTestnet: true }),
      call("player", "deploy", { requestId: id, confirmTestnet: true }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const launched = (a.status === 200 ? a : b).body.launch;
    assert.equal(launched.status, "deployed", JSON.stringify(launched));
    assert.match(launched.token.address, /^0x[0-9a-fA-F]{40}$/);
    assert.equal(store.getGame(game.manifest.id)?.minicoin, undefined, "test token must not occupy the mainnet association");
    // Restore a pending record to simulate process death after broadcast but before final persistence.
    const pending = { ...launched, status: "pending", token: undefined };
    store.db.prepare("UPDATE testnet_token_launches SET json = ? WHERE game_id = ?").run(JSON.stringify(pending), game.manifest.id);
    const restarted = new TestnetMinicoinService(store, { ...settings, enabled: false, privateKey: undefined }, true);
    const recovered = await restarted.reconcile(game, { id: game.creatorId!, isAdmin: false, source: "local-demo" }, { requestId: id });
    assert.equal(recovered.status, "deployed");
    assert.equal(recovered.token?.address, launched.token.address);
    assert.equal((await call("player", "", input)).body.error.code, "LAUNCH_EXISTS");
    const blocked = new TestnetMinicoinService(store, { ...settings, chainId: "143" }, true);
    assert.equal(blocked.config.ready, false);
    // A successful but differently configured token cannot satisfy the saved approval.
    pending.input = { ...pending.input, name: "Wrong approved name" };
    store.db.prepare("UPDATE testnet_token_launches SET json = ? WHERE game_id = ?").run(JSON.stringify(pending), game.manifest.id);
    await assert.rejects(restarted.reconcile(game, { id: game.creatorId!, isAdmin: false, source: "local-demo" }, { requestId: id }), /approved token settings/);
  } finally {
    await new Promise<void>((done) => server.close(() => done())); store.close();
  }
});
