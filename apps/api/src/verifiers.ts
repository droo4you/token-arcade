import type { GameRules, GameRunConfig, GameRunResult, GameVerifier } from "../../../packages/sdk/src/index.ts";
import { scoreWarmupProof, WARMUP_GAME_ID } from "../../../packages/sdk/src/warmup.ts";
import { createEmonadVerifier, createTwoPlacesVerifier } from "./gameVerification.ts";
import { createSkrumpeyVerifier } from "./skrumpeyVerification.ts";
import { createMoodVerifier } from "./moodVerification.ts";
import { createTwoPlacesBoardsVerifier, twoLevelRules } from "./twoPlacesBoards.ts";
import { createSkipVerifier, SKIP_LOADOUT } from "./skipVerification.ts";
import { createSkipBoardsVerifier, skipBoardRules } from "./skipBoards.ts";

/** Reviewed simulation verifiers are keyed by reusable adapter; sessions own Cabinet identity. */
export interface AdapterReadiness {
  /** Registry adapter key may be shared by independent Cabinet gameIds. */
  adapterId?: string;
  gameId: string;
  freePlaySmokeTest: boolean;
  verifier?: GameVerifier;
  /** Reviewed server-side competitive rules, copied into each ranked session. */
  rankedRules?: GameRules;
  /** Competitive run timeout, from 30 seconds to 24 hours. Defaults to two minutes. */
  runTimeoutMs?: number;
}

export function normalizeRunRules(value: unknown): GameRules {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Rules must be a small key/value object");
  const entries = Object.entries(value);
  if (entries.length > 16) throw new TypeError("Rules may have at most 16 keys");
  for (const [key, item] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/.test(key) ||
        !((typeof item === "string" && item.length <= 128) ||
          (typeof item === "number" && Number.isSafeInteger(item)) || typeof item === "boolean")) {
      throw new TypeError("Rules need short keys and string, safe integer, or boolean values");
    }
  }
  const normalized = Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b))) as GameRules;
  if (JSON.stringify(normalized).length > 1_024) throw new TypeError("Rules exceed 1,024 characters");
  return normalized;
}

export class AdapterRegistry {
  private readonly adapters = new Map<string, AdapterReadiness>();

  constructor() {
    this.register({ gameId: WARMUP_GAME_ID, freePlaySmokeTest: true, verifier: warmupVerifier });
    this.register({ adapterId: "buy-bounce", gameId: "emonad-cabinet", freePlaySmokeTest: true, verifier: createEmonadVerifier(), rankedRules: { viewportWidth: 390, viewportHeight: 844 }, runTimeoutMs: 600_000 });
    this.register({ adapterId: "mood-swings", gameId: "emonad-cabinet", freePlaySmokeTest: true, verifier: createMoodVerifier(), rankedRules: { viewportWidth: 390, viewportHeight: 844 }, runTimeoutMs: 600_000 });
    this.register({ adapterId: "two-places-v2", gameId: "two-places", freePlaySmokeTest: true, verifier: createTwoPlacesBoardsVerifier(), rankedRules: twoLevelRules(), runTimeoutMs: 600_000 });
    this.register({ adapterId: "two-places", gameId: "two-places", freePlaySmokeTest: true, verifier: createTwoPlacesVerifier(), rankedRules: { level: 0 }, runTimeoutMs: 600_000 });
    this.register({ adapterId: "skrumpey-slide", gameId: "skrumpey-slide", freePlaySmokeTest: true, verifier: createSkrumpeyVerifier(), runTimeoutMs: 900_000 });
    this.register({ adapterId: "skip-to-10k", gameId: "skip-to-10k", freePlaySmokeTest: true, verifier: createSkipVerifier(), rankedRules: { loadout: SKIP_LOADOUT }, runTimeoutMs: 1_200_000 });
    this.register({ adapterId: "skip-to-10k-v2", gameId: "skip-to-10k", freePlaySmokeTest: true, verifier: createSkipBoardsVerifier(), rankedRules: skipBoardRules(), runTimeoutMs: 1_200_000 });
  }

  register(readiness: AdapterReadiness): void {
    if (readiness.runTimeoutMs !== undefined && (!Number.isSafeInteger(readiness.runTimeoutMs) || readiness.runTimeoutMs < 30_000 || readiness.runTimeoutMs > 86_400_000)) {
      throw new RangeError("Run timeout must be 30 seconds to 24 hours");
    }
    this.adapters.set(readiness.adapterId ?? readiness.gameId, { ...readiness, ...(readiness.rankedRules ? { rankedRules: normalizeRunRules(readiness.rankedRules) } : {}) });
  }
  get(adapterId: string): AdapterReadiness | undefined { return this.adapters.get(adapterId); }
  keys(): string[] { return [...this.adapters.keys()]; }
}

const warmupVerifier: GameVerifier = {
  gameId: WARMUP_GAME_ID,
  async verify(config: GameRunConfig, result: GameRunResult) {
    if (!config.seed) return { valid: false, reason: "Missing issued seed" };
    const checked = scoreWarmupProof(config.seed, result.proof);
    if (!checked.valid) return { valid: false, reason: checked.reason };
    if (result.result !== "completed" || result.primaryMetric !== checked.score) {
      return { valid: false, reason: "Claimed result does not match replayed input" };
    }
    const elapsed = Date.now() - Date.parse(config.startedAt);
    const claimedElapsed = Date.parse(result.finishedAt) - Date.parse(result.startedAt);
    if (elapsed + 100 < checked.durationMs || Math.abs(claimedElapsed - checked.durationMs) > 2_000) {
      return { valid: false, reason: "Input proof timing does not match the issued session" };
    }
    return { valid: true };
  },
};
