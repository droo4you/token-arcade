import { createRequire } from "node:module";
import type { GameVerifier } from "../../../packages/sdk/src/index.ts";

export interface MoodState {
  shown: boolean; steps: number; peakMood: number; vibes: number;
  bounces: number; bestStreak: number; euphorias: number;
}
export const moodSim = createRequire(import.meta.url)("../../../cartridges/emonad-cabinet/releases/2.0.0/sim.js") as {
  VERSION: string; MAX_STEPS: number;
  create(seed: string): { state: MoodState; tick(input: number): MoodState };
  metrics(state: MoodState): { primaryMetric: number; secondaryMetrics: Record<string, number> };
  encode(inputs: number[]): string;
  decode(track: unknown, steps: unknown): number[];
};
export function createMoodVerifier(gameId = "emonad-cabinet"): GameVerifier {
  return { gameId, async verify(config, result) {
    const no = (reason: string) => ({ valid: false, reason });
    if (config.gameVersion !== moodSim.VERSION || !config.seed || result.objective !== "score" || result.result !== "completed" ||
        config.rules?.viewportWidth !== 390 || config.rules?.viewportHeight !== 844) return no("Mood Swings requires its issued version, seed and playfield");
    const p = result.proof as { v?: unknown; seed?: unknown; track?: unknown; steps?: unknown } | undefined;
    if (!p || p.v !== 1 || p.seed !== config.seed) return no("Invalid Mood Swings input proof");
    let inputs: number[];
    try { inputs = moodSim.decode(p.track, p.steps); } catch { return no("Invalid Mood Swings input track"); }
    const run = moodSim.create(config.seed);
    for (const input of inputs) {
      if (run.state.shown) return no("Input continues after the run ended");
      run.tick(input);
    }
    if (!run.state.shown) return no("The run did not finish");
    const expected = moodSim.metrics(run.state);
    if (result.primaryMetric !== expected.primaryMetric || Object.entries(expected.secondaryMetrics).some(([key, n]) => result.secondaryMetrics?.[key] !== n)) return no("Mood or Good Vibes do not match the replay");
    const ms = run.state.steps * 1000 / 120;
    if (Date.parse(result.finishedAt) - Date.parse(config.startedAt) + 2000 < ms || Date.now() - Date.parse(config.startedAt) + 2000 < ms) return no("Replay exceeds the issued session time");
    return { valid: true };
  } };
}
