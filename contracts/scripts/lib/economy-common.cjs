const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
const { compileContracts } = require("../compile.cjs");

const contractsRoot = path.resolve(__dirname, "../..");
const helpersSource = fs.readFileSync(path.join(__dirname, "EconomyTestnetHelpers.sol"), "utf8");

// Monad-maintained Uniswap v4 testnet deployment (NOT an official Uniswap deployment).
// Source: https://docs.monad.xyz/guides/uniswap-v4-hooks/setup ->
// https://github.com/monad-developers/uniswap-v4-hooks-example/blob/c3cc78a88f10e5ba141cd6fb632f31db83c0daf8/shared-infrastructure.json
// WMON also listed as canonical at https://docs.monad.xyz/developer-essentials/testnets
// Both verified to have bytecode on chain 10143 on 2026-10-13.
const KNOWN = {
  10143: {
    poolManager: "0x451D64ab3b650040d2aE1886602b97ed6eDc643d",
    wmon: "0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541",
    positionManager: "0x3Bb14E3D0Cd50aBe3EdACa06d06c29C78676C31A",
    universalRouter: "0x1b7bFCd2870329B987191910D85c22C7287f3c22",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  },
};
const ALLOWED_CHAINS = new Set([10143n, 31337n]); // testnet + local rehearsal only. Mainnet (143) refused.
// BEFORE_INITIALIZE | BEFORE_SWAP | AFTER_SWAP | BEFORE_SWAP_RETURNS_DELTA | AFTER_SWAP_RETURNS_DELTA
const HOOK_FLAGS = 0x20ccn;
const MIN_SQRT = 4295128740n;
const MAX_SQRT = 1461446703485210103287273052203988822378723970341n;

let cached;
function compiled() {
  cached ??= compileContracts({ "scripts/lib/EconomyTestnetHelpers.sol": helpersSource });
  return cached;
}
function artifact(name) {
  for (const [, group] of Object.entries(compiled())) if (group[name]) return group[name];
  throw new Error(`No artifact ${name}`);
}
function factoryFor(name, signer) {
  const a = artifact(name);
  return new ethers.ContractFactory(a.abi, `0x${a.evm.bytecode.object}`, signer);
}
function at(name, address, signer) { return new ethers.Contract(address, artifact(name).abi, signer); }

function mineHookSalt(deployer, initCode, flags = HOOK_FLAGS, limit = 2_000_000) {
  const hash = ethers.keccak256(initCode);
  for (let i = 0; i < limit; i++) {
    const salt = ethers.toBeHex(i, 32);
    const target = ethers.getCreate2Address(deployer, salt, hash);
    if ((BigInt(target) & 0x3fffn) === flags) return { salt, target, iterations: i + 1 };
  }
  throw new Error("Could not mine a v4 hook address");
}

function poolKey(miniCoin, wmon, fee, tickSpacing, hooks) {
  const [c0, c1] = BigInt(miniCoin) < BigInt(wmon) ? [miniCoin, wmon] : [wmon, miniCoin];
  return { currency0: c0, currency1: c1, fee, tickSpacing, hooks };
}
function poolIdOf(key) {
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)"], [key]));
}
async function connect() {
  const rpc = process.env.RPC_URL || process.env.TESTNET_RPC_URL || process.env.MONAD_RPC_URL;
  const pk = process.env.PRIVATE_KEY || process.env.TESTNET_DEPLOYER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!rpc || !pk) throw new Error("Set RPC_URL (or MONAD_RPC_URL) and PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY).");
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error("PRIVATE_KEY must be a 0x-prefixed 32-byte hex key.");
  const provider = new ethers.JsonRpcProvider(rpc);
  const chainId = (await provider.getNetwork()).chainId;
  if (!ALLOWED_CHAINS.has(chainId)) throw new Error(`Refusing chain ${chainId}: only Monad testnet (10143) or local 31337.`);
  const signer = new ethers.NonceManager(new ethers.Wallet(pk, provider));
  return { provider, signer, chainId, address: await signer.getAddress() };
}
function deploymentPath(chainId) {
  const name = chainId === 10143n ? "monad-testnet" : `local-${chainId}`;
  return process.env.DEPLOYMENT_FILE || path.join(contractsRoot, "deployments", `${name}.json`);
}
module.exports = { KNOWN, HOOK_FLAGS, MIN_SQRT, MAX_SQRT, artifact, factoryFor, at, mineHookSalt, poolKey, poolIdOf, connect, deploymentPath, ethers };
