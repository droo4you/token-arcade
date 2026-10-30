import { ageStatus } from "./privacy.ts";
import type { IncomingMessage } from "node:http";
import { createHash } from "node:crypto";
import { PrivyClient, type User } from "@privy-io/node";
import { getAddress, isAddress } from "viem";

export interface AuthSettings {
  appId?: string;
  appSecret?: string;
  /** Public verification key override for offline tests or a pinned Privy key. */
  jwtVerificationKey?: string;
  adminPrivyIds?: string;
  localDemoMode?: boolean;
  localDemoAdminDisabled?: boolean;
  requireAdultSession?: boolean;
}

export interface Identity {
  id: string;
  isAdmin: boolean;
  source: "privy" | "local-demo";
}

export class AuthError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 401, code = "UNAUTHENTICATED") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class ArcadeAuth {
  private readonly requireAdultSession: boolean;
  private readonly client?: PrivyClient;
  private readonly walletRequests = new Map<string, Promise<string | undefined>>();
  private readonly admins: Set<string>;
  readonly localDemoMode: boolean;
  readonly localDemoAdmin: boolean;

  constructor(settings: AuthSettings) {
    this.requireAdultSession = process.env.NODE_ENV === "production" || settings.requireAdultSession === true;
    this.admins = new Set((settings.adminPrivyIds ?? "").split(",").map((id) => id.trim()).filter(Boolean));
    // A reverse proxy can make a public request appear to come from loopback.
    // Never accept demo bearer identities in a production process, even there.
    this.localDemoMode = settings.localDemoMode === true && process.env.NODE_ENV !== "production";
    this.localDemoAdmin = this.localDemoMode && settings.localDemoAdminDisabled !== true;
    if (settings.appId && settings.appSecret) {
      this.client = new PrivyClient({
        appId: settings.appId, appSecret: settings.appSecret,
        ...(settings.jwtVerificationKey ? { jwtVerificationKey: settings.jwtVerificationKey } : {}),
      });
    }
  }

  get privyReady(): boolean { return !!this.client; }

  /** Find or create the verified player's user-owned arcade wallet on Privy's server. */
  async arcadeWallet(identity: Identity): Promise<string | undefined> {
    if (identity.source !== "privy" || !this.client) return undefined;
    const inFlight = this.walletRequests.get(identity.id);
    if (inFlight) return inFlight;
    const request = this.findOrCreateArcadeWallet(identity.id);
    this.walletRequests.set(identity.id, request);
    try { return await request; }
    finally { this.walletRequests.delete(identity.id); }
  }

  private async findOrCreateArcadeWallet(userId: string): Promise<string> {
    const client = this.client!;
    const user = await client.users()._get(userId);
    if (user.id !== userId) throw new AuthError("Privy user record did not match the verified identity");
    const existing = arcadeWalletFromUser(user);
    if (existing) return existing;

    // A stable external ID and Privy's idempotency key avoid duplicate wallets
    // when two Passport requests arrive before the user record has caught up.
    const externalId = `ta_arcade_${createHash("sha256").update(userId).digest("hex").slice(0, 40)}`;
    let wallet;
    try {
      wallet = await client.wallets().create({
        chain_type: "ethereum", owner: { user_id: userId }, external_id: externalId,
        idempotency_key: externalId,
      });
    } catch (reason) {
      const status = typeof reason === "object" && reason !== null && "status" in reason ? reason.status : undefined;
      if (status !== 409) throw reason;
      wallet = await client.wallets().get(`ext_wal_${externalId}`);
    }
    if (wallet.chain_type !== "ethereum" || wallet.external_id !== externalId || !isAddress(wallet.address)) {
      throw new AuthError("Privy returned an unexpected arcade wallet", 502, "WALLET_SYNC_FAILED");
    }
    return getAddress(wallet.address);
  }

  async authenticate(request: IncomingMessage): Promise<Identity> {
    const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? "");
    if (!match) throw new AuthError("A player account is required");
    const token = match[1];

    if (token.startsWith("local-demo:")) {
      const address = request.socket.remoteAddress;
      const loopback = address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
      if (!this.localDemoMode || !loopback) throw new AuthError("Local demo identity is disabled");
      const name = token.slice("local-demo:".length);
      if (!/^[a-z][a-z0-9_-]{0,31}$/.test(name)) throw new AuthError("Invalid local demo identity");
      if (this.requireAdultSession && ageStatus(request) !== "adult") throw new AuthError("Complete the age check before signing in.", 403, "AGE_CHECK_REQUIRED");
      return { id: `local-demo:${name}`, isAdmin: name === "admin" && this.localDemoAdmin, source: "local-demo" };
    }

    if (this.requireAdultSession && ageStatus(request) !== "adult") throw new AuthError("Complete the age check before signing in.", 403, "AGE_CHECK_REQUIRED");
    if (!this.client) throw new AuthError("Privy authentication is not configured", 503, "AUTH_NOT_CONFIGURED");
    try {
      const claims = await this.client.utils().auth().verifyAccessToken(token);
      if (!claims.user_id) throw new Error("No authenticated user ID");
      return { id: claims.user_id, isAdmin: this.admins.has(claims.user_id), source: "privy" };
    } catch {
      throw new AuthError("Invalid or expired Privy access token");
    }
  }
}

export function arcadeWalletFromUser(user: User): string | undefined {
  const account = user.linked_accounts.find((item) =>
    item.type === "wallet" && item.chain_type === "ethereum" &&
    item.connector_type === "embedded" && item.wallet_client === "privy" && isAddress(item.address));
  return account?.type === "wallet" && account.chain_type === "ethereum" ? getAddress(account.address) : undefined;
}
