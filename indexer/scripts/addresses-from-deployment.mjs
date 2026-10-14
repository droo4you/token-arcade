// Writes indexer/.env from ../contracts/deployments/monad-testnet.json (created by deploy-economy-testnet.cjs).
// Usage: npm run addresses [-- path/to/deployment.json] [-- --nft-vault 0x...]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const args = process.argv.slice(2);
const file = args.find((a) => a.endsWith(".json")) ?? fileURLToPath(new URL("../../contracts/deployments/monad-testnet.json", import.meta.url));
if (!existsSync(file)) { console.error(`No deployment at ${file}. Run contracts/scripts/deploy-economy-testnet.cjs first.`); process.exit(1); }
const d = JSON.parse(readFileSync(file, "utf8"));
if (String(d.chainId) !== "10143" || d.status !== "complete") throw new Error("A complete Monad testnet deployment is required");
const c = d.contracts ?? {};
const nft = args[args.indexOf("--nft-vault") + 1];
const env = {
  ENVIO_RAID_VAULT: c.raidVault, ENVIO_ECONOMY_MANAGER: c.economyManager, ENVIO_FEE_ACCUMULATOR: c.feeAccumulator,
  ENVIO_MINICOIN_HOOK: c.miniCoinHook, ENVIO_NFT_RAID_VAULT: args.includes("--nft-vault") ? nft : c.communityNftRaidVault,
  ENVIO_START_BLOCK: d.startBlock ?? process.env.ENVIO_START_BLOCK,
};
const lines = Object.entries(env).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`);
writeFileSync(new URL("../.env", import.meta.url), lines.join("\n") + "\n");
console.log(lines.join("\n"));
