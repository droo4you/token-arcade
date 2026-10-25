import { createRequire } from "node:module";
import type { GameRules, GameVerifier } from "../../../packages/sdk/src/index.ts";
import { loadSkipSim, decodeSkipInput, skipSeed, SKIP_HAND_X, SKIP_HAND_ALT, SKIP_MAX_TICKS } from "./skipVerification.ts";
import { createSeededReplayVerifier } from "./seededReplay.ts";
import type { AcceptedResult } from "./store.ts";

export type SkipBoard = "open" | "zero" | "mid" | "max";
type Gear = { up: Record<string, number>; rock: number; rocks: number; rank: number };
export const skipRules = createRequire(import.meta.url)("../../../cartridges/skip-to-10k/releases/1.1.0/src/rules.js") as {
  FORMAT: string; BOARDS: SkipBoard[]; RAID_BOARDS: SkipBoard[];
  loadout(board: string, saved?: unknown): Gear;
  metrics(r: Record<string, number>, gear: Gear): { score: number; distance: number; priceMultiplier: number; gwei: number };
};
export function skipBoardRules(board: unknown = "zero"): GameRules {
  if (!skipRules.BOARDS.includes(board as SkipBoard)) throw new TypeError("Choose Open, Zero, Mid or Max");
  return { board: board as string, format: skipRules.FORMAT };
}
export const SKIP_RAID_RULES: GameRules = { board: "triathlon", format: skipRules.FORMAT };

/** A raid ranks completed Zero/Mid/Max sets; the last run anchors its aggregate row. */
export function skipRaidResults(results: AcceptedResult[]): AcceptedResult[] {
  const players = new Map<string, Map<string, AcceptedResult>>();
  for (const item of results) {
    const board = String(item.result.rules?.board);
    if (!skipRules.RAID_BOARDS.includes(board as SkipBoard)) continue;
    const group = players.get(item.playerId) ?? new Map<string, AcceptedResult>();
    group.set(board, item); players.set(item.playerId, group);
  }
  return [...players.values()].filter(group => group.size === 3).map(group => {
    const runs = [...group.values()].sort((a, b) => a.acceptedAt.localeCompare(b.acceptedAt) || a.result.runId.localeCompare(b.result.runId));
    const last = runs[2];
    const sum = (key: string) => runs.reduce((n, r) => n + (r.result.secondaryMetrics?.[key] ?? 0), 0);
    return { ...last, result: { ...last.result, primaryMetric: runs.reduce((n, r) => n + r.result.primaryMetric, 0),
      secondaryMetrics: { distance: sum("distance"), gwei: sum("gwei"), peak: Math.max(...runs.map(r => r.result.secondaryMetrics?.peak ?? 0)), completedSkips: 3 } } };
  });
}

export function createSkipBoardsVerifier(gameId = "skip-to-10k"): GameVerifier {
  return { gameId, async verify(config, result) {
    const board = config.rules?.board;
    if (config.rules?.format !== skipRules.FORMAT || !skipRules.BOARDS.includes(board as SkipBoard) ||
        (config.mode === "raid" && !skipRules.RAID_BOARDS.includes(board as SkipBoard))) return { valid: false, reason: "Invalid Skip board rules" };
    const verifier = createSeededReplayVerifier<{ angle: number; power: number; input: string; gear: Gear }>(gameId, {
      label: "Skip to 10K", gameVersion: "1.1.0", objectives: ["score"], tickMs: 1000 / 120,
      maxTicks: SKIP_MAX_TICKS, deriveSeed: skipSeed,
      checkedSecondary: ["distance", "peak", "priceMultiplier", "gwei", "skips", "perfects", "bestStreak", "gems", "elapsedMs"],
      decodeProof(proof) {
        if (!proof || typeof proof !== "object" || Array.isArray(proof)) return "Missing Skip replay";
        const p = proof as Record<string, unknown>;
        if (p.v !== 2 || p.board !== board || !Number.isSafeInteger(p.seed) ||
            typeof p.angle !== "number" || !Number.isFinite(p.angle) || p.angle < -5 || p.angle > 60 ||
            typeof p.power !== "number" || !Number.isFinite(p.power) || p.power < .45 || p.power > 1 ||
            typeof p.input !== "string" || p.input.length < 1 || p.input.length > SKIP_MAX_TICKS || !/^[0-O]+$/.test(p.input)) return "Invalid Skip replay";
        for (const c of p.input) if (((c.charCodeAt(0) - 48) & 3) === 3) return "Invalid tilt";
        let gear: Gear;
        try {
          gear = skipRules.loadout(String(board), p.gear);
          if (JSON.stringify(gear) !== JSON.stringify(p.gear)) return "Loadout does not match this board";
        } catch { return "Invalid Open loadout"; }
        return { seed: Number(p.seed) >>> 0, proof: { angle: p.angle, power: p.power, input: p.input, gear } };
      },
      simulate(seed, proof, deadline) {
        const sim = loadSkipSim("1.1.0");
        const run = sim.newRun(proof.gear.up, seed, true);
        sim.throwRock(run, proof.angle, proof.power, SKIP_HAND_X); run.alt = SKIP_HAND_ALT;
        let trailing = 0;
        for (let i = 0; i < proof.input.length; i++) {
          if (run.phase === "done" && ++trailing > 12) return "Replay continues after the run ended";
          if ((i & 1023) === 0 && Date.now() > deadline) return "Replay timed out";
          sim.step(run, decodeSkipInput(proof.input.charCodeAt(i) - 48));
        }
        const r = sim.results(run), m = skipRules.metrics(r, proof.gear);
        return { finished: run.phase === "done", ticks: proof.input.length, score: m.score,
          secondary: { distance: m.distance, priceMultiplier: m.priceMultiplier, gwei: m.gwei, peak: r.peak, skips: r.skips,
            perfects: r.perfects, bestStreak: r.bestStreak, gems: r.gems, elapsedMs: Math.round(run.t * 1000) } };
      },
    });
    return verifier.verify(config, result);
  } };
}
