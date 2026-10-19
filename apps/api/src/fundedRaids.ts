import { createPublicClient, http, parseAbi, keccak256, stringToHex, encodeFunctionData, getAddress, type Address, type Hex } from "viem";
import type { Raid, GameRecord, Passport } from "../../../packages/sdk/src/index.ts";
import type { ArcadeStore } from "./store.ts";

export const fundedVaultAbi = parseAbi([
  "function gameId() view returns (bytes32)",
  "function wmon() view returns (address)",
  "function raids(bytes32) view returns (bytes32 rulesHash,bytes32 resultHash,uint256 prize,uint256 startsAt,uint256 endsAt,uint256 settleBy,uint256 claimWindow,uint256 claimDeadline,address winner,uint8 status)",
  "function settleRaid(bytes32 raidId,address winner,bytes32 resultHash)",
  "function claimPrize(bytes32 raidId,address to)",
]);
export class FundedRaidError extends Error {
  status = 409;
  code = "FUNDED_RAID_NOT_READY";
}
function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new FundedRaidError(message);
}
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]));
  return value;
}
export const artifactHash = (value: unknown) => keccak256(stringToHex(JSON.stringify(ordered(value))));
export function fundedRules(raid: Raid, game: GameRecord) {
  return { schema: "token-arcade-funded-raid-v1", chainId: 10143, websiteRaidId: raid.id,
    gameId: raid.gameId, gameVersion: game.manifest.version, adapterId: game.manifest.adapterId,
    objective: raid.objective, seed: raid.seed, maxAttempts: raid.maxAttempts, rules: raid.rules ?? {} };
}

/** Explicit opt-in to one reviewed testnet vault. No private key lives in this service. */
export class FundedRaids {
  private readonly client;
  private readonly store: ArcadeStore;
  readonly vault?: Address;
  constructor(store: ArcadeStore, settings = {
    rpcUrl: process.env.TESTNET_RPC_URL, vault: process.env.TESTNET_RAID_VAULT,
  }) {
    this.store = store;
    this.vault = settings.vault ? getAddress(settings.vault) : undefined;
    this.client = createPublicClient({ transport: http(settings.rpcUrl || "https://testnet-rpc.monad.xyz", { timeout: 10_000, retryCount: 1 }) });
  }
  private async chain() {
    requireThat(this.vault, "Configure TESTNET_RAID_VAULT before using funded raids");
    requireThat(await this.client.getChainId() === 10143, "Funded raids require Monad testnet (10143)");
    return this.vault;
  }
  private game(raid: Raid) {
    const game = this.store.getGame(raid.gameId);
    requireThat(game?.status === "published", "Published game required");
    return game;
  }
  rules(raid: Raid) {
    requireThat(raid.status === "draft" && !raid.funding, "Create an unfunded draft first");
    requireThat(!raid.entry && raid.reward.type === "erc20", "Pilot requires free entry and an ERC20 prize");
    const artifact = fundedRules(raid, this.game(raid));
    return { artifact, rulesHash: artifactHash(artifact), chainId: 10143, vault: this.vault ?? null };
  }
  async bind(raid: Raid, chainRaidId: Hex) {
    const rules = this.rules(raid);
    const vault = await this.chain();
    const [onchain, gameId, token] = await Promise.all([
      this.client.readContract({ address: vault, abi: fundedVaultAbi, functionName: "raids", args: [chainRaidId] }),
      this.client.readContract({ address: vault, abi: fundedVaultAbi, functionName: "gameId" }),
      this.client.readContract({ address: vault, abi: fundedVaultAbi, functionName: "wmon" }),
    ]);
    const block = await this.client.getBlock();
    requireThat(onchain[9] === 1 && onchain[4] > block.timestamp + 300n, "Open a chain raid with at least five minutes left for players");
    requireThat(gameId === keccak256(stringToHex(raid.gameId)), "Vault belongs to a different game");
    requireThat(onchain[0] === rules.rulesHash, "On-chain rules must commit to this website raid before opening");
    requireThat(raid.reward.type === "erc20" && getAddress(raid.reward.asset) === token, "Prize token does not match vault custody");
    requireThat(onchain[2] > 0n, "Vault has no locked prize");
    requireThat(!this.store.listRaids().some(r => r.funding?.vault === vault && r.funding.chainRaidId === chainRaidId), "Chain raid is already linked");
    const next: Raid = { ...raid, startsAt: new Date(Number(onchain[3]) * 1000).toISOString(), endsAt: new Date(Number(onchain[4]) * 1000).toISOString(),
      reward: { type: "erc20", asset: token, amount: onchain[2].toString() },
      funding: { chainId: 10143, vault, chainRaidId, rulesHash: rules.rulesHash, gameVersion: this.game(raid).manifest.version, prizeWei: onchain[2].toString() }, status: "open" };
    this.store.saveRaid(next);
    return next;
  }
  snapshotWallet(raid: Raid, passport: Passport) {
    requireThat(raid.funding && this.game(raid).manifest.version === raid.funding.gameVersion, "Funded game version has changed");
    requireThat(artifactHash(fundedRules(raid, this.game(raid))) === raid.funding.rulesHash, "Funded rules have changed");
    const existing = this.store.db.prepare("SELECT wallet FROM funded_raid_players WHERE raid_id=? AND player_id=?").get(raid.id, passport.playerId) as { wallet: string } | undefined;
    if (existing) return existing.wallet;
    requireThat(passport.arcadeWallet, "Open your Passport and create your Privy arcade wallet before entering this funded raid");
    const wallet = getAddress(passport.arcadeWallet);
    this.store.db.prepare("INSERT INTO funded_raid_players VALUES (?,?,?)").run(raid.id, passport.playerId, wallet);
    return wallet;
  }
  settlement(raid: Raid) {
    requireThat(raid.funding && raid.finalResult && raid.status === "closed", "Wait for frozen final standings");
    const winner = raid.finalResult.entries[0];
    requireThat(winner, "No qualifying winner; cancel or time out the chain raid");
    const row = this.store.db.prepare("SELECT wallet FROM funded_raid_players WHERE raid_id=? AND player_id=?").get(raid.id, winner.playerId) as { wallet: Address } | undefined;
    requireThat(row, "Winner has no wallet recorded at entry");
    const artifact = { schema: "token-arcade-funded-result-v1", chainId: 10143, websiteRaidId: raid.id, vault: raid.funding.vault,
      chainRaidId: raid.funding.chainRaidId, rulesHash: raid.funding.rulesHash, winner: row.wallet, finalResult: raid.finalResult };
    const resultHash = artifactHash(artifact);
    return { artifact, resultHash, transaction: { chainId: 10143, to: raid.funding.vault, value: "0", data: encodeFunctionData({ abi: fundedVaultAbi, functionName: "settleRaid", args: [raid.funding.chainRaidId as Hex, row.wallet, resultHash] }) } };
  }
  async claim(raid: Raid, passport: Passport) {
    const plan = this.settlement(raid);
    requireThat(raid.finalResult!.entries[0].playerId === passport.playerId, "Only the recorded winner can claim");
    const vault = await this.chain();
    requireThat(vault === raid.funding!.vault, "Vault configuration changed");
    const [onchain, block] = await Promise.all([
      this.client.readContract({ address: vault, abi: fundedVaultAbi, functionName: "raids", args: [raid.funding!.chainRaidId as Hex] }), this.client.getBlock(),
    ]);
    requireThat(onchain[8].toLowerCase() === plan.artifact.winner.toLowerCase() && onchain[1] === plan.resultHash, "Chain settlement does not match final standings");
    if (onchain[9] === 3) return { claimed: true as const };
    requireThat(onchain[9] === 2 && onchain[7] > block.timestamp, "Prize is not claimable yet or its claim window expired");
    return { claimed: false as const, wallet: plan.artifact.winner, transaction: { chainId: 10143, to: vault, value: "0", data: encodeFunctionData({ abi: fundedVaultAbi, functionName: "claimPrize", args: [raid.funding!.chainRaidId as Hex, plan.artifact.winner] }) } };
  }
}
