import { readFileSync } from "node:fs";
import { Script, createContext } from "node:vm";
import type { GameVerifier } from "../../../packages/sdk/src/index.ts";
import { createSeededReplayVerifier } from "./seededReplay.ts";

/** Skrumpey Slide: deterministic 60 Hz sim.js; one input char per tick ('0'..'?' = 4 input bits). */
const simSource = readFileSync(new URL("../../../cartridges/skrumpey-slide/sim.js", import.meta.url), "utf8");
const simScript = new Script(`var module={exports:{}};${simSource}\n;globalThis.__sim=module.exports;`, { filename: "skrumpey-sim.js" });
type SimState = { over: boolean; tick: number };
type Sim = {
  create(seed: number): SimState; step(s: SimState, input: number): void;
  result(s: SimState, mode: string): Record<string, number | string | number[]>;
  dailySeed(value: string): number;
};
export function loadSkrumpeySim(): Sim {
  const context = createContext({ Math });
  simScript.runInContext(context, { timeout: 1_000 });
  return (context as unknown as { __sim: Sim }).__sim;
}
const seedSim = loadSkrumpeySim();
/** Issued opaque seed -> uint32 sim seed. The cartridge uses the same SIM.dailySeed(String(seed)). */
export const skrumpeySeed = (issued: string): number => seedSim.dailySeed(String(issued));

export const SKRUMPEY_MAX_TICKS = 60 * 60 * 10; // 10 minutes of sim; a full run is ~1-2 minutes
const INPUT_RE = /^[0-?]+$/;

export function createSkrumpeyVerifier(gameId = "skrumpey-slide"): GameVerifier {
  return createSeededReplayVerifier<string>(gameId, {
    label: "Skrumpey Slide", gameVersion: "1.0.0", objectives: ["score", "total_score"],
    tickMs: 1_000 / 60, maxTicks: SKRUMPEY_MAX_TICKS, deriveSeed: skrumpeySeed,
    checkedSecondary: ["distance", "bestCombo", "perfects", "collectibles", "kills", "hits", "falls", "rescued", "trainBest", "ticks"],
    decodeProof(proof) {
      if (!proof || typeof proof !== "object" || Array.isArray(proof)) return "Missing Skrumpey Slide replay";
      const p = proof as Record<string, unknown>;
      if (p.v !== 1 || !Number.isSafeInteger(p.seed) || typeof p.input !== "string" ||
          p.input.length < 1 || p.input.length > SKRUMPEY_MAX_TICKS || !INPUT_RE.test(p.input)) return "Invalid Skrumpey Slide replay record";
      return { seed: Number(p.seed) >>> 0, proof: p.input };
    },
    simulate(seed, input, deadline) {
      const sim = loadSkrumpeySim();
      const s = sim.create(seed);
      for (let i = 0; i < input.length; i++) {
        if (s.over) return "Skrumpey Slide input continues after the run ended";
        if ((i & 1023) === 0 && Date.now() > deadline) return "Skrumpey Slide replay timed out";
        sim.step(s, input.charCodeAt(i) - 48);
      }
      const r = sim.result(s, "verify") as Record<string, number>;
      return { finished: s.over, ticks: s.tick, score: r.score,
        secondary: { distance: r.distance, bestCombo: r.bestCombo, perfects: r.perfects, collectibles: r.gems, kills: r.kills,
          hits: r.hits, falls: r.falls, rescued: r.rescued, trainBest: r.trainBest, ticks: r.endTick } };
    },
  });
}
