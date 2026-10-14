import { createHash, randomUUID } from "node:crypto";
import { getAddress, isAddress, zeroAddress } from "viem";
import type { GameRecord } from "../../../packages/sdk/src/index.ts";
import type { TestnetTokenConfig, TestnetTokenInput, TestnetTokenLaunch } from "../../../packages/sdk/src/testnet.ts";
import type { Identity } from "./auth.ts";
import type { ArcadeStore } from "./store.ts";
import { MinicoinDeployer, MinicoinError, type MinicoinSettings } from "./minicoin.ts";

const deny = (code: string, message: string, status = 409): never => { throw new MinicoinError(code, message, status); };
const cleanAddress = (value?: string) => value && isAddress(value) && value !== zeroAddress ? getAddress(value) : undefined;

export class TestnetMinicoinService {
  readonly config: TestnetTokenConfig;
  private readonly deployer: MinicoinDeployer;
  private readonly store: ArcadeStore;
  constructor(store: ArcadeStore, settings: MinicoinSettings, localDemo: boolean) {
    this.store = store;
    const chainId = Number(settings.chainId || 10143);
    // Local chain access is only injectable by local tests. No mainnet fallback.
    const allowed = chainId === 10143 || (chainId === 31337 && localDemo && !!settings.transport);
    const normalized = { ...settings, chainId: String(chainId), factoryAddress: cleanAddress(settings.factoryAddress),
      treasuryAddress: cleanAddress(settings.treasuryAddress), supplyRecipient: cleanAddress(settings.supplyRecipient),
      enabled: allowed && settings.enabled };
    this.deployer = new MinicoinDeployer(normalized);
    this.config = { chainId, factoryAddress: normalized.factoryAddress, treasuryAddress: normalized.treasuryAddress,
      supplyRecipient: normalized.supplyRecipient, ready: allowed && this.deployer.ready,
      reason: allowed ? this.deployer.reason : "This launch flow accepts Monad testnet only" };
    store.db.exec("CREATE TABLE IF NOT EXISTS testnet_token_launches (game_id TEXT PRIMARY KEY, json TEXT NOT NULL)");
  }
  get(gameId: string): TestnetTokenLaunch | undefined {
    const row = this.store.db.prepare("SELECT json FROM testnet_token_launches WHERE game_id = ?").get(gameId) as { json: string } | undefined;
    return row ? JSON.parse(row.json) : undefined;
  }
  private save(launch: TestnetTokenLaunch): void {
    this.store.db.prepare("INSERT INTO testnet_token_launches VALUES (?, ?) ON CONFLICT(game_id) DO UPDATE SET json = excluded.json")
      .run(launch.gameId, JSON.stringify(launch));
  }
  private fingerprint(game: GameRecord): string {
    const { chainId, factoryAddress, treasuryAddress, supplyRecipient } = this.config;
    return createHash("sha256").update(JSON.stringify({ manifest: game.manifest, creatorId: game.creatorId,
      community: game.community, strategy: game.communityStrategy, chainId, factoryAddress, treasuryAddress, supplyRecipient })).digest("hex");
  }
  private creator(game: GameRecord, identity: Identity): void {
    if (!game.creatorId || game.creatorId !== identity.id) deny("FORBIDDEN", "Only this game's submitting creator can request or launch its test token", 403);
  }
  private current(game: GameRecord, id: unknown): TestnetTokenLaunch {
    const launch = this.get(game.manifest.id);
    if (!launch || launch.id !== id) return deny("STALE_REQUEST", "Reload the current launch request");
    return launch;
  }
  private unchanged(game: GameRecord, launch: TestnetTokenLaunch): void {
    if (!["approved", "published"].includes(game.status) || launch.fingerprint !== this.fingerprint(game)) {
      deny("STALE_APPROVAL", "Game or network settings changed. Submit a new request for review");
    }
  }
  submit(game: GameRecord, identity: Identity, body: Record<string, unknown>): TestnetTokenLaunch {
    this.creator(game, identity);
    if (!this.config.ready) deny("TESTNET_NOT_READY", this.config.reason ?? "Testnet is not configured", 503);
    if (!["approved", "published"].includes(game.status)) deny("NOT_APPROVED", "Approve the cartridge before requesting a test token");
    if (["pending", "deployed"].includes(this.get(game.manifest.id)?.status ?? "")) deny("LAUNCH_EXISTS", "A launch is already pending or confirmed; reconcile it first");
    const str = (key: string, max: number) => {
      const value = body[key];
      if (typeof value !== "string" || !value.trim() || value.length > max) return deny("INVALID_INPUT", `Invalid ${key}`, 400);
      return value.trim();
    };
    const input: TestnetTokenInput = { name: str("name", 80), symbol: str("symbol", 20), metadataURI: str("metadataURI", 1000), initialSupply: str("initialSupply", 78) };
    if (!/^[A-Za-z][A-Za-z0-9]{0,19}$/.test(input.symbol) || !/^[1-9][0-9]*$/.test(input.initialSupply) || BigInt(input.initialSupply) >= 2n ** 256n) deny("INVALID_INPUT", "Use an alphanumeric symbol and a positive uint256 supply", 400);
    try { if (!["https:", "ipfs:"].includes(new URL(input.metadataURI).protocol)) throw new Error(); }
    catch { deny("INVALID_INPUT", "Metadata URI must use HTTPS or IPFS", 400); }
    const launch: TestnetTokenLaunch = { id: randomUUID(), gameId: game.manifest.id, creatorId: identity.id,
      status: "submitted", input, config: this.config, fingerprint: this.fingerprint(game), submittedAt: new Date().toISOString() };
    this.save(launch); return launch;
  }
  review(game: GameRecord, identity: Identity, body: Record<string, unknown>, approve: boolean): TestnetTokenLaunch {
    if (!identity.isAdmin) deny("FORBIDDEN", "An administrator must review token settings", 403);
    const launch = this.current(game, body.requestId);
    if (launch.status !== "submitted") deny("INVALID_STATE", "Only submitted requests can be reviewed");
    this.unchanged(game, launch);
    if (approve) Object.assign(launch, { status: "approved", approvedBy: identity.id, approvedAt: new Date().toISOString() });
    else {
      if (typeof body.note !== "string" || !body.note.trim() || body.note.length > 1000) deny("INVALID_INPUT", "Include review feedback", 400);
      Object.assign(launch, { status: "rejected", note: (body.note as string).trim() });
    }
    this.save(launch); return launch;
  }
  async deploy(game: GameRecord, identity: Identity, body: Record<string, unknown>): Promise<TestnetTokenLaunch> {
    this.creator(game, identity);
    const launch = this.current(game, body.requestId);
    if (launch.status !== "approved") deny("NOT_APPROVED", "This token request is not approved or already has a pending launch");
    if (body.confirmTestnet !== true) deny("CONFIRM_TESTNET", "Confirm the testnet launch", 400);
    this.unchanged(game, launch);
    if (!this.config.ready) deny("TESTNET_NOT_READY", this.config.reason ?? "Testnet writes disabled", 503);
    // Persist before the first asynchronous operation. A retry cannot send twice, even after a restart.
    launch.status = "pending"; this.save(launch);
    try {
      launch.token = await this.deployer.deploy(this.testGame(game), { ...launch.input, initialSupply: BigInt(launch.input.initialSupply) }, (hash) => {
        launch.transactionHash = hash; this.save(launch);
      });
      launch.status = "deployed"; delete launch.note; this.save(launch); return launch;
    } catch {
      launch.note = "Launch confirmation is incomplete. Check the transaction before sending anything again.";
      this.save(launch);
      return launch;
    }
  }
  async reconcile(game: GameRecord, identity: Identity, body: Record<string, unknown>): Promise<TestnetTokenLaunch> {
    if (!identity.isAdmin) this.creator(game, identity);
    const launch = this.current(game, body.requestId);
    if (launch.status === "deployed") return launch;
    if (launch.status !== "pending") deny("INVALID_STATE", "Only a pending launch can be reconciled");
    // Use the approved chain and recipients even if server config later changes. Never silently switch chains.
    const { chainId, factoryAddress, treasuryAddress, supplyRecipient } = launch.config;
    if (JSON.stringify([chainId, factoryAddress, treasuryAddress, supplyRecipient]) !==
        JSON.stringify([this.config.chainId, this.config.factoryAddress, this.config.treasuryAddress, this.config.supplyRecipient])) deny("CONFIG_CHANGED", "Restore the launch network configuration before reconciliation");
    const hash = launch.transactionHash ?? body.transactionHash;
    if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) deny("INVALID_INPUT", "Enter the submitted transaction hash", 400);
    launch.token = await this.deployer.reconcile(this.testGame(game), hash as `0x${string}`, { ...launch.input, initialSupply: BigInt(launch.input.initialSupply) });
    launch.transactionHash = hash as string; launch.status = "deployed"; delete launch.note; this.save(launch); return launch;
  }
  private testGame(game: GameRecord): GameRecord {
    // A mainnet community address has no provenance on testnet. This first launch is token-only.
    return { ...game, community: undefined, communityStrategy: undefined };
  }
}
