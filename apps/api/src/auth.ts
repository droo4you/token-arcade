import type { IncomingMessage } from "node:http";
import { PrivyClient, type User } from "@privy-io/node";
import { getAddress, isAddress } from "viem";

export interface AuthSettings {
  appId?: string;
  appSecret?: string;
  adminPrivyIds?: string;
  localDemoMode?: boolean;
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
  private readonly client?: PrivyClient;
  private readonly admins: Set<string>;
  readonly localDemoMode: boolean;

  constructor(settings: AuthSettings) {
    this.admins = new Set((settings.adminPrivyIds ?? "").split(",").map((id) => id.trim()).filter(Boolean));
    this.localDemoMode = settings.localDemoMode === true;
    if (settings.appId && settings.appSecret) {
      this.client = new PrivyClient({ appId: settings.appId, appSecret: settings.appSecret });
    }
  }

  get privyReady(): boolean { return !!this.client; }

  /** Derive the arcade wallet from Privy's server-side user record, never a browser field. */
  async arcadeWallet(identity: Identity): Promise<string | undefined> {
    if (identity.source !== "privy" || !this.client) return undefined;
    const user = await this.client.users()._get(identity.id);
    if (user.id !== identity.id) throw new AuthError("Privy user record did not match the verified identity");
    return arcadeWalletFromUser(user);
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
      return { id: `local-demo:${name}`, isAdmin: name === "admin", source: "local-demo" };
    }

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
