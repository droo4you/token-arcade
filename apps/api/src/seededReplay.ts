import type { GameRunConfig, GameRunResult, GameVerifier } from "../../../packages/sdk/src/index.ts";

/**
 * Reusable seeded-replay verifier. A game supplies:
 *  - how the opaque server-issued seed maps to its sim seed,
 *  - how to decode/validate its input-log proof,
 *  - a deterministic simulate(seed, inputs) that returns the final state.
 * The pattern enforces: issued seed, complete run (sim reached its end state, log fully consumed),
 * score + secondary metrics recomputed by the server, and wall-clock plausibility.
 * Reuse (replaying the same proof into another session) is blocked by the issued seed + one-shot
 * session consumption in the run API.
 */
export type Verdict = { valid: boolean; reason?: string };
export interface ReplayOutcome {
  finished: boolean;           // the sim reached its terminal state
  ticks: number;               // ticks simulated
  score: number;
  secondary: Record<string, number>;
}
export interface SeededReplaySpec<Proof> {
  label: string;
  gameVersion: string;
  objectives: readonly string[];
  tickMs: number;
  maxTicks: number;
  deriveSeed(issued: string): number;
  /** Return the decoded proof or a rejection reason. */
  decodeProof(proof: unknown): { seed: number; proof: Proof } | string;
  simulate(seed: number, proof: Proof, deadline: number): ReplayOutcome | string;
  /** Secondary metric keys that must match the replay exactly. */
  checkedSecondary: readonly string[];
  /** Optional reviewed-rules check (e.g. a locked loadout). */
  checkRules?(config: GameRunConfig): string | undefined;
  budgetMs?: number;
}

const reject = (reason: string): Verdict => ({ valid: false, reason });

export function createSeededReplayVerifier<Proof>(gameId: string, spec: SeededReplaySpec<Proof>): GameVerifier {
  return {
    gameId,
    async verify(config: GameRunConfig, result: GameRunResult): Promise<Verdict> {
      if (config.gameVersion !== spec.gameVersion || !config.seed || result.result !== "completed" ||
          !spec.objectives.includes(result.objective)) return reject(`This session cannot score a ${spec.label} run`);
      const ruleProblem = spec.checkRules?.(config);
      if (ruleProblem) return reject(ruleProblem);
      const decoded = spec.decodeProof(result.proof);
      if (typeof decoded === "string") return reject(decoded);
      if (decoded.seed !== spec.deriveSeed(config.seed)) return reject(`${spec.label} replay was not played on the issued seed`);
      let outcome: ReplayOutcome | string;
      try { outcome = spec.simulate(decoded.seed, decoded.proof, Date.now() + (spec.budgetMs ?? 5_000)); }
      catch { return reject(`${spec.label} replay could not be simulated`); }
      if (typeof outcome === "string") return reject(outcome);
      if (!outcome.finished) return reject(`${spec.label} replay ended before the run was over`);
      if (outcome.ticks < 1 || outcome.ticks > spec.maxTicks) return reject(`${spec.label} replay length is out of range`);
      if (result.primaryMetric !== outcome.score) return reject(`${spec.label} score does not match the replay`);
      const secondary = result.secondaryMetrics ?? {};
      for (const key of spec.checkedSecondary) {
        if (secondary[key] !== outcome.secondary[key]) return reject(`${spec.label} run details do not match the replay (${key})`);
      }
      const simulatedMs = outcome.ticks * spec.tickMs;
      if (Date.parse(result.finishedAt) - Date.parse(config.startedAt) + 2_000 < simulatedMs ||
          Date.now() - Date.parse(config.startedAt) + 2_000 < simulatedMs) {
        return reject("Replay duration exceeds the issued session time");
      }
      return { valid: true };
    },
  };
}
