import { readFileSync } from "node:fs";
import { Script, createContext } from "node:vm";
import type { GameVerifier } from "../../../packages/sdk/src/index.ts";
import { createSeededReplayVerifier } from "./seededReplay.ts";

/**
 * Skrumpey Slide: deterministic 60 Hz sim.js; one input char per tick ('0'..'?' = 4 input bits).
 * Each rules version is replayed with its own frozen sim, so a run only ever scores against the
 * version its session was issued for, and boards (filtered by gameVersion) never mix versions.
 *  - 1.0.0: original single 230 m lane sprint (frozen copy in ./legacy).
 *  - 1.1.0: three-stage lane sprint with rising speed/density and new patterns (current cartridge sim.js).
 */
const SIM_SOURCES: Record<string, URL> = {
  "1.0.0": new URL("./legacy/skrumpey-sim-1.0.0.js", import.meta.url),
  "1.1.0": new URL("../../../cartridges/skrumpey-slide/releases/1.1.0/sim.js", import.meta.url),
};
export const SKRUMPEY_CURRENT_VERSION = "1.1.0";
export const SKRUMPEY_VERSIONS = Object.keys(SIM_SOURCES);
const scripts = new Map<string, Script>();
function simScript(version: string): Script {
  let script = scripts.get(version);
  if (!script) {
    const source = readFileSync(SIM_SOURCES[version], "utf8");
    script = new Script(`var module={exports:{}};${source}\n;globalThis.__sim=module.exports;`, { filename: `skrumpey-sim-${version}.js` });
    scripts.set(version, script);
  }
  return script;
}
type SimState = { over: boolean; tick: number };
type Sim = {
  RULES_VERSION?: string;
  create(seed: number): SimState; step(s: SimState, input: number): void;
  result(s: SimState, mode: string): Record<string, number | string | number[]>;
  dailySeed(value: string): number;
};
export function loadSkrumpeySim(version = SKRUMPEY_CURRENT_VERSION): Sim {
  if (!SIM_SOURCES[version]) throw new Error(`Unknown Skrumpey Slide rules version ${version}`);
  const context = createContext({ Math });
  simScript(version).runInContext(context, { timeout: 1_000 });
  return (context as unknown as { __sim: Sim }).__sim;
}
const seedSim = loadSkrumpeySim();
/** Issued opaque seed -> uint32 sim seed. The cartridge uses the same SIM.dailySeed(String(seed)); unchanged across versions. */
export const skrumpeySeed = (issued: string): number => seedSim.dailySeed(String(issued));

export const SKRUMPEY_MAX_TICKS = 60 * 60 * 10; // 10 minutes of sim; a full run is ~1-1.5 minutes
const INPUT_RE = /^[0-?]+$/;

function versionVerifier(gameId: string, version: string): GameVerifier {
  return createSeededReplayVerifier<string>(gameId, {
    label: "Skrumpey Slide", gameVersion: version, objectives: ["score", "total_score"],
    tickMs: 1_000 / 60, maxTicks: SKRUMPEY_MAX_TICKS, deriveSeed: skrumpeySeed,
    checkedSecondary: ["distance", "bestCombo", "perfects", "collectibles", "kills", "hits", "falls", "rescued", "trainBest", "ticks"],
    decodeProof(proof) {
      if (!proof || typeof proof !== "object" || Array.isArray(proof)) return "Missing Skrumpey Slide replay";
      const p = proof as Record<string, unknown>;
      if (p.v !== 1 || !Number.isSafeInteger(p.seed) || typeof p.input !== "string" ||
          p.input.length < 1 || p.input.length > SKRUMPEY_MAX_TICKS || !INPUT_RE.test(p.input)) return "Invalid Skrumpey Slide replay record";
      // 1.1.0+ cartridges stamp their rules version; it must match the session's version.
      const rules = p.rules === undefined ? "1.0.0" : p.rules;
      if (rules !== version) return `Skrumpey Slide replay uses rules ${String(rules)}, but this session is ${version}`;
      return { seed: Number(p.seed) >>> 0, proof: p.input };
    },
    simulate(seed, input, deadline) {
      const sim = loadSkrumpeySim(version);
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

export function createSkrumpeyVerifier(gameId = "skrumpey-slide"): GameVerifier {
  const byVersion = new Map(SKRUMPEY_VERSIONS.map((v) => [v, versionVerifier(gameId, v)]));
  const current = byVersion.get(SKRUMPEY_CURRENT_VERSION)!;
  return {
    gameId,
    async verify(config, result) {
      // Unknown versions fall through to the current verifier, which rejects them on gameVersion.
      return (byVersion.get(config.gameVersion) ?? current).verify(config, result);
    },
  };
}
