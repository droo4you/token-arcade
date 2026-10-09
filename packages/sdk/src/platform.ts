import type { CommunityAsset, Raid } from "./index.ts";

export interface PlayerWallets {
  playerId: string;
  arcadeWallet?: string;
  ownershipWallets: string[];
}

export interface OwnershipResolver {
  isEligible(player: PlayerWallets, community: CommunityAsset): Promise<boolean>;
}

export interface CommunityStrategy {
  id: string;
  assetType: CommunityAsset["type"];
  ownershipResolver: OwnershipResolver;
}

export interface ConfirmedTransaction {
  chainId: number;
  txHash: `0x${string}`;
  blockNumber: bigint;
}

/** The API invokes this interface; cartridges never import it. */
export interface SettlementAdapter {
  collectEntry(raid: Raid, playerWallet: string): Promise<ConfirmedTransaction>;
  deployMinicoin(input: {
    gameId: string;
    community?: CommunityAsset;
    name: string;
    symbol: string;
    treasury: string;
  }): Promise<ConfirmedTransaction & { tokenAddress: string }>;
  depositRaidPrize(raid: Raid, ownerWallet: string): Promise<ConfirmedTransaction>;
  settleRaid(raid: Raid, winnerWallet: string): Promise<ConfirmedTransaction>;
}

export function validFeeSplit(split: Raid["feeSplitBps"]): boolean {
  return Object.values(split).every((value) => Number.isInteger(value) && value >= 0 && value <= 10_000) &&
    split.prize + split.community + split.treasury === 10_000;
}
