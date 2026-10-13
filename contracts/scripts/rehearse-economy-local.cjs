#!/usr/bin/env node
/*
 * Full local rehearsal of deploy-economy-testnet.cjs + raid-loop-testnet.cjs.
 * Starts an in-process Hardhat JSON-RPC node, deploys a local v4 PoolManager and LocalWMON
 * (stand-ins for the Monad testnet infra), then runs both scripts unchanged against it.
 *   node scripts/rehearse-economy-local.cjs
 */
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
process.env.APPDATA ??= path.resolve(__dirname, "../.data/appdata");
process.env.LOCALAPPDATA ??= path.resolve(__dirname, "../.data/localappdata");
const C = require("./lib/economy-common.cjs");
const { ethers } = C;
const PORT = process.env.REHEARSAL_PORT || "8645";
// Hardhat's well-known account #0 (public test key, local only).
const PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function run(cmd, args, env) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd: path.resolve(__dirname, ".."), env: { ...process.env, ...env }, stdio: "inherit" });
    p.on("exit", (c) => (c ? rej(new Error(`${args.join(" ")} exited ${c}`)) : res()));
  });
}
async function main() {
  const node = spawn(process.execPath, [require.resolve("hardhat/internal/cli/cli"), "node", "--port", PORT], { cwd: path.resolve(__dirname, ".."), stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((res) => node.stdout.on("data", (b) => { if (/Started HTTP/.test(b)) res(); }));
  const rpc = `http://127.0.0.1:${PORT}`;
  try {
    const provider = new ethers.JsonRpcProvider(rpc);
    const signer = new ethers.NonceManager(new ethers.Wallet(PK, provider));
    const pm = await C.factoryFor("PoolManager", signer).deploy(await signer.getAddress()); await pm.waitForDeployment();
    const wmon = await C.factoryFor("LocalWMON", signer).deploy(); await wmon.waitForDeployment();
    const file = path.resolve(__dirname, "../deployments/local-31337.json");
    fs.rmSync(file, { force: true });
    const env = { RPC_URL: rpc, PRIVATE_KEY: PK, POOL_MANAGER: await pm.getAddress(), WMON: await wmon.getAddress(), DEPLOY_TEST_ROUTER: "1", DEPLOYMENT_FILE: file };
    await run(process.execPath, ["scripts/deploy-economy-testnet.cjs"], env);
    console.log("[rehearsal] re-running deploy to check idempotent resume");
    await run(process.execPath, ["scripts/deploy-economy-testnet.cjs"], env);
    await run(process.execPath, ["scripts/raid-loop-testnet.cjs"], { ...env, BUY_WMON: "0.05" });
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!d.raids?.[0]?.claimTx) throw new Error("rehearsal did not reach claim");
    console.log("[rehearsal] PASS: deploy -> wire -> init pool -> seed -> buy -> distribute -> open raid -> settle -> claim");
  } finally { node.kill(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
