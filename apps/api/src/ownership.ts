import { createPublicClient, http, parseAbi, type Address } from "viem";
import type { CommunityAsset } from "../../../packages/sdk/src/index.ts";
import type { OwnershipResolver, PlayerWallets } from "../../../packages/sdk/src/platform.ts";

const fungibleAndNftBalanceAbi = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);
const erc1155BalanceAbi = parseAbi(["function balanceOf(address owner, uint256 tokenId) view returns (uint256)"]);

/** Direct wallet ownership only. A future Delegate resolver can implement the same interface. */
export class DirectWalletOwnershipResolver implements OwnershipResolver {
  readonly configured: boolean;
  private readonly client?: ReturnType<typeof createPublicClient>;

  constructor(rpcUrl?: string) {
    this.configured = !!rpcUrl;
    if (rpcUrl) this.client = createPublicClient({ transport: http(rpcUrl) });
  }

  async isEligible(player: PlayerWallets, community: CommunityAsset): Promise<boolean> {
    if (!this.client || player.ownershipWallets.length === 0) return false;
    try {
      if (await this.client.getChainId() !== community.chainId) return false;
      for (const wallet of player.ownershipWallets) {
        const address = wallet as Address;
        const asset = community.address as Address;
        const balance = community.type === "erc1155"
          ? community.tokenId !== undefined
            ? await this.client.readContract({ address: asset, abi: erc1155BalanceAbi, functionName: "balanceOf", args: [address, BigInt(community.tokenId)] })
            : 0n
          : await this.client.readContract({ address: asset, abi: fungibleAndNftBalanceAbi, functionName: "balanceOf", args: [address] });
        if (balance > 0n) return true;
      }
    } catch {
      // An RPC failure cannot establish ownership. Callers can show an unavailable state.
      return false;
    }
    return false;
  }
}
