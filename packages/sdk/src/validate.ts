import type { GameRunConfig, GameRunResult } from "./index.ts";

export function validateRunResultShape(config: GameRunConfig, candidate: unknown): { valid: true; result: GameRunResult } | { valid: false; reason: string } {
  if (!candidate || typeof candidate !== "object") return { valid: false, reason: "Run result is missing" };
  const result = candidate as Partial<GameRunResult>;
  if (result.gameId !== config.gameId || result.gameVersion !== config.gameVersion || result.runId !== config.runId ||
      result.mode !== config.mode || result.objective !== config.objective ||
      result.seed !== config.seed || result.raidId !== config.raidId) {
    return { valid: false, reason: "Run result does not match the issued session" };
  }
  if (result.result !== "completed" && result.result !== "failed") return { valid: false, reason: "Invalid completion state" };
  if (typeof result.primaryMetric !== "number" || !Number.isFinite(result.primaryMetric)) return { valid: false, reason: "Invalid primary metric" };
  if (result.secondaryMetrics !== undefined) {
    if (!result.secondaryMetrics || typeof result.secondaryMetrics !== "object" || Array.isArray(result.secondaryMetrics) ||
        Object.values(result.secondaryMetrics).some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      return { valid: false, reason: "Invalid secondary metrics" };
    }
  }
  const start = Date.parse(result.startedAt ?? "");
  const finish = Date.parse(result.finishedAt ?? "");
  const issued = Date.parse(config.startedAt);
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start || start < issued - 5_000) {
    return { valid: false, reason: "Invalid run timestamps" };
  }
  if (config.expiresAt && finish > Date.parse(config.expiresAt) + 5_000) return { valid: false, reason: "Run expired" };
  return { valid: true, result: result as GameRunResult };
}
