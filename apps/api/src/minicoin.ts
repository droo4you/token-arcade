import {
  createPublicClient, createWalletClient, getAddress, http, isAddress, keccak256,
  parseEventLogs, stringToHex, zeroAddress, zeroHash, type Address, type Transport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { GameRecord, MinicoinAssociation } from "../../../packages/sdk/src/index.ts";

const factoryAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "minicoinByGame", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "address" }] },
  { type: "function", name: "deploy", stateMutability: "nonpayable", inputs: [{ type: "tuple", name: "d", components: [
    { name: "gameId", type: "bytes32" }, { name: "name", type: "string" }, { name: "symbol", type: "string" },
    { name: "metadataURI", type: "string" }, { name: "communityAssetType", type: "uint8" },
    { name: "communityAsset", type: "address" }, { name: "communityTokenId", type: "uint256" },
    { name: "strategyRef", type: "bytes32" }, { name: "treasury", type: "address" },
    { name: "supplyRecipient", type: "address" }, { name: "initialSupply", type: "uint256" },
  ] }], outputs: [{ type: "address" }] },
  { type: "event", name: "MinicoinDeployed", inputs: [
    { indexed: true, name: "gameId", type: "bytes32" }, { indexed: true, name: "minicoin", type: "address" },
    { indexed: true, name: "creator", type: "address" }, { indexed: false, name: "communityAsset", type: "address" },
    { indexed: false, name: "communityAssetType", type: "uint8" }, { indexed: false, name: "communityTokenId", type: "uint256" },
    { indexed: false, name: "strategyRef", type: "bytes32" }, { indexed: false, name: "treasury", type: "address" },
    { indexed: false, name: "supplyRecipient", type: "address" }, { indexed: false, name: "initialSupply", type: "uint256" },
  ] },
] as const;

const tokenAbi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "gameId", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "communityAsset", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "communityAssetType", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "communityTokenId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "strategyRef", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "treasury", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

export interface MinicoinSettings {
  enabled?: boolean;
  rpcUrl?: string;
  chainId?: string;
  privateKey?: string;
  factoryAddress?: string;
  treasuryAddress?: string;
  supplyRecipient?: string;
  /** In-memory EVM transport for local-chain integration tests. */
  transport?: Transport;
}

export interface MinicoinInput {
  name: string;
  symbol: string;
  metadataURI: string;
  initialSupply: bigint;
}

export class MinicoinError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function addressOrUndefined(value?: string): Address | undefined {
  return value && isAddress(value) ? getAddress(value) : undefined;
}

export class MinicoinDeployer {
  readonly ready: boolean;
  readonly reason?: string;
  readonly reconcileReady: boolean;
  readonly reconcileReason?: string;
  private readonly settings: MinicoinSettings;

  constructor(settings: MinicoinSettings) {
    this.settings = settings;
    const readMissing: string[] = [];
    if (!settings.rpcUrl && !settings.transport) readMissing.push("MONAD_RPC_URL");
    if (!settings.chainId || !/^\d+$/.test(settings.chainId) || Number(settings.chainId) <= 0) readMissing.push("MONAD_CHAIN_ID");
    if (!addressOrUndefined(settings.factoryAddress)) readMissing.push("MINICOIN_FACTORY_ADDRESS");
    if (!addressOrUndefined(settings.treasuryAddress)) readMissing.push("TREASURY_ADDRESS");
    if (!addressOrUndefined(settings.supplyRecipient)) readMissing.push("MINICOIN_SUPPLY_RECIPIENT");
    this.reconcileReady = readMissing.length === 0;
    if (readMissing.length) this.reconcileReason = `Minicoin reconciliation requires ${readMissing.join(", ")}`;
    const missing = [...readMissing];
    if (!settings.enabled) missing.push("ENABLE_ONCHAIN_WRITES=true");
    if (!settings.privateKey || !/^0x[0-9a-fA-F]{64}$/.test(settings.privateKey)) missing.push("DEPLOYER_PRIVATE_KEY");
    this.ready = missing.length === 0;
    if (missing.length) this.reason = `Minicoin deployment requires ${missing.join(", ")}`;
  }

  async deploy(game: GameRecord, input: MinicoinInput): Promise<MinicoinAssociation> {
    if (!this.ready) throw new MinicoinError("SETTLEMENT_NOT_READY", this.reason ?? "Minicoin deployment is not configured", 503);
    const settings = this.settings;
    const transport = settings.transport ?? http(settings.rpcUrl!);
    const client = createPublicClient({ transport });
    const expectedChainId = Number(settings.chainId);
    const actualChainId = await client.getChainId();
    if (actualChainId !== expectedChainId) throw new MinicoinError("CHAIN_MISMATCH", `RPC chain ID ${actualChainId} does not match configured chain ID ${expectedChainId}`);
    if (game.community && game.community.chainId !== actualChainId) throw new MinicoinError("CHAIN_MISMATCH", "Community Asset chain ID does not match the deployment chain");
    const factory = getAddress(settings.factoryAddress!);
    const bytecode = await client.getBytecode({ address: factory });
    if (!bytecode || bytecode === "0x") throw new MinicoinError("FACTORY_UNAVAILABLE", "Minicoin factory has no code on the configured chain");
    const account = privateKeyToAccount(settings.privateKey as `0x${string}`);
    const owner = await client.readContract({ address: factory, abi: factoryAbi, functionName: "owner" });
    if (getAddress(owner) !== account.address) throw new MinicoinError("FACTORY_OWNER_MISMATCH", "Configured deployer is not the Minicoin factory owner");
    const gameId = keccak256(stringToHex(game.manifest.id));
    const existing = await client.readContract({ address: factory, abi: factoryAbi, functionName: "minicoinByGame", args: [gameId] });
    if (existing !== zeroAddress) throw new MinicoinError("MINICOIN_EXISTS", "The factory already has a Minicoin for this game");
    const assetType = game.community ? { erc20: 1, erc721: 2, erc1155: 3 }[game.community.type] : 0;
    const config = {
      gameId, name: input.name, symbol: input.symbol, metadataURI: input.metadataURI,
      communityAssetType: assetType, communityAsset: game.community ? getAddress(game.community.address) : zeroAddress,
      communityTokenId: game.community?.type === "erc1155" ? BigInt(game.community.tokenId ?? "0") : 0n,
      strategyRef: game.communityStrategy ? keccak256(stringToHex(game.communityStrategy)) : zeroHash,
      treasury: getAddress(settings.treasuryAddress!), supplyRecipient: getAddress(settings.supplyRecipient!),
      initialSupply: input.initialSupply,
    };
    const { request } = await client.simulateContract({ address: factory, abi: factoryAbi, functionName: "deploy", args: [config], account });
    const wallet = createWalletClient({ account, transport });
    const hash = await wallet.writeContract(request);
    try {
      return await this.reconcile(game, hash);
    } catch (error) {
      if (error instanceof MinicoinError && error.code !== "DEPLOY_UNCONFIRMED") throw error;
      throw new MinicoinError("DEPLOY_UNCONFIRMED", `Factory transaction ${hash} was submitted but confirmation was not verified. Reconcile this hash before considering another deployment`, 503);
    }
  }

  async reconcile(game: GameRecord, hash: `0x${string}`): Promise<MinicoinAssociation> {
    if (!this.reconcileReady) throw new MinicoinError("SETTLEMENT_NOT_READY", this.reconcileReason ?? "Minicoin reconciliation is not configured", 503);
    const settings = this.settings;
    const client = createPublicClient({ transport: settings.transport ?? http(settings.rpcUrl!) });
    const actualChainId = await client.getChainId();
    if (actualChainId !== Number(settings.chainId)) throw new MinicoinError("CHAIN_MISMATCH", "RPC chain ID does not match configured chain ID");
    if (game.community && game.community.chainId !== actualChainId) throw new MinicoinError("CHAIN_MISMATCH", "Community Asset chain ID does not match the deployment chain");
    const factory = getAddress(settings.factoryAddress!);
    let receipt;
    try { receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 15_000 }); }
    catch { throw new MinicoinError("DEPLOY_UNCONFIRMED", `Transaction ${hash} has no confirmed receipt`, 503); }
    if (receipt.status !== "success") throw new MinicoinError("DEPLOY_FAILED", "Minicoin factory transaction reverted");
    const gameId = keccak256(stringToHex(game.manifest.id));
    const events = parseEventLogs({ abi: factoryAbi, eventName: "MinicoinDeployed", logs: receipt.logs }).filter((log) =>
      getAddress(log.address) === factory && log.args.gameId === gameId);
    if (events.length !== 1) throw new MinicoinError("DEPLOY_UNVERIFIED", "Confirmed transaction lacked the expected Minicoin deployment event");
    const minicoin = getAddress(events[0].args.minicoin);
    const mapped = await client.readContract({ address: factory, abi: factoryAbi, functionName: "minicoinByGame", args: [gameId] });
    if (getAddress(mapped) !== minicoin) throw new MinicoinError("DEPLOY_UNVERIFIED", "Factory mapping does not match the deployment event");
    const expectedType = game.community ? { erc20: 1, erc721: 2, erc1155: 3 }[game.community.type] : 0;
    const expectedAsset = game.community ? getAddress(game.community.address) : zeroAddress;
    const expectedTokenId = game.community?.type === "erc1155" ? BigInt(game.community.tokenId ?? "0") : 0n;
    const expectedStrategy = game.communityStrategy ? keccak256(stringToHex(game.communityStrategy)) : zeroHash;
    const event = events[0].args;
    if (event.communityAssetType !== expectedType || getAddress(event.communityAsset) !== expectedAsset ||
        event.communityTokenId !== expectedTokenId || event.strategyRef !== expectedStrategy ||
        getAddress(event.treasury) !== getAddress(settings.treasuryAddress!) ||
        getAddress(event.supplyRecipient) !== getAddress(settings.supplyRecipient!)) {
      throw new MinicoinError("DEPLOY_MISMATCH", "Confirmed deployment does not match the game's Community Asset, Strategy, or configured recipients");
    }
    const [symbol, tokenGameId, tokenFactory, tokenAsset, tokenType, tokenId, tokenStrategy, tokenTreasury] = await Promise.all([
      client.readContract({ address: minicoin, abi: tokenAbi, functionName: "symbol" }),
      client.readContract({ address: minicoin, abi: tokenAbi, functionName: "gameId" }),
      client.readContract({ address: minicoin, abi: tokenAbi, functionName: "factory" }),
      client.readContract({ address: minicoin, abi: tokenAbi, functionName: "communityAsset" }),
      client.readContract({ address: minicoin, abi: tokenAbi, functionName: "communityAssetType" }),
      client.readContract({ address: minicoin, abi: tokenAbi, functionName: "communityTokenId" }),
      client.readContract({ address: minicoin, abi: tokenAbi, functionName: "strategyRef" }),
      client.readContract({ address: minicoin, abi: tokenAbi, functionName: "treasury" }),
    ]);
    if (tokenGameId !== gameId || getAddress(tokenFactory) !== factory || getAddress(tokenAsset) !== expectedAsset ||
        tokenType !== expectedType || tokenId !== expectedTokenId || tokenStrategy !== expectedStrategy ||
        getAddress(tokenTreasury) !== getAddress(settings.treasuryAddress!)) {
      throw new MinicoinError("DEPLOY_MISMATCH", "Token metadata does not match the verified factory association");
    }
    return { chainId: actualChainId, address: minicoin, symbol, deploymentTx: hash, experimental: true };
  }
}
