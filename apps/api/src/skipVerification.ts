import { readFileSync } from "node:fs";
import { Script, createContext } from "node:vm";
import type { GameVerifier } from "../../../packages/sdk/src/index.ts";
import { createSeededReplayVerifier } from "./seededReplay.ts";

/** Skip to 10K: deterministic 120 Hz sim.js. Passport Play = issued seed + locked standard loadout. */
const source = readFileSync(new URL("../../../cartridges/skip-to-10k/src/sim.js", import.meta.url), "utf8");
const script = new Script(`var module={exports:{}};${source}\n;globalThis.__sim=module.exports;`, { filename: "skip-to-10k-sim.js" });
const v2Source = readFileSync(new URL("../../../cartridges/skip-to-10k/releases/1.1.0/src/sim.js", import.meta.url), "utf8");
const v2Script = new Script(`var module={exports:{}};${v2Source}\n;globalThis.__sim=module.exports;`, { filename: "skip-to-10k-1.1.0.js" });
type Run = { seed: number; phase: string; t: number; alt: number };
type Sim = {
  DT: number; STANDARD_LOADOUT: object; issuedSeed(v: string): number;
  newRun(up: object, seed: number, balanceV2?: boolean): Run; throwRock(run: Run, angle: number, power: number, x: number): void;
  step(run: Run, input: { tilt: number; skip: boolean; bounce: boolean; rc: boolean }): void;
  results(run: Run): Record<string, number>;
};
export function loadSkipSim(version = "1.0.0"): Sim {
  const context = createContext({ Math, Date, Object, String });
  (version === "1.1.0" ? v2Script : script).runInContext(context, { timeout: 1_000 });
  return (context as unknown as { __sim: Sim }).__sim;
}
const seedSim = loadSkipSim();
export const skipSeed = (issued: string): number => seedSim.issuedSeed(issued);
/** Must match cartridges/skip-to-10k/src/main.js: HAND_X = DOCK_END - 8, HAND_ALT = 38. */
export const SKIP_HAND_X = 32, SKIP_HAND_ALT = 38;
export const SKIP_LOADOUT = "standard-v1";
export const SKIP_MAX_TICKS = 120 * 905;
/** One rendered frame can step at most 0.1 s (12 ticks), so a few ticks may follow the end state. */
const MAX_TRAILING_TICKS = 12;
type SkipProof = { angle: number; power: number; input: string };

export function decodeSkipInput(code: number) {
  return { tilt: (code & 3) - 1, skip: (code & 4) !== 0, bounce: (code & 8) !== 0, rc: (code & 16) !== 0 };
}

export function createSkipVerifier(gameId = "skip-to-10k"): GameVerifier {
  return createSeededReplayVerifier<SkipProof>(gameId, {
    label: "Skip to 10K", gameVersion: "1.0.0", objectives: ["distance", "score"],
    tickMs: 1_000 / 120, maxTicks: SKIP_MAX_TICKS, deriveSeed: skipSeed,
    checkedSecondary: ["peak", "skips", "perfects", "bestStreak", "gems", "elapsedMs"],
    checkRules: (config) => config.rules?.loadout === SKIP_LOADOUT ? undefined : "Passport Play requires the standard loadout",
    decodeProof(proof) {
      if (!proof || typeof proof !== "object" || Array.isArray(proof)) return "Missing Skip to 10K replay";
      const p = proof as Record<string, unknown>;
      if (p.v !== 1 || p.loadout !== SKIP_LOADOUT || !Number.isSafeInteger(p.seed) ||
          typeof p.angle !== "number" || !Number.isFinite(p.angle) || p.angle < -5 || p.angle > 60 ||
          typeof p.power !== "number" || !Number.isFinite(p.power) || p.power < 0.45 || p.power > 1 ||
          typeof p.input !== "string" || p.input.length < 1 || p.input.length > SKIP_MAX_TICKS || !/^[0-O]+$/.test(p.input)) {
        return "Invalid Skip to 10K replay record";
      }
      for (let i = 0; i < p.input.length; i++) if (((p.input.charCodeAt(i) - 48) & 3) === 3) return "Invalid Skip to 10K tilt input";
      return { seed: Number(p.seed) >>> 0, proof: { angle: p.angle, power: p.power, input: p.input } };
    },
    simulate(seed, proof, deadline) {
      const sim = loadSkipSim();
      const run = sim.newRun(sim.STANDARD_LOADOUT, seed);
      sim.throwRock(run, proof.angle, proof.power, SKIP_HAND_X);
      run.alt = SKIP_HAND_ALT;
      let trailing = 0;
      for (let i = 0; i < proof.input.length; i++) {
        if (run.phase === "done" && ++trailing > MAX_TRAILING_TICKS) return "Skip to 10K input continues after the run ended";
        if ((i & 1023) === 0 && Date.now() > deadline) return "Skip to 10K replay timed out";
        sim.step(run, decodeSkipInput(proof.input.charCodeAt(i) - 48));
      }
      const r = sim.results(run);
      return { finished: run.phase === "done", ticks: proof.input.length, score: r.days,
        secondary: { peak: r.peak, skips: r.skips, perfects: r.perfects, bestStreak: r.bestStreak, gems: r.gems, elapsedMs: Math.round(run.t * 1000) } };
    },
  });
}
