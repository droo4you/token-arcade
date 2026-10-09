import type { GameRules, GameRunConfig, GameRunResult, GameVerifier } from "../../../packages/sdk/src/index.ts";
import { scoreWarmupProof, WARMUP_GAME_ID } from "../../../packages/sdk/src/warmup.ts";

/** Only reviewed adapters are registered here. External launch games remain pending. */
export interface AdapterReadiness {
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
  }

  register(readiness: AdapterReadiness): void {
    if (readiness.runTimeoutMs !== undefined && (!Number.isSafeInteger(readiness.runTimeoutMs) || readiness.runTimeoutMs < 30_000 || readiness.runTimeoutMs > 86_400_000)) {
      throw new RangeError("Run timeout must be 30 seconds to 24 hours");
    }
    this.adapters.set(readiness.gameId, { ...readiness, ...(readiness.rankedRules ? { rankedRules: normalizeRunRules(readiness.rankedRules) } : {}) });
  }
  get(adapterId: string): AdapterReadiness | undefined { return this.adapters.get(adapterId); }
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
