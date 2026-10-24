export type GameMode = "free" | "ranked" | "raid";
export type GameObjective =
  | "score"
  | "total_score"
  | "distance"
  | "destruction"
  | "completion_time"
  | "stars"
  | "guesses"
  /** Coindle Rapid Fire: coins solved in the window; tie-break fewer secondaryMetrics.guesses. */
  | "coins_solved";

/** Small server-issued rule set; each game verifier defines the meaning of its keys. */
export type GameRules = Record<string, string | number | boolean>;

/** Creator/reviewer agreed player-facing descriptions; never executable scoring rules. */
export interface GamePlayGuide {
  free: string;
  ranked?: string;
  raid?: string;
  scoring?: string;
  tieBreak?: string;
}

export interface GameManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  artwork?: string;
  developer: string;
  adapterId: string;
  supportedModes: GameMode[];
  playGuide?: GamePlayGuide;
  supportedObjectives: GameObjective[];
  communityOptional: boolean;
  minicoinOptional: boolean;
  /** Reusable gameplay identity; scores are always scoped to manifest.id. */
  skeletonId?: string;
  entry?: { kind: "iframe"; url: string; origin: string };
  presentation?: { genre: string; palette: "pink" | "cyan" | "violet" | "lime" | "ink"; glyph: string };
  controls?: { touch: boolean; orientation: "any" | "landscape" | "portrait" };
  verifier?: { kind: "session_checks" | "server_authoritative" | "replay"; description: string };
}

export type CommunityAsset =
  | { id: string; name: string; type: "erc20"; chainId: number; address: string }
  | { id: string; name: string; type: "erc721"; chainId: number; address: string }
  | { id: string; name: string; type: "erc1155"; chainId: number; address: string; tokenId?: string };

export interface MinicoinAssociation {
  chainId: number;
  address: string;
  symbol: string;
  deploymentTx: string;
  experimental: true;
}

export interface GameRecord {
  manifest: GameManifest;
  status: "draft" | "submitted" | "approved" | "rejected" | "published" | "paused";
  creatorId?: string;
  submission?: { sourceUrl: string; preparation: "help" | "agent"; requestedModes: GameMode[]; playGuide?: GamePlayGuide; configuredAt?: string; configuredBy?: string };
  submittedAt?: string;
  /** Internal migration marker for the curated initial import only. */
  legacyImportRevision?: number;
  review?: {
    validation?: { builds: boolean; mounts: boolean; destroys: boolean; resultSchema: boolean; mobile: boolean; sourceReviewed: boolean; reviewedAt: string; reviewedBy: string; notes?: string };
    approvedAt?: string;
    approvedBy?: string;
    rejectedAt?: string;
    rejectedBy?: string;
    note?: string;
  };
  /** Descriptive association only. Never used for ownership or economic execution. */
  communityConcept?: { name: string; type: "erc20" | "erc721" | "concept"; address?: string; chainId?: number; verification: "unverified" | "verified"; description?: string };
  economy?: { status: "coming_soon" | "pending" | "enabled"; reason: string };
  community?: CommunityAsset;
  communityStrategy?: string;
  minicoin?: MinicoinAssociation;
  createdAt: string;
  publishedAt?: string;
}

export interface GameRunConfig {
  runId: string;
  gameId: string;
  gameVersion: string;
  mode: GameMode;
  objective: GameObjective;
  seed?: string;
  raidId?: string;
  maxAttempts?: number;
  rules?: GameRules;
  startedAt: string;
  expiresAt?: string;
}

export interface GameRunResult {
  gameId: string;
  gameVersion: string;
  runId: string;
  mode: GameMode;
  raidId?: string;
  seed?: string;
  objective: GameObjective;
  primaryMetric: number;
  secondaryMetrics?: Record<string, number>;
  result: "completed" | "failed";
  startedAt: string;
  finishedAt: string;
  /** Game-specific replay/input data. The server verifier must validate it. */
  proof?: unknown;
  /** Added by the API from the issued session after verification. */
  rules?: GameRules;
}

/** Unverified Free Play observation, never an input to competitive verification. */
export interface FreePlayLifecycleEvent {
  type: "started" | "exited";
  run: GameRunConfig;
  context?: Record<string, number>;
  reason?: "navigation" | "restart" | "pagehide" | "error";
}

export interface TokenArcadeGame {
  mount(container: HTMLElement, config: GameRunConfig): void | Promise<void>;
  start(): void;
  pause(): void;
  resume(): void;
  restart(): void;
  destroy(): void;
  onRunComplete(callback: (result: GameRunResult) => void): () => void;
}

export interface GameVerifier {
  gameId: string;
  verify(config: GameRunConfig, result: GameRunResult): Promise<{ valid: boolean; reason?: string }>;
}

export interface Raid {
  funding?: { chainId: 10143; vault: string; chainRaidId: string; rulesHash: string; gameVersion: string; prizeWei: string; payoutMode?: "automatic" };
  payout?: { status: "pending" | "submitted" | "paid" | "attention"; transactionHash?: string };
  id: string;
  name: string;
  gameId: string;
  communityId: string;
  objective: GameObjective;
  seed: string;
  startsAt: string;
  endsAt: string;
  maxAttempts: number;
  rules?: GameRules;
  entry?: { asset: string; amount: string };
  reward:
    | { type: "none" }
    | { type: "erc721" | "erc20" | "native"; asset: string; tokenId?: string; amount?: string; custodyTx?: string };
  feeSplitBps: { prize: number; community: number; treasury: number };
  status: "draft" | "open" | "closed" | "settled" | "cancelled";
  finalResult?: {
    finalizedAt: string;
    entries: RaidStanding[];
  };
}

export interface RaidStanding {
  rank: number;
  playerId: string;
  displayName: string;
  primaryMetric: number;
  objective: GameObjective;
  finishedAt: string;
  runId: string;
  secondaryMetrics?: Record<string, number>;
}

export interface Passport {
  playerId: string;
  displayName: string;
  avatarUrl?: string;
  arcadeWallet?: string;
  ownershipWallets: string[];
  gamesPlayed: number;
  rankedRuns: number;
  raidsEntered: number;
  bestScores: Record<string, number>;
  wins: number;
  communities: string[];
}
