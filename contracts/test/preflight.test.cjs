const test = require("node:test");
const assert = require("node:assert/strict");
const { ethers } = require("ethers");
const { inspectMainnet, hookAddressCheck, validRpcUrl, REFERENCES } = require("../scripts/preflight.cjs");

const wallet = "0x1111111111111111111111111111111111111111";
const abi = new ethers.Interface([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
]);

test("refuses local and insecure RPCs without contacting them", async () => {
  for (const url of ["http://127.0.0.1:8545", "https://localhost:8545", "http://rpc.monad.xyz", "not a URL"]) {
    assert.equal(validRpcUrl(url), false);
    const report = await inspectMainnet({ env: { MONAD_RPC_URL: url }, providerFactory: () => { throw new Error("must not call provider"); } });
    assert.ok(report.checks.some((check) => check.name === "mainnet RPC" && check.status === "BLOCK"));
  }
});

test("stops after a non-mainnet chain ID and suppresses RPC credentials", async () => {
  const report = await inspectMainnet({
    env: { MONAD_RPC_URL: "https://user:secret@rpc.example", DEPLOYER_ADDRESS: wallet, OWNER_ADDRESS: wallet },
    providerFactory: () => ({
      getNetwork: async () => ({ chainId: 31337n }),
      getCode: () => { throw new Error("code must not be read"); },
    }),
  });
  assert.ok(report.checks.some((check) => check.name === "RPC chain ID" && check.status === "BLOCK"));
  assert.ok(!JSON.stringify(report).includes("secret"));
});

test("reads official contracts, WMON metadata, and balances without a signer", async () => {
  const codeReads = [];
  const calls = [];
  const provider = {
    getNetwork: async () => ({ chainId: 143n }),
    getCode: async (address) => { codeReads.push(address); return "0x6000"; },
    getBalance: async () => 2n * 10n ** 18n,
    getFeeData: async () => ({ maxFeePerGas: 100n * 10n ** 9n }),
    call: async (tx) => {
      calls.push(tx);
      if (tx.data.startsWith(abi.getFunction("symbol").selector)) return abi.encodeFunctionResult("symbol", ["WMON"]);
      if (tx.data.startsWith(abi.getFunction("decimals").selector)) return abi.encodeFunctionResult("decimals", [18]);
      if (tx.data.startsWith(abi.getFunction("balanceOf").selector)) return abi.encodeFunctionResult("balanceOf", [10n ** 18n]);
      throw new Error("unexpected call");
    },
  };
  const report = await inspectMainnet({
    env: { MONAD_RPC_URL: "https://rpc.example", DEPLOYER_ADDRESS: wallet, OWNER_ADDRESS: wallet, SEED_WALLET_ADDRESS: wallet, SEED_WMON_WEI: "1000000000000000000" },
    providerFactory: () => provider,
  });
  assert.deepEqual(codeReads, Object.values(REFERENCES));
  assert.equal(calls.length, 3);
  assert.ok(report.checks.some((check) => check.name === "WMON metadata" && check.status === "PASS"));
  assert.ok(report.checks.some((check) => check.name === "seed wallet WMON balance" && check.status === "PASS"));
  assert.ok(report.checks.some((check) => check.name === "final transaction authorization" && check.status === "BLOCK"));
});

test("hook CREATE2 result must match low 14 permission bits", () => {
  const deployer = "0x2222222222222222222222222222222222222222";
  const salt = ethers.zeroPadValue("0x01", 32);
  const initCodeHash = ethers.keccak256("0x6000");
  const address = ethers.getCreate2Address(deployer, salt, initCodeHash);
  const flags = Number(BigInt(address) & ((1n << 14n) - 1n));
  assert.notEqual(flags, 0);
  assert.equal(hookAddressCheck({ address, deployer, salt, initCodeHash, flags: String(flags) }).matches, true);
  assert.equal(hookAddressCheck({ address, deployer, salt, initCodeHash, flags: String(flags ^ 1) }).matches, false);
});
