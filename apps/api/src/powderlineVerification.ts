import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import type { GameVerifier } from "../../../packages/sdk/src/index.ts";
import { createSeededReplayVerifier } from "./seededReplay.ts";

/** Powderline 1.0.0: one character per 60 Hz tick. The frozen sim is the referee. */
const SOURCE = readFileSync(new URL("../../../cartridges/powderline/releases/1.0.0/src/sim.js", import.meta.url), "utf8");
const script = new Script(`${SOURCE}\n;globalThis.__sim = globalThis.PLSim;`, { filename: "powderline-sim-1.0.0.js" });

type SimState = { over: boolean; tick: number; seed: number };
type SimResult = {
  score: number; distance: number; trickPoints: number; bestCombo: number; crashes: number; boosts: number; ticks: number; finished: boolean;
};
type Sim = {
  RULES_VERSION: string;
  RULESET: string;
  ALPHA: string;
  C: { MAX_TICKS: number };
  issuedSeed(value: string): number;
  create(seed: number): SimState;
  step(state: SimState, code: number): void;
  result(state: SimState): SimResult;
};

export function loadPowderlineSim(): Sim {
  const context = createContext({ Math });
  script.runInContext(context, { timeout: 1_000 });
  return (context as unknown as { __sim: Sim }).__sim;
}

const sim = loadPowderlineSim();
export const POWDERLINE_VERSION = "1.0.0";
export const POWDERLINE_RULESET = "powderline-v1";
export const powderlineSeed = (issued: string): number => sim.issuedSeed(String(issued));
const MAX_TICKS = sim.C.MAX_TICKS;
const INPUT_RE = /^[0-9A-T]+$/;

export function createPowderlineVerifier(gameId = "powderline"): GameVerifier {
  return createSeededReplayVerifier<string>(gameId, {
    label: "Powderline",
    gameVersion: POWDERLINE_VERSION,
    objectives: ["score"],
    tickMs: 1000 / 60,
    maxTicks: MAX_TICKS,
    deriveSeed: powderlineSeed,
    checkedSecondary: ["distance", "trickPoints", "bestCombo", "crashes", "boosts", "ticks"],
    checkRules(config) {
      if (config.rules?.ruleset !== POWDERLINE_RULESET) return "Powderline session is not on ruleset powderline-v1";
    },
    decodeProof(proof) {
      if (!proof || typeof proof !== "object" || Array.isArray(proof)) return "Missing Powderline replay";
      const body = proof as Record<string, unknown>;
      if (body.v !== 1 || body.rules !== POWDERLINE_VERSION || body.ruleset !== POWDERLINE_RULESET || !Number.isSafeInteger(body.seed)) {
        return "Invalid Powderline replay record";
      }
      if (typeof body.input !== "string" || body.input.length < 1 || body.input.length > MAX_TICKS || !INPUT_RE.test(body.input)) {
        return "Invalid Powderline replay record";
      }
      return { seed: Number(body.seed) >>> 0, proof: body.input };
    },
    simulate(seed, input, deadline) {
      const live = loadPowderlineSim();
      const state = live.create(seed);
      for (let i = 0; i < input.length; i++) {
        if (state.over) return "Powderline input continues after the run ended";
        if ((i & 1023) === 0 && Date.now() > deadline) return "Powderline replay timed out";
        live.step(state, live.ALPHA.indexOf(input[i]));
      }
      const outcome = live.result(state);
      return {
        finished: state.over,
        ticks: state.tick,
        score: outcome.score,
        secondary: {
          distance: outcome.distance,
          trickPoints: outcome.trickPoints,
          bestCombo: outcome.bestCombo,
          crashes: outcome.crashes,
          boosts: outcome.boosts,
          ticks: outcome.ticks,
        },
      };
    },
  });
}
