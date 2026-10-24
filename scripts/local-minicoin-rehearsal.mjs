import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// This runner intentionally uses only Hardhat's well-known, disposable local chain.
// It does not deploy the v0.2.2 MiniCoin pool, hook, liquidity, or strategies.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractsRoot = join(root, "contracts");
const sourceDb = join(root, "apps", "api", "data", "arcade.sqlite");
const rehearsalDir = join(root, "apps", "api", "data", "minicoin-rehearsals");
const hardhatDevKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const appPorts = [5173, 8787, 8788];
const children = [];
let stopping = false;

function requireDependency(path, installCommand) {
  if (!existsSync(path)) throw new Error(`Missing local dependency. Run ${installCommand} first.`);
}

function selectedAdminId() {
  if (process.argv.length > 2) throw new Error("The local rehearsal runner does not take command-line account options.");
  const explicit = process.env.REHEARSAL_ADMIN_PRIVY_ID?.trim();
  const existing = process.env.ADMIN_PRIVY_IDS?.trim();
  const selected = explicit || existing;
  if (!selected) throw new Error("Set REHEARSAL_ADMIN_PRIVY_ID to the confirmed founder's exact Privy user ID, or configure ADMIN_PRIVY_IDS. A Passport account is never selected automatically.");
  const ids = selected.split(",").map((id) => id.trim()).filter(Boolean);
  if (explicit && ids.length !== 1) throw new Error("REHEARSAL_ADMIN_PRIVY_ID must name one Privy user ID.");
  if (ids.some((id) => !/^did:privy:[^\s,]+$/.test(id))) throw new Error("The rehearsal admin allowlist must contain exact did:privy: user IDs.");
  return ids.join(",");
}

function sqliteSnapshot(target) {
  if (!existsSync(sourceDb)) return false;
  const db = new DatabaseSync(sourceDb, { readOnly: true });
  try {
    // VACUUM INTO makes a consistent snapshot even if the source uses WAL.
    // The source is opened read-only and is never changed by this runner.
    db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
  } finally {
    db.close();
  }
  return true;
}

async function freePort(port) {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", (error) => reject(error));
    probe.listen(port, "127.0.0.1", () => {
      const selected = probe.address().port;
      probe.close(() => resolvePort(selected));
    });
  });
}

async function reserveAppPorts() {
  for (const port of appPorts) {
    try {
      await freePort(port);
    } catch {
      throw new Error(`Loopback port ${port} is in use. Stop the existing local preview, then rerun the rehearsal. No existing process was changed.`);
    }
  }
}

function start(label, executable, args, options) {
  const child = spawn(executable, args, options);
  children.push(child);
  child.on("error", () => {
    if (!stopping) {
      console.error(`${label} could not start.`);
      stop(1);
    }
  });
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`${label} exited before the rehearsal ended${code == null ? "" : ` (code ${code})`}.`);
      stop(1);
    }
  });
  return child;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exitCode = code;
}

async function waitFor(label, url, inspect, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !stopping) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok && await inspect(response)) return;
    } catch { /* The local service is still starting. */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`${label} did not become ready on loopback.`);
}

async function waitForChain(rpcUrl) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !stopping) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok && (await response.json()).result === "0x7a69") return;
    } catch { /* Hardhat is still starting. */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error("Hardhat did not expose local chain 31337 on loopback.");
}

async function main() {
  process.chdir(root);
  if (process.env.NODE_ENV === "production") throw new Error("The local rehearsal cannot run with NODE_ENV=production.");
  if (!process.env.VITE_PRIVY_APP_ID || !process.env.PRIVY_APP_ID || !process.env.PRIVY_APP_SECRET ||
      process.env.VITE_PRIVY_APP_ID !== process.env.PRIVY_APP_ID) {
    throw new Error("Real founder sign-in requires matching VITE_PRIVY_APP_ID and PRIVY_APP_ID plus server-only PRIVY_APP_SECRET in .env.");
  }
  const adminIds = selectedAdminId();
  requireDependency(join(root, "node_modules", "vite", "bin", "vite.js"), "npm ci");
  requireDependency(join(contractsRoot, "node_modules", "hardhat", "package.json"), "npm ci --prefix contracts");
  requireDependency(join(root, "cartridges", "coindle", "arcade-dist", "index.html"), "npm run setup:cartridges, then npm run build:cartridges");
  await reserveAppPorts();

  const chainPort = await freePort(0);
  const rpcUrl = `http://127.0.0.1:${chainPort}`;
  const requireContracts = createRequire(join(contractsRoot, "package.json"));
  const hardhatPackage = JSON.parse(readFileSync(requireContracts.resolve("hardhat/package.json"), "utf8"));
  const hardhatCli = resolve(dirname(requireContracts.resolve("hardhat/package.json")), hardhatPackage.bin.hardhat);
  const { ethers } = requireContracts("ethers");
  const { compileContracts } = requireContracts("./scripts/compile.cjs");

  console.log("LOCAL REHEARSAL — experimental fixed-supply token only. This is not the Economy v0.2.2 MiniCoin launch: no WMON pool, hook, liquidity, vault, or strategy is deployed.");
  console.log("Compiling the existing local-only factory...");
  const compiled = compileContracts();
  const factoryArtifact = compiled["src/MinicoinFactory.sol"].MinicoinFactory;
  const chainEnv = { ...process.env, HARDHAT_NETWORK: "hardhat", HARDHAT_DISABLE_TELEMETRY_PROMPT: "true", CI: "true" };
  delete chainEnv.HARDHAT_CONFIG;
  const chain = start("Local Hardhat chain", process.execPath, [hardhatCli, "--config", join(contractsRoot, "hardhat.config.cjs"), "node", "--hostname", "127.0.0.1", "--port", String(chainPort)], {
    cwd: contractsRoot, env: chainEnv, stdio: ["ignore", "pipe", "pipe"],
  });
  // Hardhat prints test accounts and their keys by default. Never relay that output.
  chain.stdout.resume();
  chain.stderr.resume();
  await waitForChain(rpcUrl);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  if ((await provider.getNetwork()).chainId !== 31337n) throw new Error("Local RPC chain ID is not 31337; refusing to deploy.");
  const signer = new ethers.Wallet(hardhatDevKey, provider);
  const factory = await new ethers.ContractFactory(factoryArtifact.abi, `0x${factoryArtifact.evm.bytecode.object}`, signer).deploy(signer.address);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  if ((await provider.getCode(factoryAddress)) === "0x" || (await factory.owner()) !== signer.address) {
    throw new Error("Local factory deployment could not be verified.");
  }

  mkdirSync(rehearsalDir, { recursive: true });
  const databasePath = join(rehearsalDir, `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${process.pid}.sqlite`);
  const copied = sqliteSnapshot(databasePath);
  const apiEnv = {
    ...process.env,
    NODE_ENV: "development", HOST: "127.0.0.1", PORT: "8787", LOCAL_DEMO_MODE: "true",
    LOCAL_DEMO_ADMIN_DISABLED: "true",
    LOCAL_MINICOIN_REHEARSAL: "true", ARCADE_DB_PATH: databasePath,
    ADMIN_PRIVY_IDS: adminIds, ENABLE_ONCHAIN_WRITES: "true",
    MONAD_RPC_URL: rpcUrl, MONAD_CHAIN_ID: "31337", MINICOIN_FACTORY_ADDRESS: factoryAddress,
    DEPLOYER_PRIVATE_KEY: hardhatDevKey, TREASURY_ADDRESS: signer.address,
    MINICOIN_SUPPLY_RECIPIENT: signer.address,
    CARTRIDGE_ORIGIN: "http://127.0.0.1:8788", CARTRIDGE_PORT: "8788",
    ARCADE_API_ORIGIN: "http://127.0.0.1:8787",
    ARCADE_HOST_ORIGINS: "http://127.0.0.1:5173,http://127.0.0.1:8787",
  };
  const publicEnv = { ...apiEnv };
  for (const key of ["PRIVY_APP_SECRET", "DEPLOYER_PRIVATE_KEY", "REHEARSAL_ADMIN_PRIVY_ID", "ADMIN_PRIVY_IDS"]) delete publicEnv[key];
  start("Cartridge server", process.execPath, ["--experimental-strip-types", "scripts/cartridges.mjs"], { cwd: root, env: publicEnv, stdio: "inherit" });
  start("Arcade API", process.execPath, ["--experimental-sqlite", "--experimental-strip-types", "apps/api/src/server.ts"], { cwd: root, env: apiEnv, stdio: "inherit" });
  start("Vite web", process.execPath, [join(root, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--strictPort"], { cwd: root, env: publicEnv, stdio: "inherit" });

  await Promise.all([
    waitFor("Arcade API rehearsal gate", "http://127.0.0.1:8787/api/health", async (response) => {
      const health = await response.json();
      return health.settlement?.minicoin?.rehearsalReady === true;
    }),
    waitFor("Cartridge server", "http://127.0.0.1:8788/sdk/bridge.js", async () => true),
    waitFor("Vite web", "http://127.0.0.1:5173/passport", async () => true),
  ]);
  console.log(`Local factory verified on chain 31337: ${factoryAddress}`);
  console.log(`${copied ? "Snapshot of your existing Passport database" : "Fresh Passport database"} for this rehearsal: ${databasePath}`);
  console.log("Your normal apps/api/data/arcade.sqlite is untouched. The Hardhat chain and token disappear when this command stops.");
  console.log("Open http://127.0.0.1:5173/demo and sign in with the allowlisted Privy founder account. Use the local experimental token rehearsal form for eMONAD, then play Passport Play and show the accepted score. Press Ctrl+C when finished.");
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
main().catch((error) => {
  console.error(`Local rehearsal stopped: ${error.message}`);
  stop(1);
});
