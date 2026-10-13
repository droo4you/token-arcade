// Read-only Monad mainnet launch preflight. Run with MONAD_RPC_URL, OWNER_ADDRESS,
// DEPLOYER_ADDRESS, and final launch settings in the environment. Do not supply a
// private key: this file has no signer, private-key read, or transaction path.
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");

const CHAIN_ID = 143n;
const HOOK_MASK = (1n << 14n) - 1n;
const REFERENCES = Object.freeze({
  PoolManager: "0x188d586ddcf52439676ca21a244753fa19f9ea8e",
  PositionManager: "0x5b7ec4a94ff9bedb700fb82ab09d5846972f4016",
  WMON: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A",
});
const SOURCES = Object.freeze({
  v4: "https://developers.uniswap.org/docs/protocols/v4/deployments",
  wmon: "https://developers.uniswap.org/docs/protocols/v3/deployments/v3-monad-deployments",
  hooks: "https://developers.uniswap.org/docs/protocols/v4/guides/hooks/hook-deployment",
});
const ERC20 = new ethers.Interface([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
]);
const ERC721 = new ethers.Interface(["function ownerOf(uint256) view returns (address)"]);
const contractsRoot = path.resolve(__dirname, "..");

const LAUNCH_SETTINGS = [
  ["GAME_ID", "canonical Cabinet game ID"],
  ["MINICOIN_NAME", "MiniCoin name"],
  ["MINICOIN_SYMBOL", "MiniCoin symbol"],
  ["MINICOIN_SUPPLY_WEI", "fixed MiniCoin supply (base units)"],
  ["SEED_MINICOIN_WEI", "MiniCoin seed amount (base units)"],
  ["SEED_WMON_WEI", "WMON seed amount (wei)"],
  ["INITIAL_SQRT_PRICE_X96", "initial v4 sqrt price"],
  ["TICK_LOWER", "LP lower tick"],
  ["TICK_UPPER", "LP upper tick"],
  ["LP_CUSTODY_ADDRESS", "LP position custody/lock address"],
  ["LP_LOCK_UNTIL", "LP lock expiry"],
  ["LP_MIGRATION_POLICY", "LP migration policy"],
  ["POOL_LP_FEE", "v4 LP fee"],
  ["POOL_TICK_SPACING", "v4 tick spacing"],
  ["HOOK_FEE_BPS", "WMON-leg hook fee"],
  ["RAID_FUNDING_BPS", "raid funding split"],
  ["COMMUNITY_BPS", "community split"],
  ["TREASURY_BPS", "treasury split"],
  ["CREATOR_BPS", "creator split"],
  ["RAID_THRESHOLD_WMON_WEI", "vault threshold"],
  ["RAID_PRIZE_BPS", "per-raid prize fraction"],
  ["RAID_MAX_PRIZE_WMON_WEI", "per-raid prize cap"],
  ["RAID_COOLDOWN_SECONDS", "raid cooldown"],
  ["RAID_DURATION_SECONDS", "raid duration"],
  ["RAID_ATTEMPTS", "raid attempt limit"],
  ["RAID_TIE_BREAK", "raid tie-break rule"],
  ["RAID_CLAIM_WINDOW_SECONDS", "prize claim window"],
  ["RAID_SETTLEMENT_TIMEOUT_SECONDS", "settlement timeout"],
  ["NFT_REWARD_MODE", "NFT reward mode (none, manual_deposit, operator_purchase, contract_purchase)"],
  ["NFT_COLLECTION_ADDRESS", "verified Skrumpeys collection on chain 143"],
  ["NFT_COLLECTION_SOURCE_URL", "authoritative collection/network source"],
  ["NFT_TOKEN_ID", "specific NFT token ID"],
  ["NFT_LISTING_URL", "specific executable NFT listing/source"],
  ["NFT_MAX_PRICE_WMON_WEI", "NFT purchase spend cap"],
  ["NFT_PURCHASE_PERMISSION_REF", "NFT purchase and prize-use permission record"],
  ["NFT_PURCHASE_MODULE_ADDRESS", "reviewed purchase module address"],
  ["NFT_PURCHASE_MODULE_RUNTIME_CODEHASH", "reviewed purchase module runtime hash"],
  ["NFT_PURCHASE_REHEARSAL_REF", "tested NFT purchase-to-raid settlement evidence"],
  ["ECONOMY_REHEARSAL_REF", "tested hook-to-vault-to-raid economic loop evidence"],
  ["TREASURY_ADDRESS", "treasury recipient"],
];

function add(report, status, name, detail) {
  report.checks.push({ status, name, detail });
}

function configured(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function publicAddress(report, env, name) {
  if (!configured(env[name])) {
    add(report, "BLOCK", name, "Missing EVM address.");
    return null;
  }
  if (!ethers.isAddress(env[name]) || env[name] === ethers.ZeroAddress) {
    add(report, "BLOCK", name, "Invalid or zero EVM address.");
    return null;
  }
  const address = ethers.getAddress(env[name]);
  add(report, "PASS", name, address);
  return address;
}

function validRpcUrl(raw) {
  if (!configured(raw)) return false;
  try {
    const url = new URL(raw);
    // Mainnet preflight must never touch the disposable local Hardhat chain.
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]") return false;
    return true;
  } catch {
    return false;
  }
}

function hookAddressCheck({ address, flags, deployer, salt, initCodeHash }) {
  if (!ethers.isAddress(address) || !ethers.isAddress(deployer)) throw new Error("Invalid hook or CREATE2 deployer address.");
  if (!/^0x[0-9a-fA-F]{64}$/.test(salt) || !/^0x[0-9a-fA-F]{64}$/.test(initCodeHash)) {
    throw new Error("CREATE2 salt and init-code hash must each be 32-byte hex.");
  }
  if (!/^\d+$/.test(flags)) throw new Error("Hook flags must be a decimal bitmap.");
  const expectedFlags = BigInt(flags);
  if (expectedFlags > HOOK_MASK || expectedFlags === 0n) throw new Error("Hook flags must be nonzero and fit the low 14 bits.");
  const mined = ethers.getCreate2Address(deployer, salt, initCodeHash);
  return {
    mined,
    flags: Number(BigInt(address) & HOOK_MASK),
    expectedFlags: Number(expectedFlags),
    matches: mined.toLowerCase() === address.toLowerCase() && (BigInt(address) & HOOK_MASK) === expectedFlags,
  };
}

function checkV4SourcePins(report, root = contractsRoot) {
  const lockPath = path.join(root, "package-lock.json");
  let packages = {};
  try { packages = JSON.parse(fs.readFileSync(lockPath, "utf8")).packages || {}; } catch { /* missing lock is a gate */ }
  for (const name of ["@uniswap/v4-core", "@uniswap/v4-periphery"]) {
    const pin = packages[`node_modules/${name}`];
    add(report, pin && pin.version && pin.integrity ? "PASS" : "BLOCK", `${name} source pin`,
      pin && pin.version && pin.integrity ? `${pin.version}, package-lock integrity present` : "Install and lock reviewed current v4 source/interfaces before compiling the hook and launch flow.");
  }
}

function validateLaunchSettings(report, env) {
  for (const [key, label] of LAUNCH_SETTINGS) {
    if (key.startsWith("NFT_") && key !== "NFT_REWARD_MODE") {
      if (!env.NFT_REWARD_MODE || env.NFT_REWARD_MODE === "none") continue;
      if (key.startsWith("NFT_PURCHASE_MODULE") || key === "NFT_PURCHASE_REHEARSAL_REF") {
        if (env.NFT_REWARD_MODE !== "contract_purchase") continue;
      }
      if (["NFT_LISTING_URL", "NFT_MAX_PRICE_WMON_WEI", "NFT_PURCHASE_PERMISSION_REF"].includes(key)
          && env.NFT_REWARD_MODE === "manual_deposit") continue;
    }
    if (!configured(env[key])) add(report, "BLOCK", label, `${key} is unset; proposals in the economy spec are not final settings.`);
  }
  if (configured(env.NFT_REWARD_MODE) && !["none", "manual_deposit", "operator_purchase", "contract_purchase"].includes(env.NFT_REWARD_MODE)) {
    add(report, "BLOCK", "NFT_REWARD_MODE", "Select none, manual_deposit, operator_purchase, or contract_purchase.");
  }
  for (const key of ["LP_CUSTODY_ADDRESS", "NFT_COLLECTION_ADDRESS", "NFT_PURCHASE_MODULE_ADDRESS", "TREASURY_ADDRESS"]) {
    if (configured(env[key]) && (!ethers.isAddress(env[key]) || env[key] === ethers.ZeroAddress)) {
      add(report, "BLOCK", key, "Must be a nonzero EVM address.");
    }
  }
  for (const key of ["NFT_COLLECTION_SOURCE_URL", "NFT_LISTING_URL"]) {
    if (configured(env[key])) {
      let valid = false;
      try { valid = new URL(env[key]).protocol === "https:"; } catch { /* invalid URL */ }
      if (!valid) add(report, "BLOCK", key, "Must be an HTTPS source URL.");
    }
  }
  for (const key of ["MINICOIN_SUPPLY_WEI", "SEED_MINICOIN_WEI", "SEED_WMON_WEI", "INITIAL_SQRT_PRICE_X96", "RAID_THRESHOLD_WMON_WEI", "RAID_MAX_PRIZE_WMON_WEI", "NFT_TOKEN_ID", "NFT_MAX_PRICE_WMON_WEI", "RAID_COOLDOWN_SECONDS", "RAID_DURATION_SECONDS", "RAID_ATTEMPTS", "RAID_CLAIM_WINDOW_SECONDS", "RAID_SETTLEMENT_TIMEOUT_SECONDS"]) {
    if (configured(env[key]) && !/^\d+$/.test(env[key])) add(report, "BLOCK", key, "Must be a nonnegative decimal integer in base units where applicable.");
  }
  if (configured(env.LP_LOCK_UNTIL)) {
    const expiry = Number(env.LP_LOCK_UNTIL);
    if (!Number.isSafeInteger(expiry) || expiry <= Math.floor(Date.now() / 1000)) add(report, "BLOCK", "LP_LOCK_UNTIL", "Must be a future Unix timestamp in seconds.");
  }
  if (configured(env.NFT_PURCHASE_MODULE_RUNTIME_CODEHASH) && !/^0x[0-9a-fA-F]{64}$/.test(env.NFT_PURCHASE_MODULE_RUNTIME_CODEHASH)) {
    add(report, "BLOCK", "NFT_PURCHASE_MODULE_RUNTIME_CODEHASH", "Must be a reviewed 32-byte runtime hash.");
  }
  const splitKeys = ["RAID_FUNDING_BPS", "COMMUNITY_BPS", "TREASURY_BPS", "CREATOR_BPS"];
  if (splitKeys.every((key) => configured(env[key]))) {
    const values = splitKeys.map((key) => Number(env[key]));
    add(report, values.every((value) => Number.isInteger(value) && value >= 0 && value <= 10000) && values.reduce((a, b) => a + b, 0) === 10000 ? "PASS" : "BLOCK",
      "fee split total", "The four split values must be integer basis points summing to 10,000.");
  }
  if (configured(env.HOOK_FEE_BPS)) {
    const fee = Number(env.HOOK_FEE_BPS);
    add(report, Number.isInteger(fee) && fee > 0 && fee <= 500 ? "PASS" : "BLOCK", "hook fee ceiling", "Current hook requires 1–500 basis points.");
  }
  if (configured(env.RAID_PRIZE_BPS)) {
    const prize = Number(env.RAID_PRIZE_BPS);
    add(report, Number.isInteger(prize) && prize > 0 && prize <= 2500 ? "PASS" : "BLOCK", "raid prize fraction", "Current rehearsal vault requires 1–2,500 basis points; apply configured maxPrize separately.");
  }
  if (configured(env.TICK_LOWER) && configured(env.TICK_UPPER) && configured(env.POOL_TICK_SPACING)) {
    const [lower, upper, spacing] = [env.TICK_LOWER, env.TICK_UPPER, env.POOL_TICK_SPACING].map(Number);
    add(report, Number.isInteger(lower) && Number.isInteger(upper) && Number.isInteger(spacing) && spacing > 0 && lower < upper && lower % spacing === 0 && upper % spacing === 0 ? "PASS" : "BLOCK",
      "tick range alignment", "Lower/upper ticks must be ordered multiples of tick spacing.");
  }
  if (configured(env.SEED_WMON_WEI) && configured(env.SEED_MINICOIN_WEI) && configured(env.MINICOIN_SUPPLY_WEI)) {
    const valid = [env.SEED_WMON_WEI, env.SEED_MINICOIN_WEI, env.MINICOIN_SUPPLY_WEI].every((n) => /^\d+$/.test(n));
    add(report, valid && BigInt(env.SEED_MINICOIN_WEI) > 0n && BigInt(env.SEED_MINICOIN_WEI) <= BigInt(env.MINICOIN_SUPPLY_WEI) ? "PASS" : "BLOCK",
      "seed amounts", "MiniCoin seed must be positive and at most fixed supply. Zero WMON is allowed for an explicitly approved single-sided range; price/range compatibility still needs liquidity rehearsal.");
  }
  add(report, "INFO", "NFT acquisition scope", "Existing RaidPrizeVault accepts a manual NFT deposit. Automatic marketplace purchase needs a reviewed module, executable listing, purchase rehearsal, and prize custody/settlement proof.");
  add(report, "BLOCK", "final transaction authorization", "Founder must approve exact chain, contracts, recipients, amounts, gas budget, and transactions after review. This script cannot authorize them.");
}

async function inspectMainnet({ env = process.env, providerFactory = (url) => new ethers.JsonRpcProvider(url), root = contractsRoot } = {}) {
  const report = { chainId: "143", readOnly: true, references: REFERENCES, sources: SOURCES, checks: [], observations: {} };
  checkV4SourcePins(report, root);
  const owner = publicAddress(report, env, "OWNER_ADDRESS");
  const deployer = publicAddress(report, env, "DEPLOYER_ADDRESS");
  const seedWallet = configured(env.SEED_WALLET_ADDRESS) ? publicAddress(report, env, "SEED_WALLET_ADDRESS") : null;
  if (!seedWallet) add(report, "BLOCK", "seed wallet", "Set SEED_WALLET_ADDRESS explicitly; do not assume the deployer funds liquidity.");
  if (owner && deployer && owner === deployer) add(report, "INFO", "roles", "Owner and deployer are the same wallet; review intended control before launch.");
  validateLaunchSettings(report, env);

  const hookFields = ["HOOK_ADDRESS", "HOOK_FLAGS", "HOOK_CREATE2_DEPLOYER", "HOOK_CREATE2_SALT", "HOOK_INIT_CODE_HASH", "HOOK_INIT_CODE_HEX", "HOOK_RUNTIME_CODEHASH"];
  for (const key of hookFields) if (!configured(env[key])) add(report, "BLOCK", key, "Missing hook deployment/bytecode evidence.");
  if (configured(env.HOOK_INIT_CODE_HEX) && configured(env.HOOK_INIT_CODE_HASH)) {
    const actualHash = ethers.isHexString(env.HOOK_INIT_CODE_HEX) ? ethers.keccak256(env.HOOK_INIT_CODE_HEX) : null;
    add(report, actualHash && actualHash.toLowerCase() === env.HOOK_INIT_CODE_HASH.toLowerCase() ? "PASS" : "BLOCK",
      "hook exact init code", "HASH must match the exact creation bytecode plus constructor arguments used for CREATE2.");
  }
  if (configured(env.HOOK_RUNTIME_CODEHASH) && !/^0x[0-9a-fA-F]{64}$/.test(env.HOOK_RUNTIME_CODEHASH)) {
    add(report, "BLOCK", "HOOK_RUNTIME_CODEHASH", "Must be a reviewed 32-byte runtime hash.");
  }
  if (hookFields.slice(0, 5).every((key) => configured(env[key]))) {
    try {
      const result = hookAddressCheck({ address: env.HOOK_ADDRESS, flags: env.HOOK_FLAGS, deployer: env.HOOK_CREATE2_DEPLOYER, salt: env.HOOK_CREATE2_SALT, initCodeHash: env.HOOK_INIT_CODE_HASH });
      report.observations.hook = result;
      add(report, result.matches ? "PASS" : "BLOCK", "hook CREATE2 and permission bits", `Mined ${result.mined}; low bits ${result.flags}, expected ${result.expectedFlags}.`);
    } catch {
      add(report, "BLOCK", "hook CREATE2 and permission bits", "Invalid CREATE2 input or hook flag bitmap.");
    }
  }

  for (const [name, envKey] of [["PoolManager", "POOL_MANAGER_RUNTIME_CODEHASH"], ["PositionManager", "POSITION_MANAGER_RUNTIME_CODEHASH"], ["WMON", "WMON_RUNTIME_CODEHASH"]]) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(env[envKey] || "")) add(report, "BLOCK", `${name} reviewed bytecode hash`, `Set ${envKey} from independently reviewed deployed source/bytecode evidence.`);
  }
  if (configured(env.MONAD_CHAIN_ID) && env.MONAD_CHAIN_ID !== "143") add(report, "BLOCK", "configured chain ID", "MONAD_CHAIN_ID must be 143 for this mainnet preflight.");
  if (!validRpcUrl(env.MONAD_RPC_URL)) {
    add(report, "BLOCK", "mainnet RPC", "Set a HTTPS Monad mainnet RPC URL; local and insecure URLs are refused. URL is never printed.");
    return report;
  }

  let provider;
  try {
    provider = providerFactory(env.MONAD_RPC_URL);
    const network = await provider.getNetwork();
    if (network.chainId !== CHAIN_ID) {
      add(report, "BLOCK", "RPC chain ID", `RPC returned ${network.chainId.toString()}; expected 143. No contract reads were made.`);
      return report;
    }
    add(report, "PASS", "RPC chain ID", "143 (Monad mainnet)");
  } catch {
    add(report, "BLOCK", "RPC chain ID", "RPC network read failed. Check endpoint independently; details are suppressed to protect URL credentials.");
    return report;
  }

  for (const [name, address] of Object.entries(REFERENCES)) {
    try {
      const code = await provider.getCode(address);
      if (!code || code === "0x") {
        add(report, "BLOCK", `${name} deployed code`, `No code at ${address} on chain 143.`);
        continue;
      }
      const codehash = ethers.keccak256(code);
      report.observations[`${name}Codehash`] = codehash;
      add(report, "PASS", `${name} deployed code`, `${address}; runtime hash ${codehash}`);
      const envKey = `${name === "PoolManager" ? "POOL_MANAGER" : name === "PositionManager" ? "POSITION_MANAGER" : "WMON"}_RUNTIME_CODEHASH`;
      if (configured(env[envKey])) add(report, env[envKey].toLowerCase() === codehash.toLowerCase() ? "PASS" : "BLOCK", `${name} bytecode match`, "Compared onchain runtime hash to reviewed expected hash.");
    } catch {
      add(report, "BLOCK", `${name} deployed code`, "Code read failed; RPC error details suppressed.");
    }
  }
  if (configured(env.HOOK_CREATE2_DEPLOYER) && ethers.isAddress(env.HOOK_CREATE2_DEPLOYER)) {
    try {
      const code = await provider.getCode(env.HOOK_CREATE2_DEPLOYER);
      add(report, code && code !== "0x" ? "PASS" : "BLOCK", "hook CREATE2 deployer code",
        code && code !== "0x" ? `Runtime hash ${ethers.keccak256(code)}; confirm deployer interface independently.` : "No deployed CREATE2 contract at configured address.");
    } catch { add(report, "BLOCK", "hook CREATE2 deployer code", "Code read failed; RPC details suppressed."); }
  }
  if (configured(env.HOOK_ADDRESS) && ethers.isAddress(env.HOOK_ADDRESS)) {
    try {
      const code = await provider.getCode(env.HOOK_ADDRESS);
      if (!code || code === "0x") add(report, "BLOCK", "hook deployed code", "No hook code yet; verify after deployment and before pool initialization.");
      else {
        const hash = ethers.keccak256(code);
        report.observations.hookCodehash = hash;
        add(report, "PASS", "hook deployed code", `Runtime hash ${hash}`);
        if (configured(env.HOOK_RUNTIME_CODEHASH)) add(report, env.HOOK_RUNTIME_CODEHASH.toLowerCase() === hash.toLowerCase() ? "PASS" : "BLOCK", "hook bytecode match", "Compared onchain hook runtime hash to reviewed build.");
      }
    } catch { add(report, "BLOCK", "hook deployed code", "Hook code read failed; RPC error details suppressed."); }
  }
  if (configured(env.NFT_COLLECTION_ADDRESS) && ethers.isAddress(env.NFT_COLLECTION_ADDRESS)) {
    try {
      const code = await provider.getCode(env.NFT_COLLECTION_ADDRESS);
      if (!code || code === "0x") add(report, "BLOCK", "NFT collection deployed code", "No code at configured collection on chain 143; source identity remains a separate review.");
      else {
        add(report, "PASS", "NFT collection deployed code", `Runtime hash ${ethers.keccak256(code)}; verify collection identity from the configured authoritative source.`);
        if (/^\d+$/.test(env.NFT_TOKEN_ID || "")) {
          const holder = ERC721.decodeFunctionResult("ownerOf", await provider.call({ to: env.NFT_COLLECTION_ADDRESS, data: ERC721.encodeFunctionData("ownerOf", [BigInt(env.NFT_TOKEN_ID)]) }))[0];
          add(report, "PASS", "NFT token exists", `Token ${env.NFT_TOKEN_ID} currently owned by ${holder}; listing/transferability still require review.`);
        }
      }
    } catch { add(report, "BLOCK", "NFT collection/token check", "Collection code or token owner read failed; RPC details suppressed."); }
  }
  if (configured(env.NFT_PURCHASE_MODULE_ADDRESS) && ethers.isAddress(env.NFT_PURCHASE_MODULE_ADDRESS)) {
    try {
      const code = await provider.getCode(env.NFT_PURCHASE_MODULE_ADDRESS);
      if (!code || code === "0x") add(report, "BLOCK", "NFT purchase module deployed code", "No code at configured purchase module on chain 143.");
      else {
        const hash = ethers.keccak256(code);
        add(report, "PASS", "NFT purchase module deployed code", `Runtime hash ${hash}`);
        add(report, env.NFT_PURCHASE_MODULE_RUNTIME_CODEHASH?.toLowerCase() === hash.toLowerCase() ? "PASS" : "BLOCK", "NFT purchase module bytecode match", "Compared onchain runtime hash to reviewed build.");
      }
    } catch { add(report, "BLOCK", "NFT purchase module deployed code", "Module code read failed; RPC details suppressed."); }
  }
  try {
    const symbol = ERC20.decodeFunctionResult("symbol", await provider.call({ to: REFERENCES.WMON, data: ERC20.encodeFunctionData("symbol") }))[0];
    const decimals = ERC20.decodeFunctionResult("decimals", await provider.call({ to: REFERENCES.WMON, data: ERC20.encodeFunctionData("decimals") }))[0];
    add(report, symbol === "WMON" && decimals === 18n ? "PASS" : "BLOCK", "WMON metadata", `symbol ${symbol}, decimals ${decimals}`);
  } catch { add(report, "BLOCK", "WMON metadata", "Could not verify ERC-20 symbol and decimals on chain 143."); }
  for (const [name, address] of [["deployer", deployer], ["seed wallet", seedWallet]]) {
    if (!address) continue;
    try {
      const balance = await provider.getBalance(address);
      report.observations[`${name.replace(" ", "") }MON`] = balance.toString();
      add(report, balance > 0n ? "PASS" : "BLOCK", `${name} MON balance`, `${ethers.formatEther(balance)} MON (gas budget must still be approved).`);
      if (name === "seed wallet") {
        const wmon = ERC20.decodeFunctionResult("balanceOf", await provider.call({ to: REFERENCES.WMON, data: ERC20.encodeFunctionData("balanceOf", [address]) }))[0];
        report.observations.seedWalletWMON = wmon.toString();
        const enough = /^\d+$/.test(env.SEED_WMON_WEI || "") && wmon >= BigInt(env.SEED_WMON_WEI);
        add(report, enough ? "PASS" : "BLOCK", "seed wallet WMON balance", `${ethers.formatEther(wmon)} WMON; compare with configured seed amount.`);
      }
    } catch { add(report, "BLOCK", `${name} balances`, "Balance read failed; RPC error details suppressed."); }
  }
  try {
    const fee = await provider.getFeeData();
    const unit = fee.maxFeePerGas || fee.gasPrice;
    if (unit != null) {
      report.observations.feeWeiPerGas = unit.toString();
      add(report, "INFO", "current fee reference", `${ethers.formatUnits(unit, "gwei")} gwei; ${ethers.formatEther(unit * 1_000_000n)} MON per 1M gas. Actual deployment gas is not estimable without final bytecode/transactions.`);
    }
  } catch { add(report, "INFO", "current fee reference", "Fee data unavailable from RPC."); }
  return report;
}

function printReport(report) {
  console.log("Monad 143 MiniCoin mainnet preflight — READ ONLY");
  console.log("Official references:", SOURCES.v4, SOURCES.wmon, SOURCES.hooks);
  for (const item of report.checks) console.log(`[${item.status}] ${item.name}: ${item.detail}`);
  console.log(`Result: ${report.checks.filter((item) => item.status === "BLOCK").length} blocking gate(s). No transaction was sent.`);
}

if (require.main === module) {
  inspectMainnet().then((report) => {
    printReport(report);
    if (report.checks.some((item) => item.status === "BLOCK")) process.exitCode = 1;
  }).catch(() => {
    console.error("Preflight failed unexpectedly. Sensitive RPC details are suppressed; no transaction was sent.");
    process.exitCode = 1;
  });
}

module.exports = { inspectMainnet, hookAddressCheck, validRpcUrl, REFERENCES, SOURCES, HOOK_MASK };
